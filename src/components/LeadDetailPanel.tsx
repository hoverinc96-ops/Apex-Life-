"use client";

import { useEffect, useState } from "react";
import {
  Lead,
  LeadStatus,
  Quote,
  Conversation,
  TimelineEvent,
  formatCurrency,
  getScoreColor,
} from "@/lib/mock-data";
import { TeamMember } from "@/lib/team-types";

type DetailedLead = Lead & {
  quotes: Quote[];
  conversations: Conversation[];
  timeline: TimelineEvent[];
};

const TIMELINE_ICONS: Record<TimelineEvent["type"], string> = {
  lead_created: "✨",
  status_changed: "🔁",
  conversation: "💬",
  message: "📨",
  quote: "📄",
};

const fmtTimestamp = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

interface LeadDetailPanelProps {
  lead: Lead;
  onClose: () => void;
  onStatusChange: (leadId: string, newStatus: LeadStatus) => void;
}

const ALL_STATUSES: LeadStatus[] = [
  "new",
  "qualified",
  "proposal_sent",
  "in_negotiation",
  "pending_live_handoff",
  "closed_won",
];

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New Leads",
  qualified: "Qualified",
  proposal_sent: "Proposal Sent",
  in_negotiation: "In Negotiation",
  pending_live_handoff: "Pending Live Handoff",
  closed_won: "Closed Won",
};

type Tab = "quotes" | "conversations" | "timeline";

export default function LeadDetailPanel({ lead, onClose, onStatusChange }: LeadDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("quotes");
  const [details, setDetails] = useState<DetailedLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Warm handoff state — push a qualified lead + its context to a rep.
  const [reps, setReps] = useState<TeamMember[]>([]);
  const [showHandoffForm, setShowHandoffForm] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffSuccessRep, setHandoffSuccessRep] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/leads/${displayLead.id}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load lead details");
        return response.json();
      })
      .then((data: DetailedLead) => { if (!cancelled) setDetails(data); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load lead details"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lead.id]);

  // Load available reps for the handoff form (filter to role 'rep').
  useEffect(() => {
    let cancelled = false;
    fetch("/api/team", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((members: TeamMember[]) => {
        if (!cancelled) setReps(members.filter((m) => m.role === "rep"));
      })
      .catch(() => { /* best-effort; no reps means the form shows the add-rep hint */ });
    return () => { cancelled = true; };
  }, []);

  const displayLead = details ?? lead;
  const scoreColor = getScoreColor(displayLead.qualification_score);
  const quotes = details?.quotes ?? [];
  const conversations = details?.conversations ?? [];
  const timeline = details?.timeline ?? [];
  const healthEntries = Object.entries(displayLead.health_notes as Record<string, unknown>);

  // ── Handoff affordance ──────────────────────────────────────────────
  // A lead can be handed off only before it's already queued for a live
  // handoff or otherwise worked past that point (not new, not handed off,
  // not closed). This is a CONTEXT TRANSFER — no live phone call is routed.
  const PRE_HANDOFF_STATUSES: LeadStatus[] = ["qualified", "proposal_sent", "in_negotiation"];
  const isHandoffEligible = PRE_HANDOFF_STATUSES.includes(displayLead.status);
  const alreadyHandedOff = displayLead.status === "pending_live_handoff";
  const assignedRepId = (displayLead as unknown as Record<string, unknown>).assigned_rep_id as string | null | undefined;
  const assignedRepName = assignedRepId
    ? reps.find((r) => r.id === assignedRepId)?.name ?? null
    : null;

  const handleHandoff = async () => {
    if (!selectedRepId) return;
    setHandoffBusy(true);
    setHandoffError(null);
    setHandoffSuccessRep(null);
    try {
      const res = await fetch("/api/handoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, repId: selectedRepId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to hand off lead");
      const repName = reps.find((r) => r.id === selectedRepId)?.name ?? "the rep";
      setHandoffSuccessRep(repName);
      setShowHandoffForm(false);
      setSelectedRepId("");
      // Refresh the panel so it reflects the move to Pending Live Handoff.
      setLoading(true);
      fetch(`/api/leads/${lead.id}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to refresh lead details");
          return response.json();
        })
        .then((d: DetailedLead) => setDetails(d))
        .catch(() => {})
        .finally(() => setLoading(false));
      // Refresh the parent kanban so the lead moves into the handoff column.
      onStatusChange(lead.id, "pending_live_handoff");
    } catch (err) {
      setHandoffError(err instanceof Error ? err.message : "Unable to hand off lead");
    } finally {
      setHandoffBusy(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-navy-700/50 bg-navy-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-700/50 px-6 py-4">
          <h2 className="text-lg font-bold text-white">
            {displayLead.first_name} {displayLead.last_name}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-navy-800 hover:text-white"
            aria-label="Close panel"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="relative flex-1 overflow-y-auto">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-start justify-center bg-navy-900/80 pt-24">
              <Spinner />
              <span className="ml-3 text-sm text-slate-400">Loading lead details...</span>
            </div>
          )}
          {error && <p className="m-6 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</p>}
          {/* Lead info section */}
          <div className="border-b border-navy-700/30 px-6 py-5">
            <div className="mb-4 flex items-center gap-3">
              <span className={`inline-flex items-center rounded-lg px-3 py-1 text-sm font-bold ${scoreColor}`}>
                {displayLead.qualification_score !== null ? `Score: ${displayLead.qualification_score}` : "Not scored"}
              </span>
              <span className="text-xs text-slate-500">
                {displayLead.state} · {displayLead.zip_code}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="text-slate-200">{displayLead.email}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Phone</p>
                <p className="text-slate-200">{displayLead.phone}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Date of Birth</p>
                <p className="text-slate-200">{displayLead.date_of_birth}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Coverage Requested</p>
                <p className="text-slate-200">{formatCurrency(displayLead.coverage_amount_requested)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Annual Income</p>
                <p className="text-slate-200">{formatCurrency(displayLead.annual_income)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Tobacco</p>
                <p className="text-slate-200">{displayLead.tobacco_user ? "Yes" : "No"}</p>
              </div>
            </div>

            {/* Health notes */}
            {healthEntries.length > 0 && (
              <div className="mt-4 rounded-lg border border-navy-700/30 bg-navy-800/50 p-3">
                <p className="mb-2 text-xs font-medium text-slate-400 uppercase tracking-wider">Health Notes</p>
                {healthEntries.map(([key, value]) => (
                  <div key={key} className="text-xs text-slate-300">
                    <span className="capitalize text-slate-500">{key.replace(/_/g, " ")}: </span>
                    {Array.isArray(value) && value.length > 0
                      ? value.join(", ")
                      : Array.isArray(value)
                        ? "None"
                        : String(value)}
                  </div>
                ))}
              </div>
            )}

            {/* Status dropdown */}
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-slate-400 uppercase tracking-wider">
                Pipeline Stage
              </label>
              <select
                value={displayLead.status}
                onChange={(e) => onStatusChange(lead.id, e.target.value as LeadStatus)}
                className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-gold-500"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            {/* Hand off to rep */}
            {alreadyHandedOff ? (
              <div className="mt-4 rounded-lg border border-gold-500/30 bg-gold-500/10 p-3">
                <p className="text-xs font-medium text-gold-300">
                  Handed off to {assignedRepName ?? "a rep"}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                  The lead and its context are queued in the rep's handoff inbox — ready for them to claim and work.
                </p>
              </div>
            ) : isHandoffEligible ? (
              <div className="mt-4 rounded-lg border border-navy-700/40 bg-navy-800/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Hand off to rep</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                      Hand off the qualified lead and its context to a rep's inbox. This transfers the lead and working
                      notes — it is not a live phone call.
                    </p>
                  </div>
                  {!showHandoffForm && !handoffSuccessRep && (
                    <button
                      onClick={() => setShowHandoffForm((v) => !v)}
                      className="shrink-0 rounded-lg border border-gold-500/50 bg-gold-500/10 px-3 py-1.5 text-xs font-semibold text-gold-300 transition hover:bg-gold-500/20"
                    >
                      Hand off
                    </button>
                  )}
                </div>

                {handoffSuccessRep && (
                  <p className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                    🎉 Handed off to {handoffSuccessRep}. The lead is now Pending Live Handoff and appears in their inbox.
                  </p>
                )}

                {showHandoffForm && (
                  <div className="mt-3 space-y-2.5">
                    {reps.length === 0 ? (
                      <div className="rounded-md border border-navy-600/60 bg-navy-900/60 px-3 py-2.5 text-xs text-slate-400">
                        No reps yet.{" "}
                        <a href="/dashboard/team" className="font-semibold text-gold-400 underline underline-offset-2 hover:text-gold-300">
                          Add a rep on the Team page
                        </a>{" "}
                        to hand this lead off.
                      </div>
                    ) : (
                      <>
                        <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                          Assign to rep
                        </label>
                        <select
                          value={selectedRepId}
                          onChange={(e) => setSelectedRepId(e.target.value)}
                          className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-gold-500"
                        >
                          <option value="">Select a rep…</option>
                          {reps.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        {handoffError && (
                          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                            {handoffError}
                          </p>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={handleHandoff}
                            disabled={handoffBusy || !selectedRepId}
                            className="flex-1 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-60"
                          >
                            {handoffBusy ? "Handing off..." : "Confirm hand off"}
                          </button>
                          <button
                            onClick={() => { setShowHandoffForm(false); setHandoffError(null); }}
                            className="rounded-lg border border-navy-600 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-navy-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Tabs */}
          <div className="border-b border-navy-700/30">
            <div className="flex">
              {(["quotes", "conversations", "timeline"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-3 text-xs font-semibold uppercase tracking-wider transition ${
                    activeTab === tab
                      ? "border-b-2 border-gold-500 text-gold-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="px-6 py-4">
            {activeTab === "quotes" && (
              <div className="space-y-3">
                {quotes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-600">No quotes generated yet.</p>
                ) : (
                  quotes.map((q) => (
                    <div key={q.id} className="rounded-xl border border-navy-700/30 bg-navy-800/50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-semibold text-slate-200">{q.carrier_name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                          q.status === "accepted"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : q.status === "presented"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-slate-600/30 text-slate-400"
                        }`}>
                          {q.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs text-slate-400">
                        <span>Type: <span className="capitalize text-slate-300">{q.policy_type.replace(/_/g, " ")}</span></span>
                        {q.term_length_years && <span>Term: <span className="text-slate-300">{q.term_length_years} years</span></span>}
                        <span>Coverage: <span className="text-slate-300">{formatCurrency(q.coverage_amount)}</span></span>
                        <span>Monthly: <span className="text-slate-300">{formatCurrency(q.monthly_premium)}</span></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "conversations" && (
              <div className="space-y-4">
                {conversations.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-600">No conversations yet.</p>
                ) : (
                  conversations.map((conv) => (
                    <div key={conv.id} className="space-y-3">
                      <div className="rounded-xl border border-navy-700/30 bg-navy-800/50 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded bg-navy-700 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                            {conv.channel}
                          </span>
                          <span className="text-[10px] text-slate-500 capitalize">{conv.direction}</span>
                          <span className="ml-auto text-xs text-slate-500">
                            Sentiment: {(conv.sentiment_score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed text-slate-300">{conv.summary}</p>
                        {conv.key_objections.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {conv.key_objections.map((obj, i) => (
                              <span key={i} className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                                {obj.replace(/_/g, " ")}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Messages */}
                      <div className="space-y-2 rounded-xl border border-navy-700/20 bg-navy-800/20 p-4">
                        {conv.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.sender_role === "ai" ? "justify-start" : "justify-end"}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                                msg.sender_role === "ai"
                                  ? "bg-navy-700 text-slate-200"
                                  : "bg-gold-500/20 text-gold-300"
                              }`}
                            >
                              <p className="mb-0.5 text-[10px] font-semibold uppercase opacity-60">
                                {msg.sender_role === "ai" ? "AI Agent" : displayLead.first_name}
                              </p>
                              <p>{msg.content}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "timeline" && (
              <div className="space-y-3">
                {timeline.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-600">No activity yet.</p>
                ) : (
                  <ol className="relative ml-3 space-y-5 border-l border-navy-700/50 pl-5">
                    {timeline.map((evt) => (
                      <li key={evt.id} className="relative">
                        <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full border border-navy-600 bg-navy-900 text-[10px]">
                          {TIMELINE_ICONS[evt.type]}
                        </span>
                        <p className="text-sm font-medium text-slate-200">{evt.title}</p>
                        {evt.description ? (
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{evt.description}</p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-slate-600">{fmtTimestamp(evt.timestamp)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Spinner() { return <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-gold-400" aria-label="Loading" />; }
