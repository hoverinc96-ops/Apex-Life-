"use client";

import { useEffect, useState } from "react";

interface InquiryRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  state: string | null;
  status: string;
  source: string;
  owner_only: boolean;
  created_at: string;
}

interface BookingRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  topic: string;
  requested_time: string | null;
  status: string;
  owner_only: boolean;
  google_sync_status?: string | null;
  google_event_id?: string | null;
  created_at: string;
}

interface OwnerPipelineData {
  inquiries: InquiryRow[];
  bookings: BookingRow[];
}

const INQUIRY_STATUS_META: Record<string, { label: string; className: string }> = {
  new: { label: "New", className: "bg-slate-400/10 text-slate-300 border-slate-400/20" },
  qualified: { label: "Qualified", className: "bg-sky-400/10 text-sky-300 border-sky-400/20" },
  proposal_sent: { label: "Proposal Sent", className: "bg-gold-400/10 text-gold-300 border-gold-400/20" },
  in_negotiation: { label: "In Negotiation", className: "bg-orange-400/10 text-orange-300 border-orange-400/20" },
  closed_won: { label: "Closed Won", className: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20" },
  closed_lost: { label: "Closed Lost", className: "bg-red-400/10 text-red-300 border-red-400/20" },
};

const BOOKING_STATUS_META: Record<string, { label: string; className: string }> = {
  requested: { label: "Requested", className: "bg-slate-400/10 text-slate-300 border-slate-400/20" },
  confirmed: { label: "Confirmed", className: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20" },
  cancelled: { label: "Cancelled", className: "bg-red-400/10 text-red-300 border-red-400/20" },
};

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status, meta }: { status: string; meta: Record<string, { label: string; className: string }> }) {
  const m = meta[status] ?? { label: status, className: "bg-navy-600 text-slate-300 border-navy-500" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.className}`}>
      {m.label}
    </span>
  );
}

/**
 * Owner's private pipeline (Mode-1 owner seat). Lists consumer inquiries and
 * booking requests — both tagged owner_only — completely separate from the
 * partner/tenant kanban at /dashboard. Reads /api/owner-pipeline.
 */
export default function OwnerDashboardPage() {
  const [data, setData] = useState<OwnerPipelineData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/owner-pipeline")
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((j) => setData(j as OwnerPipelineData))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load owner pipeline"));
  }, []);

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-200">Owner Pipeline</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your private intake — consumer inquiries and booking requests. Separate from partner/tenant demo data.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-medium text-gold-400">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
          Owner private seat
        </span>
      </div>

      {error && (
        <div className="mt-6 max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
          Could not load owner pipeline: {error}
        </div>
      )}

      {!data && !error && (
        <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800/60 p-5 text-sm text-slate-400">
          Loading owner pipeline…
        </div>
      )}

      {data && (
        <>
          {/* ── Consumer inquiries ─────────────────────────────────────── */}
          <section className="mt-8">
            <h3 className="text-sm font-semibold text-slate-200">
              Consumer inquiries <span className="ml-1 text-xs font-normal text-slate-500">({data.inquiries.length})</span>
            </h3>
            <div className="mt-3 overflow-x-auto rounded-xl border border-navy-700 bg-navy-800/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-700 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Phone</th>
                    <th className="px-5 py-3 font-medium">State</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {data.inquiries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-6 text-center text-slate-500">
                        No consumer inquiries yet.
                      </td>
                    </tr>
                  )}
                  {data.inquiries.map((r) => (
                    <tr key={r.id} className="border-b border-navy-700/50 last:border-0">
                      <td className="px-5 py-2.5 text-slate-200">
                        {r.first_name} {r.last_name}
                      </td>
                      <td className="px-5 py-2.5 text-slate-400">{r.email}</td>
                      <td className="px-5 py-2.5 text-slate-400">{r.phone || "—"}</td>
                      <td className="px-5 py-2.5 text-slate-400">{r.state || "—"}</td>
                      <td className="px-5 py-2.5"><StatusBadge status={r.status} meta={INQUIRY_STATUS_META} /></td>
                      <td className="px-5 py-2.5 text-xs text-slate-500">{fmtTimestamp(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Booking requests ───────────────────────────────────────── */}
          <section className="mt-8">
            <h3 className="text-sm font-semibold text-slate-200">
              Booking requests <span className="ml-1 text-xs font-normal text-slate-500">({data.bookings.length})</span>
            </h3>
            <div className="mt-3 overflow-x-auto rounded-xl border border-navy-700 bg-navy-800/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-700 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Phone</th>
                    <th className="px-5 py-3 font-medium">Topic</th>
                    <th className="px-5 py-3 font-medium">Preferred time</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Calendar</th>
                    <th className="px-5 py-3 font-medium">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-6 text-center text-slate-500">
                        No booking requests yet.
                      </td>
                    </tr>
                  )}
                  {data.bookings.map((r) => (
                    <tr key={r.id} className="border-b border-navy-700/50 last:border-0">
                      <td className="px-5 py-2.5 text-slate-200">{r.name}</td>
                      <td className="px-5 py-2.5 text-slate-400">{r.email}</td>
                      <td className="px-5 py-2.5 text-slate-400">{r.phone || "—"}</td>
                      <td className="px-5 py-2.5 text-slate-400">{r.topic}</td>
                      <td className="px-5 py-2.5 text-slate-400">{r.requested_time || "Any — you pick"}</td>
                      <td className="px-5 py-2.5"><StatusBadge status={r.status} meta={BOOKING_STATUS_META} /></td>
                      <td className="px-5 py-2.5 text-xs text-slate-500">
                        {r.google_sync_status === "synced"
                          ? "Synced ✓"
                          : r.google_sync_status === "skipped_no_config" ||
                              r.google_sync_status === "skipped_no_auth"
                            ? "Not synced (calendar not connected)"
                            : r.google_sync_status === "error"
                              ? "Sync error"
                              : "Not synced"}
                      </td>
                      <td className="px-5 py-2.5 text-xs text-slate-500">{fmtTimestamp(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}