import pool from "@/lib/db";

/**
 * Owner-only Google Calendar sync (Mode-1 private seat).
 *
 * Creates a TENTATIVE placeholder event on the OWNER's primary Google
 * Calendar for each booking request from the public /book page. Owner-only:
 * bookings are always owner_only=TRUE and this module only ever touches the
 * owner's own calendar ("primary" of the connected Google account) — never
 * partner/tenant data.
 *
 * Auth: OAuth2 refresh-token pattern for a single user's calendar.
 *   - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET come from env (owner sets up
 *     Google Cloud; NOT in the repo).
 *   - The owner authorizes ONCE via /api/calendar/auth → Google → callback;
 *     the refresh token is stored server-side in the `owner_secrets` table
 *     (or read from GOOGLE_OAUTH_REFRESH_TOKEN env if set). NEVER in client
 *     code or the repo.
 *   - No `googleapis` dependency — direct REST fetch against Calendar API v3
 *     keeps the install footprint minimal.
 *
 * FAIL-CLOSED: every public function returns a skipped/error outcome (never
 * throws for missing creds or missing auth), and callers must treat calendar
 * sync as best-effort. Raw PII (name/email/phone) is NEVER written to logs —
 * only booking ids and outcome codes.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const FETCH_TIMEOUT_MS = 10_000;
const REFRESH_TOKEN_ENV_VAR = "GOOGLE_OAUTH_REFRESH_TOKEN";
const SECRET_KEY = "google_refresh_token";

export interface BookingForCalendar {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  topic: string;
  requested_time: string | null;
}

export type SyncOutcome =
  | { ok: true; eventId: string; htmlLink: string | null }
  | {
      ok: false;
      skipped: "not_configured" | "not_authorized" | "network_error" | "api_error";
      detail?: string;
    };

/** True when the owner has put Google OAuth client creds in env. */
export function calendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

function redirectUri(origin: string): string {
  const override = process.env.GOOGLE_REDIRECT_URI;
  if (override && override.trim()) return override.trim();
  return `${origin.replace(/\/$/, "")}/api/calendar/callback`;
}

export function getRedirectUri(origin: string): string {
  return redirectUri(origin);
}

/** Build the Google OAuth consent URL the owner visits once to connect. */
export function getAuthorizationUrl(origin: string, state: string): string | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline", // need a refresh token for background sync
    prompt: "consent", // force refresh-token issuance on every connect
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Read the stored refresh token (env override first, then owner_secrets). */
export async function getRefreshToken(): Promise<string | null> {
  const fromEnv = process.env[REFRESH_TOKEN_ENV_VAR];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    const res = await pool.query(
      `SELECT value FROM owner_secrets WHERE key = $1 LIMIT 1`,
      [SECRET_KEY]
    );
    const v = res.rows[0]?.value;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch (err) {
    // Table may not exist yet (migration not run) — fail closed, not loud.
    console.error("google-calendar getRefreshToken lookup error");
    return null;
  }
}

/** Persist the refresh token server-side (owner_secrets table). */
export async function storeRefreshToken(refreshToken: string): Promise<void> {
  await pool.query(
    `INSERT INTO owner_secrets (key, value, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [SECRET_KEY, refreshToken]
  );
}

/** True when a refresh token exists (env or owner_secrets). */
export async function isCalendarConnected(): Promise<boolean> {
  return (await getRefreshToken()) !== null;
}

/** Exchange an OAuth authorization code for tokens. Throws on failure. */
export async function exchangeCodeForTokens(
  code: string,
  origin: string
): Promise<{ refreshToken: string | null }> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  });
  let res: Response;
  try {
    res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch {
    throw new Error("token exchange request failed (network)");
  }
  if (!res.ok) throw new Error(`token exchange rejected (${res.status})`);
  const data = (await res.json()) as { refresh_token?: string };
  return { refreshToken: data.refresh_token ?? null };
}

/** Mint a short-lived access token from the stored refresh token. */
async function getAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;
  if (!calendarConfigured()) return null;
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
  });
  try {
    const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Map the free-text requested_time to a concrete event window.
 * /book requested_time is a coarse slot ("Weekday morning (9am–noon)") or a
 * raw string — never a confirmed datetime. If it parses as a real future
 * date, use a 30-min block there; otherwise create a tentative ALL-DAY
 * placeholder for tomorrow so we never invent a specific time.
 */
function eventWindow(requestedTime: string | null): {
  start: Record<string, string>;
  end: Record<string, string>;
  timed: boolean;
} {
  if (requestedTime) {
    const parsed = Date.parse(requestedTime);
    if (!Number.isNaN(parsed) && parsed > Date.now()) {
      const start = new Date(parsed);
      const end = new Date(parsed + 30 * 60 * 1000);
      return {
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        timed: true,
      };
    }
  }
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: { date: fmt(tomorrow) },
    end: { date: fmt(dayAfter) },
    timed: false,
  };
}

/**
 * Create the tentative placeholder event on the owner's primary calendar.
 * FAIL-CLOSED: returns a skipped outcome (never throws) when creds/auth are
 * absent; logs only the booking id + outcome, never PII. Intentionally adds
 * NO attendees — Google must not email the requester an invite for a call
 * that isn't confirmed yet.
 */
export async function syncBookingToCalendar(
  booking: BookingForCalendar
): Promise<SyncOutcome> {
  if (!calendarConfigured()) return { ok: false, skipped: "not_configured" };
  const accessToken = await getAccessToken();
  if (!accessToken) return { ok: false, skipped: "not_authorized" };

  const window = eventWindow(booking.requested_time);
  const topicLabel = booking.topic.replace(/_/g, " ");
  const timeLine = window.timed
    ? `Requested time (as entered): ${booking.requested_time}`
    : `Preferred slot (as entered): ${booking.requested_time ?? "any time — owner picks"}. ` +
      `Shown as an all-day placeholder; agree a real time with the requester first.`;
  const event = {
    summary: `[TENTATIVE] Apex booking request — ${booking.name}`,
    description:
      `TENTATIVE placeholder for a requested call — NOT a confirmed appointment. ` +
      `Confirm a time with the requester by email before treating this as scheduled.\n\n` +
      `Name: ${booking.name}\n` +
      `Email: ${booking.email}\n` +
      `Phone: ${booking.phone ?? "—"}\n` +
      `Topic: ${topicLabel}\n` +
      `${timeLine}\n` +
      `Booking id: ${booking.id}`,
    start: window.timed
      ? { ...window.start, timeZone: "UTC" }
      : window.start,
    end: window.timed ? { ...window.end, timeZone: "UTC" } : window.end,
    transparency: "transparent", // don't block the owner's calendar
    status: "tentative",
  };

  let res: Response;
  try {
    res = await fetchWithTimeout(GOOGLE_EVENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });
  } catch {
    console.error(`google-calendar event insert network error (booking ${booking.id})`);
    return { ok: false, skipped: "network_error" };
  }
  if (!res.ok) {
    console.error(
      `google-calendar event insert rejected (${res.status}) (booking ${booking.id})`
    );
    return { ok: false, skipped: "api_error", detail: `HTTP ${res.status}` };
  }
  const data = (await res.json()) as { id?: string; htmlLink?: string };
  if (!data.id) {
    console.error(`google-calendar event insert missing id (booking ${booking.id})`);
    return { ok: false, skipped: "api_error", detail: "missing event id" };
  }
  console.log(`google-calendar event created (booking ${booking.id})`);
  return { ok: true, eventId: data.id, htmlLink: data.htmlLink ?? null };
}
