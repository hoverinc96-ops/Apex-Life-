"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Lead, LeadStatus, PIPELINE_COLUMNS } from "@/lib/mock-data";
import KanbanColumn from "@/components/KanbanColumn";
import LeadDetailPanel from "@/components/LeadDetailPanel";

export default function KanbanBoard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/leads", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load leads");
      setLeads(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads, refreshKey]);

  // Deep-link support: open a specific lead's detail panel via ?select=<leadId>
  // (used by the Conversations page's "open lead" links).
  useEffect(() => {
    if (loading || selectedLead) return;
    const params = new URLSearchParams(window.location.search);
    const selectId = params.get("select");
    if (!selectId) return;
    const match = leads.find((l) => l.id === selectId);
    if (match) setSelectedLead(match);
  }, [leads, loading, selectedLead]);

  const leadsByStatus = useMemo(() => {
    const map: Record<LeadStatus, Lead[]> = {} as Record<LeadStatus, Lead[]>;
    for (const col of PIPELINE_COLUMNS) map[col.status] = leads.filter((l) => l.status === col.status);
    return map;
  }, [leads]);

  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    const response = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!response.ok) throw new Error("Unable to update lead status");
    await fetchLeads();
  };

  if (loading) return <div className="flex flex-1 items-center justify-center text-slate-400"><Spinner /> <span className="ml-3">Loading leads...</span></div>;
  if (error) return <div className="flex flex-1 flex-col items-center justify-center text-red-400"><p>{error}</p><button onClick={fetchLeads} className="mt-3 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900">Try again</button></div>;

  return <>
    <div className="flex-1 overflow-x-auto"><div className="flex h-full min-w-max gap-4 p-6">
      {PIPELINE_COLUMNS.map((col) => <KanbanColumn key={col.status} status={col.status} label={col.label} leads={leadsByStatus[col.status]} onLeadClick={setSelectedLead} />)}
    </div></div>
    {selectedLead && <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} onStatusChange={handleStatusChange} />}
  </>;
}

function Spinner() { return <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-gold-400" aria-label="Loading" />; }
