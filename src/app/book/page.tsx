"use client";

import { useState } from "react";

const TOPICS = [
  { value: "general", label: "General question" },
  { value: "life_insurance_quote", label: "Life insurance quote" },
  { value: "policy_question", label: "Question about a policy" },
  { value: "existing_client", label: "I'm an existing client" },
];

const TIME_SLOTS = [
  "Weekday morning (9am–noon)",
  "Weekday afternoon (noon–4pm)",
  "Weekday evening (4–7pm)",
  "Saturday morning (9am–noon)",
];

/**
 * Public booking request page — the OWNER's private intake (Mode-1 owner
 * seat). This is a "request a call" flow, NOT a calendar: submissions land in
 * the bookings table as status='requested' and the owner confirms by email.
 * Copy is deliberately honest — no auto-confirmed slot, no claim of live
 * outbound calling/texting/email (those are dormant; email sending is not
 * live on this plan). Consent for contact is captured explicitly.
 */
export default function BookPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    topic: "general",
    requested_time: "",
    consent: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update =
    (field: string) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
      const value =
        e.target.type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : e.target.value;
      setForm((f) => ({ ...f, [field]: value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data?.error ?? "Something went wrong. Please try again.");
        setSubmitted(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-navy-900 px-6 py-16 text-white">
      <div className="mx-auto max-w-xl">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-gold-400"
        >
          ← Back to Apex Life AI
        </a>

        <div className="mb-2 flex items-center gap-2 text-lg font-bold">
          <span className="text-gold-500">◆</span>
          <span>Apex Life AI</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Request a call
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Tell us what you&apos;d like to talk about and a time that works for
          you. This is a <span className="font-semibold text-slate-200">request, not a
          confirmed appointment</span> — we&apos;ll confirm your preferred time by
          email before any call happens.
        </p>

        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="mt-8 flex flex-col gap-4 rounded-2xl border border-navy-700/50 bg-navy-800/40 p-6"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Full name *
              </label>
              <input
                id="name"
                type="text"
                value={form.name}
                onChange={update("name")}
                placeholder="Jane Smith"
                required
                className="w-full rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-gold-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Email *
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={update("email")}
                placeholder="you@example.com"
                required
                className="w-full rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-gold-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Phone <span className="normal-case text-slate-600">(optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={update("phone")}
                placeholder="(555) 123-4567"
                className="w-full rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-gold-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="topic" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                What can we help with?
              </label>
              <select
                id="topic"
                value={form.topic}
                onChange={update("topic")}
                className="w-full rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-white outline-none transition focus:border-gold-500"
              >
                {TOPICS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="requested_time" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Preferred time
              </label>
              <select
                id="requested_time"
                value={form.requested_time}
                onChange={update("requested_time")}
                className="w-full rounded-xl border border-navy-600 bg-navy-900 px-4 py-3 text-white outline-none transition focus:border-gold-500"
              >
                <option value="">Any time — you pick</option>
                {TIME_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-navy-600 bg-navy-900/60 px-4 py-3 text-xs leading-relaxed text-slate-400">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={update("consent")}
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#d4a843]"
              />
              <span>
                I agree to be contacted by Apex Life AI by email and/or phone
                about this request. I understand this is a request for a call,
                not a confirmed appointment. No spam — ever.
              </span>
            </label>

            {error && (
              <p className="rounded-lg bg-red-500/10 px-4 py-2 text-left text-sm text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gold-500 px-6 py-4 font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Request a call"}
            </button>

            <p className="text-center text-xs text-slate-600">
              We&apos;ll confirm by email before scheduling — nothing is booked
              automatically. If you later want us to stop contacting you, just
              say so and we&apos;ll honor it immediately.
            </p>
          </form>
        ) : (
          <div className="mt-8 rounded-2xl border border-gold-500/30 bg-gold-500/5 px-8 py-6">
            <p className="text-lg font-semibold text-gold-400">
              🎉 Thanks, {form.name.split(" ")[0] || "there"} — request received.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              We&apos;ll confirm your preferred time by email before any call
              happens. Nothing is booked yet.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}