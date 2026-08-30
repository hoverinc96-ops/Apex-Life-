"use client";
import { useEffect, useState } from "react";

type KpiValue = number | null;

interface AnalyticsData {
  computedAt: string;
  totals: {
    leads: number;
    leadsByStatus: Record<string, number>;
    conversations: number;
    quotes: number;
    openReEngagement: number;
  };
  kpis: {
    contactRate: KpiValue;
    contactConversations: number;
    contactLeads: number;
    qualificationRate: KpiValue;
    qualifiedPlus: number;
    totalLeads: number;
    timeToFirstTouchAvgHours: KpiValue;
    timeToFirstTouchMedianHours: KpiValue;
    timeToFirstTouchCount: number;
    proposalConversion: KpiValue;
    proposalPlus: number;
    hoursSaved: KpiValue;
    hoursSavedConversations: number;
    hoursSavedSends: number;
  };
  reEngagement: {
    pendingFollowUps: number;
    emailsSentToday: number;
    smsSentToday: number;
    nextScheduledRun: string | null;
  };
  weekly: {
    weekStart: string; // YYYY-MM-DD (Monday)
    newLeads: number;
    conversations: number;
    qualifiedLeads: number;
    proposalsSent: number;
    closedWon: number;
  }[];
}

const STATUS_META: { key: string; label: string; color: string }[] = [
  { key: "new", label: "New", color: "bg-slate-400" },
  { key: "qualified", label: "Qualified", color: "bg-sky-400" },
  { key: "proposal_sent", label: "Proposal Sent", color: "bg-gold-400" },
  { key: "in_negotiation", label: "In Negotiation", color: "bg-orange-400" },
  { key: "pending_live_handoff", label: "Pending Handoff", color: "bg-fuchsia-400" },
  { key: "closed_won", label: "Closed Won", color: "bg-emerald-400" },
];

function fmtPct(v: KpiValue): string {
  return v === null || v === undefined ? "—" : `${v}%`;
}

function fmtHours(v: KpiValue): string {
  return v === null || v === undefined ? "—" : `${v}h`;
}

function fmtWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Card({
  label,
  value,
  sub,
  accent = "text-gold-400",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800/60 p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${accent}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function SectionTitle({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((j) => setData(j as AnalyticsData))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load metrics"));
  }, []);

  if (error) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <h2 className="text-lg font-bold text-slate-200">Analytics</h2>
        <p className="mt-1 text-sm text-slate-500">Pilot check-in metrics, computed live.</p>
        <div className="mt-6 max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
          Could not load metrics: {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <h2 className="text-lg font-bold text-slate-200">Analytics</h2>
        <p className="mt-1 text-sm text-slate-500">Pilot check-in metrics, computed live.</p>
        <div className="mt-6 rounded-xl border border-navy-700 bg-navy-800/60 p-5 text-sm text-slate-400">
          Loading live metrics…
        </div>
      </div>
    );
  }

  const { totals, kpis, reEngagement, weekly, computedAt } = data;
  const maxStatus = Math.max(1, ...STATUS_META.map((s) => totals.leadsByStatus[s.key] ?? 0));
  const ttf = kpis.timeToFirstTouchCount > 0
    ? `${fmtHours(kpis.timeToFirstTouchAvgHours)} avg · ${fmtHours(kpis.timeToFirstTouchMedianHours)} med`
    : "—";

  return (
    <div className="flex-1 overflow-auto p-8">
      <h2 className="text-lg font-bold text-slate-200">Analytics</h2>
      <p className="mt-1 text-sm text-slate-500">
        Pilot check-in metrics — every number computed live from your database.
      </p>

      {/* ── Pipeline totals ─────────────────────────────────────────────── */}
      <section className="mt-6">
        <SectionTitle title="Pipeline totals" hint="Current snapshot of the CRM pipeline." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card label="Total leads" value={String(totals.leads)} sub="All leads in the pipeline" />
          <Card label="Conversations" value={String(totals.conversations)} sub="Voice, SMS & web-chat sessions" />
          <Card label="Quotes" value={String(totals.quotes)} sub="Carrier quotes created" />
          <Card label="Open re-engagement" value={String(totals.openReEngagement)} sub="Pending follow-ups in queue" />
        </div>

        <div className="mt-4 rounded-xl border border-navy-700 bg-navy-800/60 p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Leads by status</div>
          <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {STATUS_META.map((s) => {
              const count = totals.leadsByStatus[s.key] ?? 0;
              return (
                <div key={s.key}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-400">{s.label}</span>
                    <span className="text-sm font-semibold text-slate-200">{count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-navy-700">
                    <div
                      className={`h-full rounded-full ${s.color}`}
                      style={{ width: `${(count / maxStatus) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Five pilot KPIs ─────────────────────────────────────────────── */}
      <section className="mt-8">
        <SectionTitle
          title="Pilot KPIs"
          hint="The five metrics we review in weekly pilot check-ins."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <div className="rounded-xl border border-navy-700 bg-navy-800/60 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">Contact rate</div>
            <div className="mt-2 text-3xl font-bold text-gold-400">{fmtPct(kpis.contactRate)}</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Leads reached at least once — conversations ÷ total leads × 100.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {kpis.contactConversations} conversations · {kpis.contactLeads} leads
            </p>
          </div>

          <div className="rounded-xl border border-navy-700 bg-navy-800/60 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">Qualification rate</div>
            <div className="mt-2 text-3xl font-bold text-gold-400">{fmtPct(kpis.qualificationRate)}</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Leads that reached qualified or beyond ÷ total leads × 100.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {kpis.qualifiedPlus} of {kpis.totalLeads} leads qualified or beyond
            </p>
          </div>

          <div className="rounded-xl border border-navy-700 bg-navy-800/60 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">Time to first touch</div>
            <div className="mt-2 text-3xl font-bold text-gold-400">{ttf}</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Avg (and median) hours between a lead being created and its first conversation message.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {kpis.timeToFirstTouchCount > 0
                ? `${kpis.timeToFirstTouchCount} lead${kpis.timeToFirstTouchCount === 1 ? "" : "s"} measured`
                : "No conversation messages yet"}
            </p>
          </div>

          <div className="rounded-xl border border-navy-700 bg-navy-800/60 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">Proposal conversion</div>
            <div className="mt-2 text-3xl font-bold text-gold-400">{fmtPct(kpis.proposalConversion)}</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Leads that reached proposal_sent or beyond, out of those qualified.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {kpis.proposalPlus} of {kpis.qualifiedPlus} qualified leads got a proposal
            </p>
          </div>

          <div className="rounded-xl border border-navy-700 bg-navy-800/60 p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">Hours saved (est.)</div>
            <div className="mt-2 text-3xl font-bold text-gold-400">{fmtHours(kpis.hoursSaved)}</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Estimate — (conversations × 8 min + re-engagement sends × 2 min) ÷ 60. Rep hours the AI agents
              handled instead of your team.
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {kpis.hoursSavedConversations} conv × 8 min + {kpis.hoursSavedSends} sends × 2 min
            </p>
          </div>
        </div>
      </section>

      {/* ── Weekly check-in ─────────────────────────────────────────────── */}
      <section className="mt-8">
        <SectionTitle
          title="Weekly check-in — last 8 weeks"
          hint="Counts bucketed by creation date (weeks start Monday). Qualified and closed-won reflect each lead's current status."
        />
        <div className="overflow-x-auto rounded-xl border border-navy-700 bg-navy-800/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Week of</th>
                <th className="px-5 py-3 text-right font-medium">New leads</th>
                <th className="px-5 py-3 text-right font-medium">Conversations</th>
                <th className="px-5 py-3 text-right font-medium">Qualified</th>
                <th className="px-5 py-3 text-right font-medium">Proposals sent</th>
                <th className="px-5 py-3 text-right font-medium">Closed won</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((w) => (
                <tr key={w.weekStart} className="border-b border-navy-700/50 last:border-0">
                  <td className="px-5 py-2.5 text-slate-300">{fmtWeek(w.weekStart)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-200">{w.newLeads}</td>
                  <td className="px-5 py-2.5 text-right text-slate-200">{w.conversations}</td>
                  <td className="px-5 py-2.5 text-right text-slate-200">{w.qualifiedLeads}</td>
                  <td className="px-5 py-2.5 text-right text-slate-200">{w.proposalsSent}</td>
                  <td className="px-5 py-2.5 text-right text-emerald-400">{w.closedWon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Re-engagement queue ─────────────────────────────────────────── */}
      <section className="mt-8">
        <SectionTitle title="Re-engagement queue" hint="Automated follow-up engine status." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Card label="Pending follow-ups" value={String(reEngagement.pendingFollowUps)} sub="Scheduled re-engagement steps" />
          <Card label="Emails sent today" value={String(reEngagement.emailsSentToday)} sub="Delivered via Resend" accent="text-emerald-400" />
          <Card
            label="Next scheduled run"
            value={reEngagement.nextScheduledRun ? fmtTimestamp(reEngagement.nextScheduledRun) : "—"}
            sub={reEngagement.nextScheduledRun ? "Next pending follow-up" : "No pending follow-ups scheduled"}
          />
        </div>
      </section>

      {/* ── Data source note ────────────────────────────────────────────── */}
      <p className="mt-8 border-t border-navy-700/50 pt-4 text-xs text-slate-600">
        Metrics computed live from your database at {fmtTimestamp(computedAt)} — they will update as real pilot
        data flows in.
      </p>
    </div>
  );
}
