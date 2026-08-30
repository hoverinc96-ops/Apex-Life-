"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Handoff, HandoffContext, TeamMember, HandoffPriority } from "@/lib/team-types";

type InboxView = "active" | "declined";

function Spinner() {
  return (
    <span
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-gold-400"
      aria-label="Loading"
    />
  );
}

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Priority cue — an urgency hint for which warm lead to work first. These SLA
 *  hints are honest WORKING TARGETS for a rep, not guaranteed real-time
 *  response times (this is a context transfer in the CRM, not paging). */
const PRIORITY_META: Record<
  HandoffPriority,
  { label: string; hint: string; badge: string; dot: string }
> = {
  urgent: {
    label: "Urgent",
    hint: "Work within ~15 min — working target, not guaranteed",
    badge: "border-red-500/40 bg-red-500/10 text-red-300",
    dot: "bg-red-400",
  },
  high: {
    label: "High",
    hint: "Work within the hour — working target, not guaranteed",
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
  },
  normal: {
    label: "Normal",
    hint: "Work same day — working target, not guaranteed",
    badge: "border-slate-500/40 bg-slate-500/10 text-slate-300",
    dot: "bg-slate-400",
  },
};

function ContextBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-navy-700/50 bg-navy-900/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1.5 text-xs text-slate-300">{children}</div>
    </div>
  );
}

export default function InboxPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [declined, setDeclined] = useState<Handoff[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [repFilter, setRepFilter] = useState<string>("all");
  const [view, setView] = useState<InboxView>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reassign picker state (owner-facing, per handoff)
  const [reassignFor, setReassignFor] = useState<Handoff | null>(null);
  const [reassignRepId, setReassignRepId] = useState<string>("");
  const [reassignReason, setReassignReason] = useState<string>("");

  // Decline state (optional reason)
  const [declineFor, setDeclineFor] = useState<Handoff | null>(null);
  const [declineReason, setDeclineReason] = useState<string>("");

  // Re-hand-off state (owner re-routes a declined handoff manually)
  const [rehandoffFor, setRehandoffFor] = useState<Handoff | null>(null);
  const [rehandoffRepId, setRehandoffRepId] = useState<string>("");

  const fetchInbox = useCallback(async () => {
    try {
      setError(null);
      const qs = repFilter && repFilter !== "all" ? `?repId=${repFilter}` : "";
      const [activeRes, declinedRes] = await Promise.all([
        fetch(`/api/handoffs${qs}`, { cache: "no-store" }),
        fetch(`/api/handoffs?status=declined`, { cache: "no-store" }),
      ]);
      if (!activeRes.ok) throw new Error("Unable to load handoffs");
      const active: Handoff[] = await activeRes.json();
      const declinedList: Handoff[] = declinedRes.ok
        ? await declinedRes.json()
        : [];
      // Sort higher priority first (defensive; backend already orders it).
      const rank = (p?: HandoffPriority) =>
        p === "urgent" ? 0 : p === "high" ? 1 : 2;
      active.sort(
        (a, b) => rank(a.priority) - rank(b.priority) || +new Date(b.created_at) - +new Date(a.created_at)
      );
      setHandoffs(active);
      setDeclined(declinedList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load handoffs");
    } finally {
      setLoading(false);
    }
  }, [repFilter]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  // Load team for the rep filter, reassign picker, and re-hand-off picker
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/team", { cache: "no-store" });
        if (res.ok) setMembers(await res.json());
      } catch {
        /* best-effort */
      }
    })();
  }, []);

  const repOptions = useMemo(
    () => members.filter((m) => m.role === "rep"),
    [members]
  );
  // Reassign/re-hand-off pickers can target any rep except the current holder.
  const pickers = (currentRepId: string) =>
    repOptions.filter((m) => m.id !== currentRepId);

  const doAction = async (action: "claim" | "complete", h: Handoff, closedWon = false) => {
    setBusyId(h.id);
    try {
      const body = action === "complete" ? JSON.stringify({ closedWon }) : undefined;
      const res = await fetch(
        action === "claim"
          ? `/api/handoffs/${h.id}/claim`
          : `/api/handoffs/${h.id}/complete`,
        {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body,
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Unable to ${action} handoff`);
        return;
      }
      await fetchInbox();
    } catch {
      alert(`Unable to ${action} handoff`);
    } finally {
      setBusyId(null);
    }
  };

  // Owner action: move a warm handoff to another rep (context transfer in CRM).
  const doReassign = async (h: Handoff) => {
    if (!reassignRepId) {
      alert("Pick a rep to reassign to.");
      return;
    }
    setBusyId(h.id);
    try {
      const res = await fetch(`/api/handoffs/${h.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repId: reassignRepId, reason: reassignReason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Unable to reassign handoff");
        return;
      }
      setReassignFor(null);
      setReassignRepId("");
      setReassignReason("");
      await fetchInbox();
    } catch {
      alert("Unable to reassign handoff");
    } finally {
      setBusyId(null);
    }
  };

  // Rep declines (optional reason). Declined handoff stays visible in the
  // Declined view so nothing is lost; the owner re-routes it manually.
  const doDecline = async (h: Handoff) => {
    setBusyId(h.id);
    try {
      const res = await fetch(`/api/handoffs/${h.id}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Unable to decline handoff");
        return;
      }
      setDeclineFor(null);
      setDeclineReason("");
      await fetchInbox();
    } catch {
      alert("Unable to decline handoff");
    } finally {
      setBusyId(null);
    }
  };

  // Owner re-routes a declined handoff to a chosen rep (manual, NOT autonomous).
  const doRehandoff = async (h: Handoff) => {
    if (!rehandoffRepId) {
      alert("Pick a rep to re-hand this lead off to.");
      return;
    }
    setBusyId(h.id);
    try {
      const res = await fetch(`/api/handoffs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: h.lead_id, repId: rehandoffRepId, priority: h.priority }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Unable to re-hand off lead");
        return;
      }
      setRehandoffFor(null);
      setRehandoffRepId("");
      await fetchInbox();
    } catch {
      alert("Unable to re-hand off lead");
    } finally {
      setBusyId(null);
    }
  };

  function renderContext(h: Handoff) {
    const c: HandoffContext = h.context || {};
    const score =
      typeof c.qualification_score === "number" ? c.qualification_score : null;
    const q = c.quote_reference;
    const reassignments = Array.isArray(c.reassignments) ? c.reassignments : [];
    return (
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ContextBlock label="AI qualification summary">
            <p className="leading-relaxed">
              {c.ai_qualification_summary || "No qualification summary on file."}
            </p>
            {score != null && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 px-2.5 py-0.5 text-[11px] font-medium text-gold-300">
                Qualification score · {score}/100
              </span>
            )}
          </ContextBlock>
        </div>

        <ContextBlock label="Key objections">
          {Array.isArray(c.key_objections) && c.key_objections.length > 0 ? (
            <ul className="list-inside list-disc space-y-1">
              {c.key_objections.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">None recorded.</p>
          )}
        </ContextBlock>

        <ContextBlock label="Conversation notes">
          <p className="leading-relaxed">
            {c.conversation_summary || "No transcript summary recorded."}
          </p>
          {c.sentiment_score != null && (
            <p className="mt-1 text-slate-500">Sentiment: {c.sentiment_score}</p>
          )}
        </ContextBlock>

        {reassignments.length > 0 && (
          <div className="sm:col-span-2">
            <ContextBlock label="Reassignment history">
              <ul className="space-y-1">
                {reassignments.map((r, i) => (
                  <li key={i} className="text-slate-400">
                    {r.from_rep_name} → {r.to_rep_name}
                    {r.reason ? ` (${r.reason})` : ""} · {new Date(r.at).toLocaleString()}
                  </li>
                ))}
              </ul>
            </ContextBlock>
          </div>
        )}

        <div className="sm:col-span-2">
          <ContextBlock label="Quote reference">
            {q ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>{q.carrier_name || "Carrier"} · {q.policy_type || "policy"}</span>
                <span>Coverage: {money(q.coverage_amount)}</span>
                <span>Monthly: {money(q.monthly_premium)}</span>
                <span className="capitalize">Status: {q.status || "—"}</span>
              </div>
            ) : (
              <p className="text-slate-500">No quote on file.</p>
            )}
          </ContextBlock>
        </div>
      </div>
    );
  }

  function PriorityBadge({ priority }: { priority?: HandoffPriority }) {
    const meta = PRIORITY_META[priority || "normal"] || PRIORITY_META.normal;
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${meta.badge}`}
          title={`${meta.label} priority — ${meta.hint}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        <span className="text-[10px] leading-tight text-slate-500">{meta.hint}</span>
      </div>
    );
  }

  function renderHandoffCard(h: Handoff) {
    const claimed = h.status === "claimed";
    return (
      <li
        key={h.id}
        className="rounded-xl border border-navy-700/50 bg-navy-800/40 p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-slate-100">
                {h.first_name} {h.last_name}
              </h2>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                  claimed
                    ? "border-gold-500/40 bg-gold-500/10 text-gold-300"
                    : "border-sky-500/40 bg-sky-500/10 text-sky-300"
                }`}
              >
                {claimed ? "Claimed" : "Queued"}
              </span>
              <PriorityBadge priority={h.priority} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {h.state ? `${h.state} · ` : ""}
              {h.email || "no email"} · Rep: {h.rep_name}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {!claimed ? (
              <button
                disabled={busyId === h.id}
                onClick={() => doAction("claim", h)}
                className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-60"
              >
                {busyId === h.id ? "Claiming..." : "Claim"}
              </button>
            ) : (
              <>
                <button
                  disabled={busyId === h.id}
                  onClick={() => doAction("complete", h, false)}
                  className="rounded-lg bg-navy-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-navy-500 disabled:opacity-60"
                >
                  {busyId === h.id ? "Working..." : "Complete"}
                </button>
                <button
                  disabled={busyId === h.id}
                  onClick={() => doAction("complete", h, true)}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-60"
                >
                  Close Won
                </button>
              </>
            )}
            {/* Owner: reassign this warm handoff to another rep */}
            <button
              disabled={busyId === h.id}
              onClick={() => {
                setReassignFor(h);
                setReassignRepId("");
                setReassignReason("");
              }}
              className="rounded-lg border border-navy-500 bg-navy-700/40 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-navy-600 disabled:opacity-60"
            >
              Reassign
            </button>
            {/* Rep: decline (optional reason) */}
            <button
              disabled={busyId === h.id}
              onClick={() => {
                setDeclineFor(h);
                setDeclineReason("");
              }}
              className="rounded-lg border border-red-500/30 bg-navy-800 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
            >
              Decline
            </button>
          </div>
        </div>
        {renderContext(h)}
      </li>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Rep Handoff Inbox</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Qualified leads handed to your reps with their full context, ready to be
              worked in the CRM. A handoff transfers the lead and its context — it is
              not a live phone call transfer. Priority is a working target, not a
              guaranteed response time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500" htmlFor="rep-filter">
              Rep:
            </label>
            <select
              id="rep-filter"
              value={repFilter}
              onChange={(e) => setRepFilter(e.target.value)}
              className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-gold-500/60"
            >
              <option value="all">All reps</option>
              {repOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View toggle: Active handoffs vs Declined (nothing lost) */}
        <div className="flex items-center gap-1 rounded-lg border border-navy-700/60 bg-navy-900 p-1 w-fit">
          <button
            onClick={() => setView("active")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              view === "active"
                ? "bg-gold-500 text-navy-900"
                : "text-slate-300 hover:text-slate-100"
            }`}
          >
            Active ({handoffs.length})
          </button>
          <button
            onClick={() => setView("declined")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              view === "declined"
                ? "bg-gold-500 text-navy-900"
                : "text-slate-300 hover:text-slate-100"
            }`}
          >
            Declined ({declined.length})
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
            <Spinner /> <span className="text-sm">Loading inbox...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={fetchInbox}
              className="mt-3 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900"
            >
              Try again
            </button>
          </div>
        ) : view === "active" ? (
          handoffs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-navy-600 bg-navy-800/30 px-6 py-16 text-center">
              <div className="text-3xl">📥</div>
              <p className="mt-3 text-sm font-semibold text-slate-300">No open handoffs</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                When the owner assigns an AI-qualified lead to a rep, it will show up here
                as a queued handoff ready to claim.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">{handoffs.map(renderHandoffCard)}</ul>
          )
        ) : declined.length === 0 ? (
          <div className="rounded-xl border border-dashed border-navy-600 bg-navy-800/30 px-6 py-16 text-center">
            <div className="text-3xl">🗂️</div>
            <p className="mt-3 text-sm font-semibold text-slate-300">No declined handoffs</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Declined handoffs are kept here so they aren&apos;t lost. When a rep
              declines, the lead returns to the pipeline and you can manually re-hand
              it off to another rep.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {declined.map((h) => (
              <li
                key={h.id}
                className="rounded-xl border border-red-500/20 bg-navy-800/40 p-5 opacity-95"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-slate-100">
                        {h.first_name} {h.last_name}
                      </h2>
                      <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-300">
                        Declined
                      </span>
                      <PriorityBadge priority={h.priority} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {h.state ? `${h.state} · ` : ""}
                      {h.email || "no email"} · Previously: {h.rep_name}
                      {h.declined_at
                        ? ` · Declined ${new Date(h.declined_at).toLocaleString()}`
                        : ""}
                    </p>
                    {h.decline_reason && (
                      <p className="mt-1.5 text-xs italic text-slate-400">
                        Reason: {h.decline_reason}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-500">
                      The lead is back in the pipeline as Qualified. Re-hand it off manually
                      to another rep below.
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      disabled={busyId === h.id}
                      onClick={() => {
                        setRehandoffFor(h);
                        setRehandoffRepId("");
                      }}
                      className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-60"
                    >
                      Re-hand off
                    </button>
                  </div>
                </div>
                {rehandoffFor?.id === h.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-navy-600 bg-navy-900/70 p-3">
                    <div className="min-w-0 flex-1">
                      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Assign this lead to
                      </label>
                      <select
                        value={rehandoffRepId}
                        onChange={(e) => setRehandoffRepId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-gold-500/60"
                      >
                        <option value="">Choose a rep…</option>
                        {pickers(h.rep_id).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      disabled={busyId === h.id}
                      onClick={() => doRehandoff(h)}
                      className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-60"
                    >
                      {busyId === h.id ? "Re-handing off..." : "Re-hand off"}
                    </button>
                    <button
                      onClick={() => setRehandoffFor(null)}
                      className="rounded-lg border border-navy-600 px-4 py-2 text-sm text-slate-300 hover:bg-navy-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {renderContext(h)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reassign picker modal (owner-facing) */}
      {reassignFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-navy-600 bg-navy-900 p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-100">
              Reassign {reassignFor.first_name} {reassignFor.last_name}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Move this warm handoff to another rep. The handoff resets to queued and the
              new rep will claim it. This is a context transfer in the CRM — it does not
              ring anyone&apos;s phone.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Assign to
                </label>
                <select
                  value={reassignRepId}
                  onChange={(e) => setReassignRepId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-gold-500/60"
                >
                  <option value="">Choose a rep…</option>
                  {pickers(reassignFor.rep_id).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Reason <span className="normal-case text-slate-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. rep is out today"
                  className="mt-1 w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-gold-500/60"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setReassignFor(null)}
                  className="rounded-lg border border-navy-600 px-4 py-2 text-sm text-slate-300 hover:bg-navy-700"
                >
                  Cancel
                </button>
                <button
                  disabled={busyId === reassignFor.id}
                  onClick={() => doReassign(reassignFor)}
                  className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-60"
                >
                  {busyId === reassignFor.id ? "Reassigning..." : "Reassign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decline confirm modal (optional reason) */}
      {declineFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-navy-600 bg-navy-900 p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-100">
              Decline handoff for {declineFor.first_name} {declineFor.last_name}?
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              The lead returns to the pipeline as Qualified. The owner will manually
              re-hand it off to another rep — it is not auto-routed. You can note why so
              the owner knows.
            </p>
            <div className="mt-4">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Reason <span className="normal-case text-slate-600">(optional)</span>
              </label>
              <input
                type="text"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                maxLength={500}
                placeholder="e.g. not a fit for my book"
                className="mt-1 w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-gold-500/60"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeclineFor(null)}
                className="rounded-lg border border-navy-600 px-4 py-2 text-sm text-slate-300 hover:bg-navy-700"
              >
                Cancel
              </button>
              <button
                disabled={busyId === declineFor.id}
                onClick={() => doDecline(declineFor)}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-red-400 disabled:opacity-60"
              >
                {busyId === declineFor.id ? "Declining..." : "Decline handoff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
