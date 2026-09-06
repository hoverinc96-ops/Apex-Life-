"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CalendarStatus {
  configured: boolean;
  connected: boolean;
}

const CONNECT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: {
    ok: true,
    text: "Google Calendar connected — new booking requests will create tentative events on your calendar.",
  },
  already_connected: {
    ok: true,
    text: "Already connected — your existing authorization is still in place.",
  },
  denied: {
    ok: false,
    text: "Authorization was cancelled — nothing changed. You can reconnect any time.",
  },
  not_configured: {
    ok: false,
    text: "Google credentials aren't configured yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing).",
  },
  no_refresh_token: {
    ok: false,
    text: "Google didn't return a refresh token — try connecting again and approve consent when asked.",
  },
  error: {
    ok: false,
    text: "Something went wrong during authorization — please try again.",
  },
};

/**
 * Owner calendar connection page (Mode-1 private seat). One-time "Connect
 * Google Calendar" OAuth flow plus a status readout (configured / connected).
 * Booking requests auto-create TENTATIVE placeholder events on the owner's
 * primary calendar — never confirmed appointments, never partner data.
 */
export default function OwnerCalendarPage() {
  const [search, setSearch] = useState<string | null>(null);
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setSearch(new URLSearchParams(window.location.search).get("connect"));
    fetch("/api/calendar/status")
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((j) => setStatus(j as CalendarStatus))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load status")
      );
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const r = await fetch("/api/calendar/auth", { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.authUrl) {
        setError(
          j.error ?? "Google Calendar isn't configured yet — credentials missing."
        );
        return;
      }
      window.location.href = j.authUrl as string;
    } catch {
      setError("Could not start authorization. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  const banner = search ? CONNECT_MESSAGES[search] : undefined;

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-200">Calendar Sync</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Booking requests from the public /book page create a{" "}
            <span className="font-semibold text-slate-300">
              tentative placeholder event
            </span>{" "}
            on your personal Google Calendar — never a confirmed appointment,
            and only ever your calendar (owner private seat).
          </p>
        </div>
        <Link
          href="/dashboard/owner"
          className="rounded-lg border border-navy-600 px-3 py-2 text-xs text-slate-400 transition hover:text-slate-200"
        >
          ← Owner pipeline
        </Link>
      </div>

      {banner && (
        <div
          className={`mt-6 max-w-2xl rounded-xl border p-5 text-sm ${
            banner.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {banner.text}
        </div>
      )}

      {error && (
        <div className="mt-6 max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
          Could not load calendar status: {error}
        </div>
      )}

      {!status && !error && (
        <div className="mt-6 max-w-2xl rounded-xl border border-navy-700 bg-navy-800/60 p-5 text-sm text-slate-400">
          Loading calendar status…
        </div>
      )}

      {status && (
        <div className="mt-6 grid max-w-2xl gap-4">
          <div className="rounded-xl border border-navy-700 bg-navy-800/60 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  Google Calendar
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Credentials: {status.configured ? "configured" : "not configured"} ·
                  Authorization: {status.connected ? "connected" : "not connected"}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  status.connected
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-500/30 bg-slate-500/10 text-slate-400"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    status.connected ? "bg-emerald-400" : "bg-slate-500"
                  }`}
                />
                {status.connected ? "Connected" : "Not connected"}
              </span>
            </div>

            {!status.configured && (
              <p className="mt-4 rounded-lg bg-navy-900/60 px-4 py-3 text-xs leading-relaxed text-slate-500">
                Not configured yet — the owner needs to create a Google Cloud
                OAuth client and set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
                Bookings keep working in the meantime; calendar sync stays off
                until credentials exist.
              </p>
            )}

            {status.configured && !status.connected && (
              <>
                <p className="mt-4 text-xs text-slate-500">
                  Sign in with the owner's pipeline account:{" "}
                  <span className="font-medium text-slate-300">
                    ianhover.pinnacle@gmail.com
                  </span>
                </p>
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="mt-2 rounded-xl bg-gold-500 px-5 py-3 text-sm font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-60"
                >
                  {connecting ? "Starting…" : "Connect Google Calendar"}
                </button>
              </>
            )}

            {status.connected && (
              <button
                onClick={connect}
                disabled={connecting}
                className="mt-4 rounded-xl border border-navy-600 px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-gold-500/50 hover:text-gold-300 disabled:opacity-60"
              >
                {connecting ? "Starting…" : "Reconnect (refresh authorization)"}
              </button>
            )}
          </div>

          <div className="rounded-xl border border-navy-700 bg-navy-800/60 p-5 text-xs leading-relaxed text-slate-500">
            How it works: each /book request still saves to your private
            pipeline first. Calendar sync runs afterwards as a best-effort
            step — if Google is unreachable or not connected, the booking is
            kept and marked accordingly, and nothing is lost. Events are marked
            TENTATIVE so nobody mistakes a request for a confirmed appointment.
          </div>
        </div>
      )}
    </div>
  );
}
