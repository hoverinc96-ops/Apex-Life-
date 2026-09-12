import { NextResponse } from "next/server";
import { calendarConfigured, isCalendarConnected } from "@/lib/google-calendar";
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