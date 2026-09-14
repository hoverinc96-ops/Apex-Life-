import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  captureEnabled,
  logFormSubmitted,
  recordConsent,
  type ComplianceChannel,
} from "@/lib/compliance";

/** Extract a client IP from common proxy headers; falls back to null. */
function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || null;
  return request.headers.get("x-real-ip");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATE_RE = /^[A-Za-z]{2}$/;

/**
 * Verbatim, versioned consent disclosure — compliance verdict 06 §1.3, frozen
 * as v1. The consumer agrees to this exact text on the inquiry form; the same
 * string is stored on every compliance_consent_records row and in the audit
 * form_submitted event. Any future wording change must bump the version.
 */
const CONSUMER_INQUIRY_CONSENT_TEXT =
  "I agree Apex Life AI may contact me by email, phone, or SMS about life insurance options based on this inquiry. I understand this is not an application: it doesn't create a policy, isn't a promise of coverage, and doesn't guarantee any rate. I can change my mind and ask you to stop anytime.";
const CONSUMER_INQUIRY_CONSENT_VERSION = "v1";

/** Every channel the consent disclosure names — one register row each. */
const CONSENT_CHANNELS: ComplianceChannel[] = [
  "tcpa_email",
  "tcpa_voice",
  "tcpa_sms",
];

/** Optional & lenient: trimmed string capped at `max`, else null (never ""). */
function optionalString(v: unknown, max = 64): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s.length > 0 ? s : null;
}

/** Optional & lenient: strict boolean only (a "false" string is ignored). */
function optionalBoolean(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** Optional & lenient: finite number > 0, else null. */
function optionalPositiveNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** Optional & lenient: positive integer (e.g. term length in years). */
function optionalPositiveInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * POST /api/consumer-inquiry — consumer inquiries route into the OWNER's
 * private pipeline (Mode-1 "owner private seat"). Distinct from the B2B
 * "Request Access" flow (which stays source='request_access' for partner
 * onboarding): these rows are tagged source='consumer_inquiry' AND
 * owner_only=TRUE so partner/tenant views can always exclude them.
 *
 * Compliance (verdict 06, Variant A — binding): this IS a consumer consent
 * capture. Fail-closed in strict order:
 *   1. CAPTURE_ENABLED gate (C13) — off ⇒ 503, no row is ever written.
 *   2. consent_contact must be exactly true — otherwise 400, no row written.
 *   3. INSERT with tcpa_consent=TRUE + tcpa_consent_date=CURRENT_TIMESTAMP.
 *   4. recordConsent() once per channel (tcpa_email, tcpa_voice, tcpa_sms)
 *      with the verbatim v1 text, the frozen form snapshot, and funnel
 *      attribution. If any channel fails to register, the lead row is rolled
 *      back — never leave a lead marked consensual without its consent records.
 *   5. form_submitted audit event carries consent:true, the versioned text,
 *      and dnc_matched (fresh inbound consent overrides DNC, but the audit
 *      never stays silent about a match).
 *
 * All qualifier fields (age_range, term_years, tobacco_use,
 * coverage_amount_requested, health_status, monthly_budget,
 * coverage_preference, policy_preference) are optional & lenient: unknown keys
 * are ignored, wrong-typed values are dropped, nulls persist as NULL (never
 * empty strings). Fail-closed stays on name/email only (unchanged), plus the
 * consent gate above.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // 1. Consent-capture gate (compliance lib C13). If capture is off we must
  // not insert a tcpa_consent=TRUE row that cannot be registered in the vault.
  if (!captureEnabled()) {
    return NextResponse.json(
      { error: "Contact consent capture is unavailable. Please try again later." },
      { status: 503 }
    );
  }

  // 2. Fail-closed on explicit contact consent (Variant A). Missing or false
  // ⇒ no row is written at all.
  if (body.consent_contact !== true) {
    return NextResponse.json(
      { error: "Please agree to be contacted about this inquiry." },
      { status: 400 }
    );
  }

  // 3. Existing fail-closed identity checks (unchanged from the prior route).
  const { name, email, phone, state } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json(
      { error: "Please provide your full name." },
      { status: 400 }
    );
  }
  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json(
      { error: "Please provide a valid email address." },
      { status: 400 }
    );
  }
  let stateValue: string | null = null;
  if (state && typeof state === "string" && state.trim()) {
    if (!STATE_RE.test(state.trim())) {
      return NextResponse.json(
        { error: "Please provide a valid 2-letter state (e.g. TX)." },
        { status: 400 }
      );
    }
    stateValue = state.trim().toUpperCase();
  }

  const parts = name.trim().split(/\s+/);
  const first_name = parts[0];
  const last_name = parts.slice(1).join(" ") || "";

  const phoneValue =
    typeof phone === "string" && phone.trim() ? phone.trim() : "";

  // 4. Lenient qualifiers — all optional; nulls persist as NULL.
  const ageRange = optionalString(body.age_range, 10);
  const termYears = optionalPositiveInt(body.term_years);
  const tobaccoUser = optionalBoolean(body.tobacco_use);
  const coverageAmount = optionalPositiveNumber(body.coverage_amount_requested);

  const healthNotes: Record<string, unknown> = {};
  const healthStatus = optionalString(body.health_status);
  if (healthStatus) healthNotes.health_status = healthStatus;
  const monthlyBudget = optionalString(body.monthly_budget);
  if (monthlyBudget) healthNotes.monthly_budget = monthlyBudget;
  const coveragePreference = optionalString(body.coverage_preference);
  if (coveragePreference) healthNotes.coverage_preference = coveragePreference;
  const policyPreference = optionalString(body.policy_preference);
  if (policyPreference) healthNotes.policy_preference = policyPreference;

  const ipAddress = clientIp(request);
  const userAgent = request.headers.get("user-agent");

  // Frozen review-screen snapshot (qualifiers + contact, exactly as displayed)
  // — stored verbatim on each consent record per verdict 06 §1.2.
  const formSnapshot = {
    name: name.trim(),
    email: email.trim(),
    phone: phoneValue || null,
    state: stateValue,
    age_range: ageRange,
    term_years: termYears,
    tobacco_use: tobaccoUser,
    coverage_amount_requested: coverageAmount,
    health_status: healthStatus,
    monthly_budget: monthlyBudget,
    coverage_preference: coveragePreference,
    policy_preference: policyPreference,
  };

  try {
    const result = await pool.query(
      `INSERT INTO leads (
         first_name, last_name, email, phone, state, status, source, owner_only,
         tobacco_user, coverage_amount_requested, health_notes, age_range, term_years,
         tcpa_consent, tcpa_consent_date
       ) VALUES (
         $1, $2, $3, $4, $5, 'new', 'consumer_inquiry', TRUE,
         $6, $7, $8, $9, $10,
         TRUE, CURRENT_TIMESTAMP
       )
       RETURNING id, first_name, last_name, email, phone, state, status, source, owner_only,
                 tobacco_user, coverage_amount_requested, health_notes, age_range, term_years,
                 tcpa_consent, tcpa_consent_date, created_at`,
      [
        first_name,
        last_name,
        email.trim(),
        phoneValue,
        stateValue,
        tobaccoUser,
        coverageAmount,
        JSON.stringify(healthNotes),
        ageRange,
        termYears,
      ]
    );

    const leadRow = result.rows[0] as { id: string };
    const leadId = leadRow.id;

    // 5. Register the consent — one vault row + consent_granted audit event
    // per channel (recordConsent is the only sanctioned vault writer). If ANY
    // channel fails, roll the lead back: a consensual lead with no register
    // row is the exact failure mode the gate above exists to prevent.
    try {
      for (const channel of CONSENT_CHANNELS) {
        await recordConsent({
          lead_id: leadId,
          channel,
          consent_text: CONSUMER_INQUIRY_CONSENT_TEXT,
          consent_text_version: CONSUMER_INQUIRY_CONSENT_VERSION,
          form_snapshot: formSnapshot,
          ip_address: ipAddress,
          user_agent: userAgent,
          funnel_id: "consumer_inquiry",
        });
      }
    } catch (consentErr) {
      console.error(
        "POST /api/consumer-inquiry consent registration error:",
        consentErr
      );
      await pool
        .query(`DELETE FROM leads WHERE id = $1`, [leadId])
        .catch((delErr) => {
          console.error(
            "POST /api/consumer-inquiry compensating lead delete error:",
            delErr
          );
        });
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }

    // 6. DNC-sensitivity check for the audit trail: fresh inbound consent
    // still records (outbound isn't live), but the audit notes the match so
    // nothing is ever silent — mirrors POST /api/bookings.
    let dncMatched = false;
    try {
      const dnc = await pool.query(
        `SELECT id FROM compliance_dnc_list
         WHERE email ILIKE $1 OR ($2::text IS NOT NULL AND phone = $2)
         LIMIT 1`,
        [email.trim(), phoneValue || null]
      );
      dncMatched = dnc.rows.length > 0;
    } catch {
      dncMatched = false; // vault query best-effort; the lead still stands
    }

    // 7. Audit (best-effort, existing semantics: audit-write failure must not
    // break the form, but it is logged so a missing audit row is never silent).
    try {
      await logFormSubmitted({
        lead_id: leadId,
        event_data: {
          funnel: "consumer_inquiry",
          source: "consumer_inquiry",
          owner_pipeline: true,
          has_phone: Boolean(phoneValue),
          consent: true,
          consent_text: CONSUMER_INQUIRY_CONSENT_TEXT,
          consent_text_version: CONSUMER_INQUIRY_CONSENT_VERSION,
          dnc_matched: dncMatched,
        },
        ip_address: ipAddress,
        user_agent: userAgent,
      });
    } catch (auditErr) {
      console.error("POST /api/consumer-inquiry audit write error:", auditErr);
    }

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/consumer-inquiry error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}