"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ShareLinkModal from "@/components/ShareLinkModal";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: "🏠" },
  { href: "/dashboard/clients", label: "Clients", icon: "🗂️" },
  { href: "/dashboard/owner", label: "Owner Pipeline", icon: "👑" },
  { href: "/dashboard/owner/calendar", label: "Calendar Sync", icon: "📅" },
  { href: "/dashboard/conversations", label: "Conversations", icon: "💬" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📊" },
  { href: "/dashboard/inbox", label: "Rep Handoff Inbox", icon: "📥" },
  { href: "/dashboard/team", label: "Team & Roles", icon: "👥" },
  { href: "/dashboard/compliance", label: "Compliance", icon: "🛡️" },
  { href: "/dashboard/live-monitor", label: "Live Monitor", icon: "🔴" },
  { href: "/dashboard/voice-test", label: "Voice Test", icon: "🎙️" },
];

function pageTitle(pathname: string): string {
  // Longest matching nav href wins (e.g. /dashboard/owner/calendar before /dashboard/owner).
  const match = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  return match?.label ?? "Workspace";
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [shareOpen, setShareOpen] = useState(false);

  // The Overview page's quick action opens this same modal.
  useEffect(() => {
    const open = () => setShareOpen(true);
    window.addEventListener("apex:open-share-link", open);
    return () => window.removeEventListener("apex:open-share-link", open);
  }, []);

  return (
    <div className="dash-light flex h-screen overflow-hidden bg-white text-slate-900">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        {/* Logo */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <span className="text-lg text-gold-500">◆</span>
          <span className="text-sm font-bold tracking-tight text-slate-900">Apex Life</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive
                    ? "bg-gold-500/10 font-medium text-gold-400"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom user */}
        <div className="border-t border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-500/20 text-sm font-semibold text-gold-400">
              AS
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">Agency Admin</p>
              <p className="truncate text-xs text-slate-500">admin@agency.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <h1 className="text-sm font-semibold text-slate-900">{pageTitle(pathname)}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="rounded-lg bg-gold-500 px-3.5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-gold-400"
            >
              Share quote link
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              System Active
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0a1628] text-sm font-semibold text-white">
              AS
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">{children}</div>
      </div>

      {shareOpen && <ShareLinkModal onClose={() => setShareOpen(false)} />}
    </div>
  );
}
