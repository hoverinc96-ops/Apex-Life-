"use client";

import { Lead, formatCurrency, getDaysSince, getScoreColor } from "@/lib/mock-data";

interface LeadCardProps {
  lead: Lead;
  onClick: (lead: Lead) => void;
}

export default function LeadCard({ lead, onClick }: LeadCardProps) {
  const days = getDaysSince(lead.created_at);
  const scoreColor = getScoreColor(lead.qualification_score);

  return (
    <button
      onClick={() => onClick(lead)}
      className="w-full text-left rounded-xl border border-navy-600/50 bg-navy-800/80 p-4 transition hover:border-gold-500/40 hover:bg-navy-800 hover:shadow-lg hover:shadow-gold-500/5"
    >
      {/* Name */}
      <p className="mb-2 text-sm font-semibold text-white">
        {lead.first_name} {lead.last_name}
      </p>

      {/* Score + Coverage row */}
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${scoreColor}`}>
          {lead.qualification_score !== null ? lead.qualification_score : "—"}
        </span>
        <span className="text-xs text-slate-400">
          {formatCurrency(lead.coverage_amount_requested)}
        </span>
      </div>

      {/* State + Days row */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="rounded border border-navy-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
          {lead.state}
        </span>
        <span>
          {days === 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`}
        </span>
      </div>
    </button>
  );
}
