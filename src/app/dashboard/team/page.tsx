"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TeamMember,
  TeamRole,
  ROLE_CAPABILITIES,
} from "@/lib/team-types";

function Spinner() {
  return (
    <span
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-gold-400"
      aria-label="Loading"
    />
  );
}

const ROLE_BADGE: Record<TeamRole, { label: string; className: string }> = {
  owner: { label: "Owner", className: "border-gold-500/40 bg-gold-500/10 text-gold-400" },
  rep: { label: "Rep", className: "border-slate-500/40 bg-slate-500/10 text-slate-300" },
};

const ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: "rep", label: "Rep" },
  { value: "owner", label: "Owner" },
];

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-member form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("rep");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/team", { cache: "no-store" });
      if (!res.ok) throw new Error("Unable to load team members");
      setMembers(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load team members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Unable to add member");
        return;
      }
      setFormSuccess(`${data.name} added as ${ROLE_BADGE[data.role as TeamRole].label}.`);
      setName("");
      setEmail("");
      setRole("rep");
      await fetchMembers();
    } catch {
      setFormError("Unable to add member");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-100">Team &amp; Roles</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage who can access the CRM. Team members are roles in the dashboard —
            handoffs hand the AI-qualified lead and its context to the assigned rep.
          </p>
        </div>

        {/* Member list */}
        <section className="rounded-xl border border-navy-700/50 bg-navy-800/40">
          <div className="border-b border-navy-700/50 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-200">Team members</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Backed by the live /api/team endpoint.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 px-5 py-10 text-slate-400">
              <Spinner /> <span className="text-sm">Loading team...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={fetchMembers}
                className="mt-3 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900"
              >
                Try again
              </button>
            </div>
          ) : members.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              No team members yet. Add one below.
            </div>
          ) : (
            <ul className="divide-y divide-navy-700/50">
              {members.map((m) => {
                const badge = ROLE_BADGE[m.role] || ROLE_BADGE.rep;
                const initial = (m.name || "?").trim().charAt(0).toUpperCase();
                return (
                  <li key={m.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-700 text-sm font-semibold text-gold-300">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-200">{m.name}</p>
                      <p className="truncate text-xs text-slate-500">{m.email}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Add member */}
          <section className="rounded-xl border border-navy-700/50 bg-navy-800/40 p-5">
            <h2 className="text-sm font-semibold text-slate-200">Add a team member</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Reserved for the owner — adds a member via /api/team.
            </p>
            <form onSubmit={handleAddMember} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="tm-name">
                  Full name
                </label>
                <input
                  id="tm-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jamie Rivera"
                  className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-gold-500/60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="tm-email">
                  Email
                </label>
                <input
                  id="tm-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rep@agency.com"
                  className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-gold-500/60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="tm-role">
                  Role
                </label>
                <select
                  id="tm-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as TeamRole)}
                  className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-gold-500/60"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {formError && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {formError}
                </p>
              )}
              {formSuccess && (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                  {formSuccess}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-60"
              >
                {submitting ? "Adding..." : "Add member"}
              </button>
            </form>
          </section>

          {/* Role capabilities */}
          <section className="rounded-xl border border-navy-700/50 bg-navy-800/40 p-5">
            <h2 className="text-sm font-semibold text-slate-200">What each role can do</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              UI-layer view. Access enforcement lives at the API/DB layer.
            </p>
            <div className="mt-4 space-y-4">
              {ROLE_CAPABILITIES.map((c) => (
                <div
                  key={c.role}
                  className="rounded-lg border border-navy-700/50 bg-navy-900/50 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        c.role === "owner"
                          ? "border-gold-500/40 bg-gold-500/10 text-gold-400"
                          : "border-slate-500/40 bg-slate-500/10 text-slate-300"
                      }`}
                    >
                      {c.label}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {c.points.map((p) => (
                      <li key={p} className="flex gap-2 text-xs text-slate-400">
                        <span className="text-gold-500">•</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
