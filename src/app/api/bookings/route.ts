import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { logFormSubmitted } from "@/lib/compliance";
import { syncBookingToCalendar } from "@/lib/google-calendar";

/** Extract a client IP from common proxy headers; falls back to null. */
function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || null;
  return request.headers.get("x-real-ip");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOPICS = new Set([
  "general",
  "life_insurance_quote",
  "policy_question",
  "existing_client",
]) as ReadonlySet<string>;

/** Exact, versioned consent text the requester agrees to on the /book form. */
const BOOKING_CONSENT_TEXT =
  "I agree to be contacted by Apex Life AI by email and/or phone about this request. I understand this is a request for a call, not a confirmed appointment.";

/**
 * POST /api/bookings — lightweight booking request (owner's private pipeline,
 * Mode-1 owner seat). FAIL-CLOSED: missing/invalid name or email rejects the
 * request (400). Phone is optional, topic defaults to 'general', and
 * requested_time is free text (the owner confirms by email, so we never claim
 * an auto-confirmed slot).
 *
 * After the booking row is saved, a best-effort sync creates a TENTATIVE
 * placeholder event on the OWNER's personal Google Calendar (owner_only=TRUE
 * rows only; never partner/tenant data). The sync is non-blocking and
 * fail-closed: missing Google creds or missing OAuth authorization just
 * leaves google_sync_status at a skipped value — the booking always
 * succeeds and the audit is always written.
 *
 * Compliance: the submission is audited via the compliance vault helper
 * (form_submitted, funnel=book_page) with the exact consent text the person
 * agreed to, plus a DNC-sensitivity check recorded in the audit payload.
 * This is an INBOUND request with fresh express consent — it is recorded
 * (and outbound contact is not live on this plan), but DNC suppression for
 * any outbound channel remains in force separately in the vault.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, email, phone, topic, requested_time, consent } = body;

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
  if (consent !== true) {
    return NextResponse.json(
      { error: "Please agree to be contacted about this request." },
      { status: 400 }
    );
  }

  const topicValue =
    typeof topic === "string" && TOPICS.has(topic) ? topic : "general";
  const requestedTimeValue =
    typeof requested_time === "string" && requested_time.trim()
      ? requested_time.trim().slice(0, 200)
      : null;
  const phoneValue =
    typeof phone === "string" && phone.trim() ? phone.trim().slice(0, 40) : null;

  try {
    const result = await pool.query(
      `INSERT INTO bookings (name, email, phone, topic, requested_time, status, owner_only)
       VALUES ($1, $2, $3, $4, $5, 'requested', TRUE)
       RETURNING id, name, email, phone, topic, requested_time, status, owner_only, created_at`,
      [name.trim(), email.trim(), phoneValue, topicValue, requestedTimeValue]
    );
    const bookingRow = result.rows[0] as {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      topic: string;
      requested_time: string | null;
    };

    // DNC-sensitivity check for the audit trail: was this contact already on
    // our do-not-contact list? Their fresh inbound request + consent still
    // records (outbound isn't live), but the audit notes the match so nothing
    // is ever silent.
    let dncMatched = false;
    try {
      const dnc = await pool.query(
        `SELECT id FROM compliance_dnc_list
         WHERE email ILIKE $1 OR ($2::text IS NOT NULL AND phone = $2)
         LIMIT 1`,
        [email.trim(), phoneValue]
      );
      dncMatched = dnc.rows.length > 0;
    } catch {
      dncMatched = false; // vault query best-effort; the booking still stands
    }

    try {
      await logFormSubmitted({
        event_data: {
          funnel: "book_page",
          source: "book_page",
          owner_pipeline: true,
          topic: topicValue,
          requested_time: requestedTimeValue ?? null,
          has_phone: Boolean(phoneValue),
          consent: true,
          consent_text: BOOKING_CONSENT_TEXT,
          consent_text_version: "v1",
          dnc_matched: dncMatched,
        },
        ip_address: clientIp(request),
        user_agent: request.headers.get("user-agent"),
      });
    } catch (auditErr) {
      // The booking was still created; audit-write failure must not break the
      // form, but it is logged so a missing audit row is never silent.
      console.error("POST /api/bookings audit write error:", auditErr);
    }

    // Best-effort owner-calendar sync (non-blocking, fail-closed). Runs
    // AFTER the booking row + audit are saved, so the booking always
    // succeeds even when Google creds/auth are absent or Google errors.
    // Only the booking id is logged — never PII.
    let syncStatus = "not_synced";
    let syncEventId: string | null = null;
    try {
      const outcome = await syncBookingToCalendar({
        id: bookingRow.id,
        name: bookingRow.name,
        email: bookingRow.email,
        phone: bookingRow.phone,
        topic: topicValue,
        requested_time: requestedTimeValue,
      });
      if (outcome.ok) {
        syncStatus = "synced";
        syncEventId = outcome.eventId;
      } else {
        syncStatus =
          outcome.skipped === "not_configured"
            ? "skipped_no_config"
            : outcome.skipped === "not_authorized"
              ? "skipped_no_auth"
              : "error";
      }
    } catch {
      // syncBookingToCalendar is designed not to throw, but a belt-and-
      // braces guard guarantees the booking still succeeds no matter what.
      console.error(`POST /api/bookings calendar sync error (booking ${bookingRow.id})`);
      syncStatus = "error";
    }
    try {
      await pool.query(
        `UPDATE bookings
            SET google_sync_status = $2, google_event_id = $3, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [bookingRow.id, syncStatus, syncEventId]
      );
    } catch {
      // Migration may not have run yet (columns absent) — booking + audit
      // already saved, so log and continue rather than failing the form.
      console.error(`POST /api/bookings sync-status write error (booking ${bookingRow.id})`);
    }

    return NextResponse.json(
      {
        ...result.rows[0],
        google_sync_status: syncStatus,
        google_event_id: syncEventId,
        message:
          "We've received your request — we'll confirm your preferred time by email. Nothing is booked yet.",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/bookings error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}