import { NextRequest, NextResponse } from "next/server";
import {
  calendarConfigured,
  exchangeCodeForTokens,
  isCalendarConnected,
  siteOrigin,
  storeRefreshToken,
} from "@/lib/google-calendar";
/**
 * GET /api/calendar/callback — OAuth callback for the ONE-TIME owner
 * connect. Exchanges the code for tokens and stores the refresh token
 * server-side (owner_secrets). Then redirects to the owner calendar page.
 * Query params carry only status — never tokens or PII.
 */
export async function GET(request: NextRequest) {
  const fail = (reason: string) =>
    NextResponse.redirect(
      new URL(`/dashboard/owner/calendar?connect=${reason}`, siteOrigin(request))
    );
  if (!calendarConfigured()) return fail("not_configured");
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return fail("denied");
  try {
    const { refreshToken } = await exchangeCodeForTokens(
      code,
      siteOrigin(request)
    );
    if (!refreshToken) {
      // Google only returns a refresh token on first consent; a repeat
      // connect without one means we're already connected or the owner
      // must reconnect with consent. Never treat as success silently.
      const connected = await isCalendarConnected();
      return fail(connected ? "already_connected" : "no_refresh_token");
    }
    await storeRefreshToken(refreshToken);
    return NextResponse.redirect(
      new URL("/dashboard/owner/calendar?connect=ok", siteOrigin(request))
    );
  } catch {
    return fail("error");
  }
}