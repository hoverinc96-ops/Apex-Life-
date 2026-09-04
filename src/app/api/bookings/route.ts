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
const TOPICS = new Set([
  "general",
  "life_insurance_quote",
  "policy_question",
  "existing_client",
]) as ReadonlySet<string>;

/** Exact, versioned consent text the requester agrees to on the /book form. */
export const BOOKING_CONSENT_TEXT =
  "I agree to be contacted by Apex Life AI by email and/or phone about this request. I understand this is a request for a call, not a confirmed appointment.";

/**
 * POST /api/bookings — lightweight booking request (owner's private pipeline,
 * Mode-1 owner seat). FAIL-CLOSED: missing/invalid name or email rejects the
 * request (400). Phone is optional, topic defaults to 'general', and
 * requested_time is free text (no calendar integration — the owner confirms
 * by email, so we never claim an auto-confirmed slot).
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

    return NextResponse.json(
      {
        ...result.rows[0],
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