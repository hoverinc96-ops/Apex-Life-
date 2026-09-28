"use client";

import { useEffect, useState } from "react";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  state: "",
};

/**
 * "Add lead" modal — posts to the existing POST /api/leads endpoint
 * (first_name, last_name, email, phone, state). No new backend.
 */
export default function AddLeadModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Could not save the lead");
      }
      setDone(true);
      onAdded();
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the lead");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={() => !saving && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a lead"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <p className="py-6 text-center text-sm font-medium text-emerald-700">
            Lead saved — it&apos;s in the pipeline as New.
          </p>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Add a lead</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Saved to your pipeline with status New.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">First name</span>
                  <input required value={form.first_name} onChange={set("first_name")} className={field} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Last name</span>
                  <input required value={form.last_name} onChange={set("last_name")} className={field} />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Email</span>
                <input required type="email" value={form.email} onChange={set("email")} className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Phone</span>
                <input required type="tel" value={form.phone} onChange={set("phone")} className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">State</span>
                <input
                  required
                  value={form.state}
                  onChange={set("state")}
                  placeholder="NJ, TX, FL, MA"
                  className={field}
                />
              </label>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save lead"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
