import pool from "@/lib/db";

/**
 * Compliance vault write paths (Stage 0 — lead-sourcing-compliance.md §1.4,
 * §5 controls C2/C4/C7).
 *
 * These functions are the ONLY runtime code that should write to the compliance
 * vault tables. They persist a complete, audit-ready trail of consent records,
 * do-not-contact suppression, and immutable audit events (the audit table's
 * BEFORE-INSERT trigger auto-computes the SHA-256 hash chain).
 *
 * FAIL-CLOSED / NOT LIVE: Consumer consent capture (`recordConsent`) is gated
 * behind the `CAPTURE_ENABLED` env flag (defaults OFF). No consumer funnel is
 * live in Stage 0 — these are write paths only, built so compliant capture can
 * be turned on later after the launch gates in the compliance brief are met.
 * Audit logging and DNC/opt-out suppression are NOT gated: honoring a consumer's
 * opt-out must always work (`formatContact` opt-out, §5 C4/C8).
 */

/** @param channel consent_type enum value (one row per channel). */
export type ComplianceChannel = "tcpa_voice" | "tcpa_sms" | "tcpa_email";

/** Consumer capture gate (C13). Must be explicitly "true" to capture consent. */
export function captureEnabled(): boolean {
  return process.env.CAPTURE_ENABLED === "true";
}

/** Validate an IP so it can be stored in an INET column without throwing. */
function safeIp(ip?: string | null): string | null {
  if (!ip) return null;
  const v4 = /^(\d{1,3})(\.\d{1,3}){3}$/;
  const v6 = /^[0-9a-fA-F:]+$/;
  if (v4.test(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.every((p) => p >= 0 && p <= 255)) return ip;
    return null;
  }
  return v6.test(ip) ? ip : null;
}

export interface AuditEventInput {
  lead_id?: string | null;
  event_type: string; // see compliance_audit_log.event_type enum values
  event_data?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

/** Insert one immutable event into the audit log (C2/C7). Hash chain auto-applied. */
export async function logAuditEvent(input: AuditEventInput): Promise<string> {
  const res = await pool.query(
    `INSERT INTO compliance_audit_log (lead_id, event_type, event_data, ip_address, user_agent)
     VALUES ($1, $2, $3, $4::inet, $5)
     RETURNING id`,
    [
      input.lead_id ?? null,
      input.event_type,
      JSON.stringify(input.event_data ?? {}),
      safeIp(input.ip_address),
      input.user_agent ?? null,
    ],
  );
  return res.rows[0].id;
}

/**
 * Record a single channel consent (C1/C2). One row per channel per §1.4.
 * FAIL-CLOSED: 503-style guard — throws unless CAPTURE_ENABLED=true (C13).
 * For each channel this also writes a `consent_granted` audit event.
 */
export interface ConsentInput {
  lead_id: string;
  channel: ComplianceChannel;
  consent_text: string; // exact, versioned disclosure text the person agreed to
  consent_text_version?: string;
  form_snapshot?: Record<string, unknown>; // frozen form state per §1.4
  ip_address?: string | null;
  user_agent?: string | null;
  funnel_id?: string | null;
  campaign_id?: string | null;
}

export async function recordConsent(input: ConsentInput): Promise<{
  ok: boolean;
  consentRecordId: string;
}> {
  if (!captureEnabled()) {
    throw new Error(
      "Consumer consent capture is disabled (CAPTURE_ENABLED not set to true). Capture is gated for a later launch stage.",
    );
  }
  const version = input.consent_text_version || "v1";
  const res = await pool.query(
    `INSERT INTO compliance_consent_records
       (lead_id, consent_type, consent_status, consent_text, consent_text_version,
        form_snapshot, ip_address, user_agent, funnel_id, campaign_id)
     VALUES ($1, $2, 'granted', $3, $4, $5, $6::inet, $7, $8, $9)
     RETURNING id`,
    [
      input.lead_id,
      input.channel,
      input.consent_text,
      version,
      JSON.stringify(input.form_snapshot ?? {}),
      safeIp(input.ip_address),
      input.user_agent ?? null,
      input.funnel_id ?? null,
      input.campaign_id ?? null,
    ],
  );
  const consentRecordId = res.rows[0].id;
  await logAuditEvent({
    lead_id: input.lead_id,
    event_type: "consent_granted",
    event_data: {
      channel: input.channel,
      consent_record_id: consentRecordId,
      consent_text_version: version,
      funnel_id: input.funnel_id ?? null,
      campaign_id: input.campaign_id ?? null,
    },
    ip_address: input.ip_address,
    user_agent: input.user_agent,
  });
  return { ok: true, consentRecordId };
}

/** Insert a do-not-contact row (C3/C4/C8). Not gated — suppression must always work. */
export interface DncInput {
  lead_id?: string | null;
  phone?: string | null;
  email?: string | null;
  dnc_type?: "phone" | "email" | "both"; // default computed from provided channels
  source?: string; // e.g. web_opt_out | sms_stop | voice_opt_out | email_unsubscribe
}

export async function addToDnc(input: DncInput): Promise<string> {
  const hasPhone = Boolean(input.phone && input.phone.trim());
  const hasEmail = Boolean(input.email && input.email.trim());
  let dnc_type = input.dnc_type;
  if (!dnc_type) {
    if (hasPhone && hasEmail) dnc_type = "both";
    else if (hasEmail) dnc_type = "email";
    else dnc_type = "phone";
  }
  const res = await pool.query(
    `INSERT INTO compliance_dnc_list (lead_id, phone, email, dnc_type, source)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      input.lead_id ?? null,
      input.phone?.trim() || null,
      input.email?.trim() || null,
      dnc_type,
      input.source ?? "web_opt_out",
    ],
  );
  return res.rows[0].id;
}

/** Map a consumer-facing channel string to a DNC type fragment. */
function dncTypeForChannel(channel?: string, hasPhone = false, hasEmail = false): "phone" | "email" | "both" {
  const c = (channel || "").toLowerCase();
  if (c.includes("email")) return "email";
  if (c === "phone" || c.includes("voice") || c.includes("sms") || c === "tcpa_sms" || c === "tcpa_voice") {
    return hasPhone && hasEmail ? "both" : hasPhone ? "phone" : "email";
  }
  // "all" / "both" / unspecified
  if (hasPhone && hasEmail) return "both";
  if (hasEmail) return "email";
  return "phone";
}

/**
 * Cross-channel opt-out / consent revocation (C4/C8).
 *  - Inserts a compliance_dnc_list row (suppression across ALL channels §1.4).
 *  - Writes an `opt_out` audit event.
 *  - Marks any matching lead's consent as revoked (tcpa_consent=FALSE,
 *    consent records -> revoked).
 *  - If a lead_id is supplied, writes a `consent_revoked` audit event too.
 * NOT gated — honoring an opt-out must always work.
 */
export interface OptOutInput {
  lead_id?: string | null;
  phone?: string | null;
  email?: string | null;
  channel?: string | null; // voice | sms | email | phone | all
  source?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export async function recordOptOut(input: OptOutInput): Promise<{
  ok: boolean;
  dncId: string;
  matchedLeadIds: string[];
  auditEvents: string[];
}> {
  const hasPhone = Boolean(input.phone && input.phone.trim());
  const hasEmail = Boolean(input.email && input.email.trim());
  const dncType = dncTypeForChannel(input.channel ?? undefined, hasPhone, hasEmail);
  const source = input.source ?? "web_opt_out";

  // 1. DNC suppression row (C3/C4)
  const dncId = await addToDnc({
    lead_id: input.lead_id ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    dnc_type: dncType,
    source,
  });

  // 2. Cross-channel opt_out audit event
  const auditEvents: string[] = [];
  auditEvents.push(
    await logAuditEvent({
      lead_id: input.lead_id ?? null,
      event_type: "opt_out",
      event_data: {
        channel: input.channel ?? null,
        dnc_type: dncType,
        source,
        dnc_id: dncId,
        phone: input.phone ?? null,
        email: input.email ?? null,
      },
      ip_address: input.ip_address,
      user_agent: input.user_agent,
    }),
  );

  // 3. Find + revoke matching leads' consent (C4 — suppress across all channels)
  const matchedLeadIds: string[] = [];
  const where: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (hasEmail) {
    where.push(`email ILIKE $${i++}`);
    params.push(input.email!.trim());
  }
  if (hasPhone) {
    where.push(`phone = $${i++}`);
    params.push(input.phone!.trim());
  }
  if (input.lead_id) {
    where.push(`id = $${i++}`);
    params.push(input.lead_id);
  }
  if (where.length > 0) {
    const matched = await pool.query(`SELECT id FROM leads WHERE ${where.join(" OR ")}`, params);
    const ids = matched.rows.map((r: { id: string }) => r.id);
    matchedLeadIds.push(...ids);
    if (ids.length > 0) {
      await pool.query(
        `UPDATE leads SET tcpa_consent = FALSE, tcpa_consent_date = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      await pool.query(
        `UPDATE compliance_consent_records
            SET consent_status = 'revoked', revoked_at = CURRENT_TIMESTAMP
          WHERE lead_id = ANY($1::uuid[]) AND consent_status = 'granted'`,
        [ids],
      );
      // consent_revoked audit events (with lead attribution)
      for (const leadId of ids) {
        auditEvents.push(
          await logAuditEvent({
            lead_id: leadId,
            event_type: "consent_revoked",
            event_data: { channel: input.channel ?? null, source, dnc_id: dncId },
            ip_address: input.ip_address,
            user_agent: input.user_agent,
          }),
        );
      }
    }
  }

  return { ok: true, dncId, matchedLeadIds, auditEvents };
}

/**
 * Write a `form_submitted` audit event. NOT gated — used for the live B2B
 * "Request Access" inquiry form (kept tcpa_consent=FALSE; an inquiry, not a
 * consumer consent record, §1.1/B2B row). Consumer funnel submissions will
 * call this too via recordConsent in a later stage.
 */
export async function logFormSubmitted(input: Omit<AuditEventInput, "event_type">): Promise<string> {
  return logAuditEvent({ ...input, event_type: "form_submitted" });
}
