import { NextRequest, NextResponse } from "next/server";
import {
  calendarConfigured,
  getAuthorizationUrl,
  isCalendarConnected,
} from "@/lib/google-calendar";

/**
 * GET /api/calendar/status — owner-only connection readout: whether Google
 * client creds are configured, whether the owner has authorized (refresh
 * token stored), and a link to start OAuth.
 */
export async function GET() {
  const configured = calendarConfigured();
  const connected = configured ? await isCalendarConnected() : false;
  return NextResponse.json({ configured, connected });
}

/**
 * POST /api/calendar/auth — start the one-time owner OAuth connect flow.
 * Returns the Google consent URL; the owner's browser is redirected there.
 */
export async function POST(request: NextRequest) {
  const url = getAuthorizationUrl(
    request.nextUrl.origin,
    `owner-connect-${Date.now()}`
  );
  if (!url) {
    return NextResponse.json(
      {
        error:
          "Google Calendar is not configured yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing). Ask the owner to add Google Cloud credentials.",
      },
      { status: 503 }
    );
  }
  return NextResponse.json({ authUrl: url });
}
