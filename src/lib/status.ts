import type { LeadStatus } from "./mock-data";

/** Status metadata with light-theme badge styling (agent workspace). */
export const CLIENT_STATUS_META: Record<
  LeadStatus,
  { label: string; badge: string }
> = {
  new: { label: "New", badge: "bg-slate-50 text-slate-700 border-slate-200" },
  qualified: { label: "Qualified", badge: "bg-sky-50 text-sky-700 border-sky-200" },
  proposal_sent: { label: "Proposal Sent", badge: "bg-amber-50 text-amber-800 border-amber-200" },
  in_negotiation: { label: "In Negotiation", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  pending_live_handoff: { label: "Pending Handoff", badge: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  closed_won: { label: "Closed Won", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export const CLIENT_STATUS_ORDER: LeadStatus[] = [
  "new",
  "qualified",
  "proposal_sent",
  "in_negotiation",
  "pending_live_handoff",
  "closed_won",
];

/** Human label for a lead's raw source value ("consumer_inquiry" → "Consumer inquiry"). */
export function sourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatAddedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
