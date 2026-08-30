"use client";

import { Lead, LeadStatus } from "@/lib/mock-data";
import LeadCard from "./LeadCard";

interface KanbanColumnProps {
  status: LeadStatus;
  label: string;
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
}

export default function KanbanColumn({ status, label, leads, onLeadClick }: KanbanColumnProps) {
  return (
    <div className="flex min-w-[260px] max-w-[320px] flex-1 flex-col rounded-2xl border border-navy-700/40 bg-navy-800/30">
      {/* Column header */}
      <div className="flex items-center justify-between border-b border-navy-700/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-200">{label}</h3>
        <span className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-navy-700 px-2 text-xs font-medium text-slate-400">
          {leads.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onClick={onLeadClick} />
        ))}
        {leads.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-600">No leads</p>
        )}
      </div>
    </div>
  );
}
