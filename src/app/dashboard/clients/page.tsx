"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import KanbanBoard from "@/components/KanbanBoard";
import LeadDetailPanel from "@/components/LeadDetailPanel";
import { Lead, LeadStatus } from "@/lib/mock-data";
import { CLIENT_STATUS_META, CLIENT_STATUS_ORDER, formatAddedDate, sourceLabel } from "@/lib/status";

type ViewMode = "table" | "pipeline";

export default function ClientsPage() {
  const [view, setView] = useState<ViewMode>("table");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/leads", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load clients");
      setLeads(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    const response = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!response.ok) throw new Error("Unable to update lead status");
    await fetchLeads();
    setSelectedLead((prev) => (prev && prev.id === leadId ? { ...prev, status: newStatus } : prev));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        `${lead.first_name} ${lead.last_name}`,
        lead.first_name,
        lead.last_name,
        lead.email,
        lead.phone,
        lead.state,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [leads, query, statusFilter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Header + view toggle ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Clients</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Everyone in your pipeline, at every stage.
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => setView("pipeline")}
            aria-pressed={view === "pipeline"}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === "pipeline" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Pipeline
          </button>
        </div>
      </div>

      {view === "pipeline" ? (
        <KanbanBoard refreshKey={0} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-6">
            {/* Search + status filter chips */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-sm">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                    clipRule="evenodd"
                  />
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email, phone, state…"
                  aria-label="Search clients"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    statusFilter === "all"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                  }`}
                >
                  All ({leads.length})
                </button>
                {CLIENT_STATUS_ORDER.map((status) => {
                  const meta = CLIENT_STATUS_META[status];
                  const count = leads.filter((l) => l.status === status).length;
                  const active = statusFilter === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(active ? "all" : status)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                      }`}
                    >
                      {meta.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Table */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">Loading clients…</div>
              ) : error ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-red-600">{error}</p>
                  <button
                    type="button"
                    onClick={fetchLeads}
                    className="mt-3 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-slate-900"
                  >
                    Try again
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  {leads.length === 0
                    ? "No clients yet — add one from the Overview page or import a CSV."
                    : "No clients match this search or filter."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-5 py-3 font-medium">Name</th>
                        <th className="px-5 py-3 font-medium">Email</th>
                        <th className="px-5 py-3 font-medium">Phone</th>
                        <th className="px-5 py-3 font-medium">State</th>
                        <th className="px-5 py-3 font-medium">Source</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 text-right font-medium">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((lead) => {
                        const meta = CLIENT_STATUS_META[lead.status];
                        return (
                          <tr
                            key={lead.id}
                            onClick={() => setSelectedLead(lead)}
                            className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                          >
                            <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-900">
                              {lead.first_name} {lead.last_name}
                              {lead.do_not_contact && (
                                <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                                  Do not contact
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-slate-600">{lead.email}</td>
                            <td className="whitespace-nowrap px-5 py-3 text-slate-600">{lead.phone}</td>
                            <td className="px-5 py-3 text-slate-600">{lead.state}</td>
                            <td className="whitespace-nowrap px-5 py-3 text-slate-600">{sourceLabel(lead.source)}</td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${
                                  meta?.badge ?? "border-slate-200 bg-slate-50 text-slate-700"
                                }`}
                              >
                                {meta?.label ?? lead.status}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-5 py-3 text-right text-slate-600">
                              {formatAddedDate(lead.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Showing {filtered.length} of {leads.length} clients.
            </p>
          </div>
        </div>
      )}

      {selectedLead && view === "table" && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
