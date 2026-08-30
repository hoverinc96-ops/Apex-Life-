import { NextRequest, NextResponse } from "next/server";
import { recordOptOut, captureEnabled } from "@/lib/compliance";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

/**
 * POST /api/compliance/opt-out
 *
 * Cross-channel do-not-contact / consent-revocation write path (§5 C4/C8).
 * Accepts any of { phone?, email?, channel?, source?, lead_id? } and:
 *   - inserts a compliance_dnc_list row (suppression across ALL channels),
 *   - writes an `opt_out` audit event (and consent_revoked for matched leads),
 *   - marks any matching lead's consent as revoked (tcpa_consent=FALSE).
 *
 * Honoring an opt-out is NOT gated (it must always work), but this is a write
 * path endpoint — no consumer capture or outbound traffic exists in Stage 0.
 * Note: an unknown phone is NOT a 400 — the DNC row is still recorded so the
 * number is suppressed even if we have no matching lead.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { phone, email, channel, source, lead_id } = body;

  const phoneStr = typeof phone === "string" ? phone.trim() : "";
  const emailStr = typeof email === "string" ? email.trim() : "";

  if (phoneStr && !PHONE_RE.test(phoneStr)) {
    return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
  }
  if (emailStr && !EMAIL_RE.test(emailStr)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (!phoneStr && !emailStr) {
    return NextResponse.json(
      { error: "Provide at least one of phone or email to opt out." },
      { status: 400 },
    );
  }

  try {
    const result = await recordOptOut({
      lead_id: typeof lead_id === "string" ? lead_id : null,
      phone: phoneStr || null,
      email: emailStr || null,
      channel: typeof channel === "string" ? channel : null,
      source: typeof source === "string" ? source : "web_opt_out",
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      user_agent: request.headers.get("user-agent"),
    });

    return NextResponse.json(
      {
        ...result,
        capture_enabled: captureEnabled(),
        note: "Do-not-contact recorded and matching consent revoked.",
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("POST /api/compliance/opt-out error:", err);
    return NextResponse.json(
      { error: "Something went wrong processing the opt-out." },
      { status: 500 },
    );
  }
}
