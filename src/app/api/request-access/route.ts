import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { logFormSubmitted } from "@/lib/compliance";

/** Extract a client IP from common proxy headers; falls back to null. */
function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || null;
  return request.headers.get("x-real-ip");
}

const STATE_RE = /^[A-Za-z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Landing-page "Request Access" form handler. Inserts the submission as a real
 * lead in the CRM with source='request_access', status='new'. No fake tracking:
 * the submission lands directly in the pipeline.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
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
  if (!state || typeof state !== "string" || !STATE_RE.test(state.trim())) {
    return NextResponse.json(
      { error: "Please provide a valid 2-letter state (e.g. TX)." },
      { status: 400 }
    );
  }

  // Split the full name into first/last (best-effort on the final space).
  const parts = name.trim().split(/\s+/);
  const first_name = parts[0];
  const last_name = parts.slice(1).join(" ") || "";

  const phoneValue =
    typeof phone === "string" && phone.trim() ? phone.trim() : "";

  try {
    const result = await pool.query(
      `INSERT INTO leads (first_name, last_name, email, phone, state, status, source, tcpa_consent)
       VALUES ($1, $2, $3, $4, $5, 'new', 'request_access', FALSE)
       RETURNING id, first_name, last_name, email, status, source`
    , [first_name, last_name, email.trim(), phoneValue, state.trim().toUpperCase()]);

    const leadId = result.rows[0].id as string;

    // B2B early-access inquiry (NOT a consumer consent capture). Record an
    // audit `form_submitted` event with funnel attribution. tcpa_consent stays
    // FALSE — no consumer consent is being claimed here (§1.4 / §5 C7).
    try {
      await logFormSubmitted({
        lead_id: leadId,
        event_data: {
          funnel: "request_access",
          source: "request_access",
          has_phone: Boolean(phoneValue),
        },
        ip_address: clientIp(request),
        user_agent: request.headers.get("user-agent"),
      });
    } catch (auditErr) {
      // The lead was still created; audit-write failure must not break the
      // B2B form, but it is logged so a missing audit row is never silent.
      console.error("POST /api/request-access audit write error:", auditErr);
    }

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/request-access error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
