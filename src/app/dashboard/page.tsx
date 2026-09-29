"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ImportLeadsPanel from "@/components/ImportLeadsPanel";
import LeadDetailPanel from "@/components/LeadDetailPanel";
import AddLeadModal from "@/components/AddLeadModal";
import ShareLinkModal from "@/components/ShareLinkModal";
import { Lead } from "@/lib/mock-data";
import { CLIENT_STATUS_META, formatAddedDate, sourceLabel } from "@/lib/status";
import { attributionChipLabel } from "@/lib/attribution";

type KpiValue = number | null;

interface AnalyticsKpis {
  contactRate: KpiValue;
  qualificationRate: KpiValue;
  timeToFirstTouchAvgHours: KpiValue;
  timeToFirstTouchMedianHours: KpiValue;
  timeToFirstTouchCount: number;
  proposalConversion: KpiValue;
  hoursSaved: KpiValue;
}

const RECENT_CLIENTS_COUNT = 8;

function fmtPct(v: KpiValue): string {
  return v === null || v === undefined ? "—" : `${v}%`;
}

function fmtHours(v: KpiValue): string {
  return v === null || v === undefined ? "—" : `${v}h`;
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

export default function DashboardHomePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [kpis, setKpis] = useState<AnalyticsKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [today, setToday] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const fetchLeads = useCallback(async () => {
    try {
      const response = await fetch("/api/leads", { cache: "no-store" });
      if (!response.ok) return;
      setLeads(await response.json());
    } catch {
      // Recent-clients list stays empty on failure; nothing is fabricated.
    }
  }, []);

  useEffect(() => {
    fetchLeads();
    setToday(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    );
    fetch("/api/analytics")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setKpis(j ? (j.kpis as AnalyticsKpis) : null))
      .catch(() => setKpis(null))
      .finally(() => setKpisLoading(false));
  }, [fetchLeads]);

  const handleStatusChange = async (leadId: string, newStatus: Lead["status"]) => {
    const response = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!response.ok) throw new Error("Unable to update lead status");
    await fetchLeads();
    setSelectedLead((prev) => (prev && prev.id === leadId ? { ...prev, status: newStatus } : prev));
  };

  const recent = leads.slice(0, RECENT_CLIENTS_COUNT);

  const ttf =
    kpis && kpis.timeToFirstTouchCount > 0
      ? `${fmtHours(kpis.timeToFirstTouchAvgHours)} avg`
      : "—";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl p-6 lg:p-8">
        {/* ── Greeting ─────────────────────────────────────────────────── */}
        <header>
          <h2 className="text-2xl font-bold text-emerald-950">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">{today || "\u00a0"}</p>
          <div className="mt-3 h-0.5 w-10 rounded-full bg-amber-500" aria-hidden="true" />
        </header>

        {/* ── Quick actions ────────────────────────────────────────────── */}
        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-base text-emerald-600">＋</span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">Add lead</span>
              <span className="block text-xs text-slate-500">Enter a contact by hand</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCsvOpen((v) => !v)}
            aria-expanded={csvOpen}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-base text-emerald-600">📄</span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">Import CSV</span>
              <span className="block text-xs text-slate-500">Bulk-upload your lead list</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-base text-emerald-600">🔗</span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">Share quote link</span>
              <span className="block text-xs text-slate-500">Send people to your quote form</span>
            </span>
          </button>
          <Link
            href="/dashboard/compliance"
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-base text-emerald-600">🛡️</span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">Do-not-contact registry</span>
              <span className="block text-xs text-slate-500">Review opt-outs and consent</span>
            </span>
          </Link>
        </section>

        {/* CSV import panel (toggled by the quick action above) */}
        <div className={csvOpen ? "mt-4" : "hidden"}>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <ImportLeadsPanel forceOpen={csvOpen} onImported={fetchLeads} />
          </div>
        </div>

        {/* ── KPI strip ────────────────────────────────────────────────── */}
        <section className="mt-8">
          <h3 className="text-sm font-semibold text-emerald-950">Pilot KPIs</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            The five metrics reviewed in weekly pilot check-ins — computed live, never estimated to
            look complete.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {kpisLoading ? (
              Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
              ))
            ) : !kpis ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm sm:col-span-2 xl:col-span-5">
                Metrics couldn&apos;t be loaded right now — the Analytics page will retry them.
              </div>
            ) : (
              <>
                <KpiCard label="Contact rate" value={fmtPct(kpis.contactRate)} sub={kpis.contactRate === null ? "No data yet" : "Leads reached at least once"} />
                <KpiCard label="Qualification rate" value={fmtPct(kpis.qualificationRate)} sub={kpis.qualificationRate === null ? "No data yet" : "Qualified or beyond"} />
                <KpiCard label="Time to first touch" value={ttf} sub={kpis.timeToFirstTouchCount > 0 ? "Average, lead created → first message" : "No data yet"} />
                <KpiCard label="Proposal conversion" value={fmtPct(kpis.proposalConversion)} sub={kpis.proposalConversion === null ? "No data yet" : "Proposals out of qualified leads"} />
                <KpiCard label="Hours saved (est.)" value={fmtHours(kpis.hoursSaved)} sub={kpis.hoursSaved === null ? "No data yet" : "Rep time handled by the AI agents"} />
              </>
            )}
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── Recent clients ─────────────────────────────────────────── */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-emerald-950">Recent clients</h3>
                <p className="mt-0.5 text-xs text-slate-500">Newest first — click a row to open the full record.</p>
              </div>
              <Link
                href="/dashboard/clients"
                className="text-xs font-semibold text-emerald-600 underline-offset-2 hover:text-emerald-700 hover:underline"
              >
                View all
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                No clients yet — add one or import a CSV to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3 font-medium">Name</th>
                      <th className="px-5 py-3 font-medium">Source</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 text-right font-medium">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((lead) => {
                      const meta = CLIENT_STATUS_META[lead.status];
                      return (
                        <tr
                          key={lead.id}
                          onClick={() => setSelectedLead(lead)}
                          className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                        >
                          <td className="px-5 py-3 font-medium text-slate-900">
                            {lead.first_name} {lead.last_name}
                            {lead.do_not_contact && (
                              <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                                Do not contact
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {sourceLabel(lead.source)}
                            {/* E4 — attribution chip, only when something was captured */}
                            {(() => {
                              const attr = attributionChipLabel(lead);
                              return attr ? (
                                <span className="ml-1.5 inline-flex whitespace-nowrap rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                  {attr}
                                </span>
                              ) : null;
                            })()}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${meta?.badge ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>
                              {meta?.label ?? lead.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-slate-600">
                            {formatAddedDate(lead.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Compensation + resources ───────────────────────────────── */}
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-emerald-950">Compensation</h3>
              <div className="mt-3 text-3xl font-bold text-slate-900">$0</div>
              <p className="mt-1 text-sm text-slate-600">No payouts recorded yet</p>
              <p className="mt-3 text-xs text-slate-500">
                Issued-policy commissions will appear here.
              </p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-emerald-950">Resources</h3>
              <p className="mt-0.5 text-xs text-slate-500">Compliance-reviewed materials.</p>
              <div className="mt-3 space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-emerald-950">Outreach starter pack</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Six organic post drafts and one paid-ad concept for your quote funnel — every
                    line checked against the do-not-say list. Ready to post from your own accounts
                    whenever you choose.
                  </p>
                </div>
                <Link
                  href="/dashboard/compliance"
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
                >
                  <p className="text-sm font-semibold text-emerald-950">Compliance vault</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Consent records, the do-not-contact list, and the audit trail.
                  </p>
                </Link>
                <Link
                  href="/dashboard/compliance"
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
                >
                  <p className="text-sm font-semibold text-emerald-950">Do-not-contact registry</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Every opt-out on record — searchable, permanent, honored on every channel.
                  </p>
                </Link>
                <Link
                  href="/book"
                  target="_blank"
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
                >
                  <p className="text-sm font-semibold text-emerald-950">Booking page</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Your call-request form — requests land in your bookings for you to confirm.
                  </p>
                </Link>
                <Link
                  href="/get-quote"
                  target="_blank"
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300"
                >
                  <p className="text-sm font-semibold text-emerald-950">Quote form</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    Preview the form your shared link opens.
                  </p>
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>

      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={handleStatusChange}
        />
      )}
      {addOpen && <AddLeadModal onClose={() => setAddOpen(false)} onAdded={fetchLeads} />}
      {shareOpen && <ShareLinkModal onClose={() => setShareOpen(false)} />}
    </div>
  );
}
