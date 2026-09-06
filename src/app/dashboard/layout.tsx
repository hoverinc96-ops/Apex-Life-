"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Leads", icon: "📋" },
  { href: "/dashboard/owner", label: "Owner Pipeline", icon: "👑" },
  { href: "/dashboard/owner/calendar", label: "Calendar Sync", icon: "📅" },
  { href: "/dashboard/conversations", label: "Conversations", icon: "💬" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📊" },
  { href: "/dashboard/inbox", label: "Rep Handoff Inbox", icon: "📥" },
  { href: "/dashboard/team", label: "Team & Roles", icon: "👥" },
  { href: "/dashboard/live-monitor", label: "Live Monitor", icon: "🔴" },
  { href: "/dashboard/voice-test", label: "Voice Test", icon: "🎙️" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-navy-900">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-navy-700/50 bg-navy-800/50">
        {/* Logo */}
        <div className="flex items-center gap-2 border-b border-navy-700/50 px-5 py-4">
          <span className="text-gold-500 text-lg">◆</span>
          <span className="text-sm font-bold tracking-tight">Apex Life AI</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive
                    ? "bg-gold-500/10 text-gold-400 font-medium"
                    : "text-slate-400 hover:bg-navy-700/50 hover:text-slate-200"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom user */}
        <div className="border-t border-navy-700/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-500/20 text-sm font-semibold text-gold-400">
              AS
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-slate-200">Agency Admin</p>
              <p className="truncate text-xs text-slate-500">admin@agency.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-navy-700/50 bg-navy-800/30 px-6 py-3">
          <div>
            <h1 className="text-sm font-semibold text-slate-200">CRM Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              System Active
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-700 text-sm font-semibold text-slate-300">
              AS
            </div>
          </div>
        </header>

        {/* Page content */}
        {children}
      </div>
    </div>
  );
}
