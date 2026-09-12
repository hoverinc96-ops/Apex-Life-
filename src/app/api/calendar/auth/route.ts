import { NextRequest, NextResponse } from "next/server";
import {
  calendarConfigured,
  getAuthorizationUrl,
  siteOrigin,
} from "@/lib/google-calendar";
/**
 * POST /api/calendar/auth — start the one-time owner OAuth connect flow.
 * Returns the Google consent URL; the owner's browser is redirected there.
 */
export async function POST(request: NextRequest) {
  const url = getAuthorizationUrl(
    siteOrigin(request),
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