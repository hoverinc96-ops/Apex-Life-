"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Compliance — Do-not-contact list (traffic pack §6.6, engineer item E1).
 *
 * Read-only surface: every do-not-contact entry, newest first, with search.
 * There is deliberately no edit, delete, or bulk import — honoring a
 * do-not-contact is unconditional and entries are permanent.
 */

interface DncEntry {
  id: string;
  lead_id: string | null;
  phone: string | null;
  email: string | null;
  dnc_type: string;
  source: string | null;
  channel: string | null;
  note: string | null;
  added_at: string;
  first_name: string | null;
  last_name: string | null;
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  comment: "Comment / social",
  other: "Other",
};

const SOURCE_LABELS: Record<string, string> = {
  web_opt_out: "Consumer opt-out",
  dashboard_owner_action: "Recorded by owner",
  sms_stop: "SMS stop",
  voice_opt_out: "Voice opt-out",
  email_unsubscribe: "Email unsubscribe",
};

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const channelLabel = (entry: DncEntry): string => {
  if (entry.channel && CHANNEL_LABELS[entry.channel]) return CHANNEL_LABELS[entry.channel];
  if (entry.channel) return entry.channel;
  if (entry.dnc_type === "email") return "Email";
  if (entry.dnc_type === "both") return "All channels";
  return "Phone";
};

function Spinner() {
  return (
    <span
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-gold-400"
      aria-label="Loading"
    />
  );
}

export default function CompliancePage() {
  const [entries, setEntries] = useState<DncEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchEntries = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/compliance/dnc", { cache: "no-store" });
      if (!res.ok) throw new Error("Unable to load the do-not-contact list");
      setEntries(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the do-not-contact list");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const name = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim().toLowerCase();
      return (
        name.includes(q) ||
        (e.phone ?? "").toLowerCase().includes(q) ||
        (e.email ?? "").toLowerCase().includes(q) ||
        (e.note ?? "").toLowerCase().includes(q) ||
        (e.channel ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, search]);

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[.18em] text-gold-400">
              Compliance vault
            </p>
            <h2 className="text-2xl font-bold text-slate-100">Do-not-contact list</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
              Every do-not-contact request, honored on every channel — email, phone, comment, or
              in person. Entries are permanent: there is no edit or delete, and contact
              affordances are suppressed for any linked lead.
            </p>
          </div>
          <span className="rounded-lg border border-navy-700 bg-navy-800/60 px-3 py-2 text-xs text-slate-400">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </header>

        {/* Search */}
        <div className="mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email, channel, or note…"
            aria-label="Search the do-not-contact list"
            className="w-full rounded-lg border border-navy-600 bg-navy-800 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition focus:border-gold-500"
          />
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</p>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
            <span className="ml-3 text-sm text-slate-400">Loading do-not-contact list…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-navy-700/50 bg-navy-800/40 p-10 text-center">
            <p className="text-sm font-medium text-slate-300">
              {entries.length === 0
                ? "No do-not-contact entries yet."
                : "No entries match your search."}
            </p>
            {entries.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                When someone asks to stop being contacted — by email, phone, a comment, or any
                other channel — record it here from their lead, or via the opt-out endpoint.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-navy-700/50">
            <table className="w-full text-left text-sm">
              <thead className="bg-navy-800/80 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Recorded</th>
                  <th className="px-4 py-3 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700/40 bg-navy-900/40">
                {filtered.map((e) => (
                  <tr key={e.id} className="align-top transition hover:bg-navy-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-200">
                        {e.first_name || e.last_name
                          ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim()
                          : "Not linked to a lead"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[e.phone, e.email].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
                        {channelLabel(e)}
                      </span>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Suppresses: {e.dnc_type === "both" ? "all channels" : e.dnc_type}
                        {e.source ? ` · ${SOURCE_LABELS[e.source] ?? e.source}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(e.added_at)}</td>
                    <td className="max-w-[240px] px-4 py-3 text-xs leading-relaxed text-slate-400">
                      {e.note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
