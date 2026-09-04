import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { logFormSubmitted } from "@/lib/compliance";

/** Extract a client IP from common proxy headers; falls back to null. */
function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || null;
  return request.headers.get("x-real-ip");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATE_RE = /^[A-Za-z]{2}$/;

/**
 * POST /api/consumer-inquiry — consumer inquiries route into the OWNER's
 * private pipeline (Mode-1 "owner private seat"). Distinct from the B2B
 * "Request Access" flow (which stays source='request_access' for partner
 * onboarding): these rows are tagged source='consumer_inquiry' AND
 * owner_only=TRUE so partner/tenant views can always exclude them.
 *
 * Compliance: this is an inquiry form, not a consumer consent capture —
 * tcpa_consent stays FALSE (no consent is claimed here; the /book form is
 * where express consent is captured). An audit form_submitted event with
 * funnel attribution is always written. FAIL-CLOSED on name/email.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

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

  try {
    const result = await pool.query(
      `INSERT INTO leads (first_name, last_name, email, phone, state, status, source, tcpa_consent, owner_only)
       VALUES ($1, $2, $3, $4, $5, 'new', 'consumer_inquiry', FALSE, TRUE)
       RETURNING id, first_name, last_name, email, phone, state, status, source, owner_only, created_at`,
      [first_name, last_name, email.trim(), phoneValue, stateValue]
    );

    const leadId = result.rows[0].id as string;

    try {
      await logFormSubmitted({
        lead_id: leadId,
        event_data: {
          funnel: "consumer_inquiry",
          source: "consumer_inquiry",
          owner_pipeline: true,
          has_phone: Boolean(phoneValue),
        },
        ip_address: clientIp(request),
        user_agent: request.headers.get("user-agent"),
      });
    } catch (auditErr) {
      // The lead was still created; audit-write failure must not break the
      // form, but it is logged so a missing audit row is never silent.
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