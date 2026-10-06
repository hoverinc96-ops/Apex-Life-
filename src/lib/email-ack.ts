import pool from "@/lib/db";

/**
 * E2 — transactional acknowledgment email to /get-quote (consumer-inquiry)
 * submitters (traffic-starter-pack.md §6.3-2, §6.6 E2).
 *
 * PAGE-PROMISE CONTEXT (compliance verdict 2026-09-20, §6.3-2): the live page
 * tells submitters "We reach out by email either way" / "the email you'll
 * receive from us". That promise is ratified on the condition that every
 * submitter is emailed. This module is the send plumbing for that commitment.
 *
 * ⚠ COPY IS FROZEN — READ BEFORE TOUCHING THE TEMPLATE CONSTANTS BELOW.
 * The acknowledgment email is CONSUMER-FACING copy. Compliance has NOT yet
 * delivered an approved acknowledgment-email template: the 2026-09-20 verdict
 * approved the S8/S11 PAGE strings only ("ACCEPTABLE AS-IS"), not an email
 * body. Writing new consumer-facing copy requires compliance review first.
 * Until an approved template is installed, EVERY send is skipped with reason
 * `no_approved_copy` and the outcome is still recorded on the lead's timeline
 * — the page's promise stays covered by the owner's manual email at Tier 0/1,
 * exactly as the verdict's engineer note allows.
 *
 * INSTALLING THE APPROVED COPY (no code change needed):
 *   set BOTH `ACK_EMAIL_SUBJECT` and `ACK_EMAIL_BODY` in the deployed
 *   environment (publish.sh forwards them). Env vars win over the constants.
 *   Paste the compliance-approved text VERBATIM — no edits. Alternatively fill
 *   the constants below in code so the copy lands in a reviewable diff.
 *
 * Guarantees (task brief, E2):
 *   - The lead submission NEVER fails or blocks because of email: this module
 *     throws nothing upward and caps provider time (ACK_TIMEOUT_MS).
 *   - Sends only when RESEND_API_KEY is present AND an approved template is
 *     configured AND the contact is not suppressed (DNC / withdrawn consent).
 *   - Every outcome (sent / failed / suppressed / skipped) is written exactly
 *     once to `email_ack_log`, which the lead timeline surfaces.
 *   - From-address: FROM_EMAIL env, else Resend's default test sender
 *     `onboarding@resend.dev`. HONEST LIMIT: `onboarding@resend.dev` only
 *     delivers to the Resend account owner's own address — real deliverability
 *     to consumers requires a verified sending domain (DNS on a domain the
 *     owner controls). A domain rejection is recorded as a normal failure;
 *     the lead still saves.
 */

/** Lead save must never wait longer than this on the email provider. */
const ACK_TIMEOUT_MS = 5000;

/**
 * Frozen-copies placeholder. Deliberately EMPTY — see the module header.
 * When compliance delivers the approved template, paste it VERBATIM here (or
 * install it via the ACK_EMAIL_* env vars). No other code changes are needed.
 */
const APPROVED_ACK_SUBJECT_FALLBACK = "";
const APPROVED_ACK_BODY_FALLBACK = "";

/** Resend's default test sender — only delivers to the account owner's own address. */
const DEFAULT_FROM = "onboarding@resend.dev";

export type AckStatus = "sent" | "failed" | "suppressed" | "skipped";

export interface AckResult {
  status: AckStatus;
  /** Machine reason code: no_api_key | no_approved_copy | dnc | consent_revoked | provider_error | provider_timeout | config */
  reason: string;
  /** Human-readable detail for the dashboard timeline (internal-facing copy). */
  detail: string;
  providerId?: string;
  fromAddress?: string;
}

/** Resolve the acknowledgment template. Env wins; both fields must be present. */
function resolveTemplate(): { subject: string; body: string; source: "env" | "code" } | null {
  const envSubject = (process.env.ACK_EMAIL_SUBJECT ?? "").trim();
  const envBody = (process.env.ACK_EMAIL_BODY ?? "").trim();
  if (envSubject && envBody) return { subject: envSubject, body: envBody, source: "env" };
  if (envSubject || envBody) {
    console.warn(
      "[email-ack] ACK_EMAIL_SUBJECT and ACK_EMAIL_BODY must BOTH be set; ignoring a half-configured template."
    );
  }
  const subject = APPROVED_ACK_SUBJECT_FALLBACK.trim();
  const body = APPROVED_ACK_BODY_FALLBACK.trim();
  if (subject && body) return { subject, body, source: "code" };
  return null;
}

function fromAddress(): string {
  const configured = (process.env.FROM_EMAIL ?? "").trim();
  return configured || DEFAULT_FROM;
}

/**
 * Suppression check (consent vault / DNC). A submitter who withdrew consent,
 * or whose email is on the do-not-contact list at email scope, must not get
 * email — even with fresh inbound consent (a "stop" said anywhere is final on
 * every channel; fresh consent affects the owner's manual follow-up decision,
 * never an automated send).
 *
 * Best-effort: a vault query error does NOT fail the lead — it fails the email
 * attempt with reason `config` (fail-closed for the SEND, never for the LEAD).
 */
async function checkSuppression(
  leadId: string,
  email: string
): Promise<{ suppressed: boolean; reason: string; detail: string }> {
  try {
    // 1. Lead-level marks: revoked consent or the E1 do-not-contact flag.
    const lead = await pool.query(
      `SELECT tcpa_consent, do_not_contact FROM leads WHERE id = $1`,
      [leadId]
    );
    if (lead.rows.length > 0) {
      const row = lead.rows[0];
      if (row.do_not_contact === true) {
        return {
          suppressed: true,
          reason: "dnc",
          detail: "Lead is marked do-not-contact.",
        };
      }
      if (row.tcpa_consent === false) {
        return {
          suppressed: true,
          reason: "consent_revoked",
          detail: "Email consent was withdrawn for this contact.",
        };
      }
    }

    // 2. Email-scope DNC rows for this lead or this address.
    //    dnc_type 'phone' does NOT block email; 'email' and 'both' do.
    const dnc = await pool.query(
      `SELECT id FROM compliance_dnc_list
        WHERE (lead_id = $1::uuid OR ($2::text IS NOT NULL AND email ILIKE $2))
          AND dnc_type IN ('email', 'both')
        LIMIT 1`,
      [leadId, email || null]
    );
    if (dnc.rows.length > 0) {
      return {
        suppressed: true,
        reason: "dnc",
        detail: "This contact is on the do-not-contact list (email scope).",
      };
    }

    // 3. Revoked email-channel consent in the vault (consent register).
    const revoked = await pool.query(
      `SELECT id FROM compliance_consent_records
        WHERE lead_id = $1 AND consent_type = 'tcpa_email' AND consent_status = 'revoked'
        LIMIT 1`,
      [leadId]
    );
    if (revoked.rows.length > 0) {
      return {
        suppressed: true,
        reason: "consent_revoked",
        detail: "Email consent was withdrawn for this contact.",
      };
    }

    return { suppressed: false, reason: "", detail: "" };
  } catch (err) {
    console.error("[email-ack] suppression check error (email attempt fails closed):", err);
    return {
      suppressed: true,
      reason: "config",
      detail: "Suppression check could not be completed — email attempt skipped (the lead itself is unaffected).",
    };
  }
}

/** Persist the outcome. Best-effort: a logging failure must never throw upward. */
async function recordAckOutcome(
  leadId: string,
  result: AckResult
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO email_ack_log (lead_id, status, from_address, provider_id, reason, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [leadId, result.status, result.fromAddress ?? null, result.providerId ?? null, result.reason, result.detail]
    );
  } catch (err) {
    console.error(`[email-ack] failed to record outcome (${result.status}/${result.reason}) for lead ${leadId}:`, err);
  }
}

/**
 * Placeholder substitution for the acknowledgment body (compliance spec §3.1,
 * /home/team/shared/ack-email-template.md). Only two placeholders exist and
 * only these two are touched — the copy itself is frozen and lives in the
 * template config (env/code), never here:
 *   {{first_name}} -> the submitter's first name, trimmed; fallback "there"
 *                     when absent/empty.
 *   {{state}}      -> the state exactly as selected (e.g. "NJ"); fallback
 *                     "wherever you are" when empty/NULL or the literal
 *                     "Prefer not to say" (never shown to the consumer).
 * Single pass over the ORIGINAL string: replacement values are never
 * re-scanned, so a name containing "{{...}}" cannot be substituted, and a
 * body that was already substituted once is unchanged by a second pass. Any
 * other {{token}} passes through untouched.
 */
export function renderAckBody(
  body: string,
  personalization: { firstName?: string | null; state?: string | null }
): string {
  const firstName = (personalization.firstName ?? "").trim();
  const state = (personalization.state ?? "").trim();
  const name = firstName || "there";
  const where =
    state && state.toLowerCase() !== "prefer not to say"
      ? state
      : "wherever you are";
  return body.replace(/\{\{(first_name|state)\}\}/g, (_match, token: string) =>
    token === "first_name" ? name : where
  );
}

/**
 * Attempt the acknowledgment email for a consumer-inquiry lead and record the
 * outcome on the lead's timeline. NEVER throws; NEVER fails the lead.
 * Bounded by ACK_TIMEOUT_MS on the provider call.
 */
export async function sendAckEmail(input: {
  leadId: string;
  email: string;
  firstName?: string | null;
  state?: string | null;
}): Promise<AckResult> {
  const { leadId, email, firstName, state } = input;

  // Guard 1 — API key present? (task: only attempt sending when it is)
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) {
    const result: AckResult = {
      status: "failed",
      reason: "no_api_key",
      detail: "RESEND_API_KEY is not configured — nothing was attempted.",
      fromAddress: fromAddress(),
    };
    console.error(`[email-ack] lead ${leadId}: RESEND_API_KEY missing — acknowledgment email not attempted (lead unaffected).`);
    await recordAckOutcome(leadId, result);
    return result;
  }

  // Guard 2 — approved copy configured? (copy is frozen; nothing to send yet)
  const template = resolveTemplate();
  if (!template) {
    const result: AckResult = {
      status: "skipped",
      reason: "no_approved_copy",
      detail: "No compliance-approved acknowledgment copy is configured yet — nothing was sent.",
      fromAddress: fromAddress(),
    };
    console.warn(`[email-ack] lead ${leadId}: no approved acknowledgment copy configured — send skipped (lead unaffected).`);
    await recordAckOutcome(leadId, result);
    return result;
  }

  // Guard 3 — suppression (DNC / withdrawn consent).
  const suppression = await checkSuppression(leadId, email);
  if (suppression.suppressed) {
    const result: AckResult = {
      status: "suppressed",
      reason: suppression.reason,
      detail: suppression.detail,
      fromAddress: fromAddress(),
    };
    console.warn(`[email-ack] lead ${leadId}: suppressed (${suppression.reason}) — no email sent (lead unaffected).`);
    await recordAckOutcome(leadId, result);
    return result;
  }

  const from = fromAddress();

  try {
    // Dynamic import keeps the Resend client out of paths that never send.
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const sendPromise = resend.emails.send({
      from,
      to: [email],
      subject: template.subject,
      // §3.1 substitution — placeholders are resolved at send time only.
      text: renderAckBody(template.body, { firstName, state }),
    });

    const timeout = new Promise<{ timedOut: true }>((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), ACK_TIMEOUT_MS)
    );

    const outcome = await Promise.race([sendPromise, timeout]);

    if ("timedOut" in outcome) {
      const result: AckResult = {
        status: "failed",
        reason: "provider_timeout",
        detail: `Email provider did not respond within ${ACK_TIMEOUT_MS / 1000}s — treated as not sent (the lead is unaffected).`,
        fromAddress: from,
      };
      console.error(`[email-ack] lead ${leadId}: provider timeout after ${ACK_TIMEOUT_MS}ms.`);
      await recordAckOutcome(leadId, result);
      return result;
    }

    // Resend v6 resolves { data?, error? } instead of rejecting.
    const providerError = outcome?.error;
    if (providerError) {
      const message =
        (providerError as { message?: string }).message ?? "unknown provider error";
      const result: AckResult = {
        status: "failed",
        reason: "provider_error",
        detail: `Provider rejected the send: ${message.slice(0, 200)}`,
        fromAddress: from,
      };
      console.error(`[email-ack] lead ${leadId}: provider error — ${message}`);
      await recordAckOutcome(leadId, result);
      return result;
    }

    const providerId = outcome?.data?.id ?? undefined;
    const result: AckResult = {
      status: "sent",
      reason: "",
      detail: `Sent from ${from}${providerId ? ` · provider id ${providerId}` : ""}.`,
      providerId,
      fromAddress: from,
    };
    console.log(`[email-ack] lead ${leadId}: sent from ${from} (template source: ${template.source}).`);
    await recordAckOutcome(leadId, result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result: AckResult = {
      status: "failed",
      reason: "provider_error",
      detail: `Provider rejected the send: ${message.slice(0, 200)}`,
      fromAddress: from,
    };
    console.error(`[email-ack] lead ${leadId}: send attempt error — ${message}`);
    await recordAckOutcome(leadId, result);
    return result;
  }
}
