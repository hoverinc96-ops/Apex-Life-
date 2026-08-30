"use client";

import { useState } from "react";

// ── Navbar ──────────────────────────────────────────────────────────────────
function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-navy-700/50 bg-navy-900/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <a href="#" className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <span className="text-gold-500">◆</span>
          <span>Apex Life AI</span>
        </a>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-slate-300 transition hover:text-white">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-slate-300 transition hover:text-white">
            How It Works
          </a>
          <a
            href="#cta"
            className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-navy-900 transition hover:bg-gold-400"
          >
            Start a Free 60-Day Pilot
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="flex flex-col gap-1.5 md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <span className={`block h-0.5 w-6 bg-white transition ${mobileOpen ? "translate-y-2 rotate-45" : ""}`} />
          <span className={`block h-0.5 w-6 bg-white transition ${mobileOpen ? "opacity-0" : ""}`} />
          <span className={`block h-0.5 w-6 bg-white transition ${mobileOpen ? "-translate-y-2 -rotate-45" : ""}`} />
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-navy-700/50 bg-navy-900/95 px-6 pb-6 pt-4 md:hidden">
          <div className="flex flex-col gap-4">
            <a
              href="#features"
              className="text-sm text-slate-300"
              onClick={() => setMobileOpen(false)}
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-slate-300"
              onClick={() => setMobileOpen(false)}
            >
              How It Works
            </a>
            <a
              href="#cta"
              className="rounded-lg bg-gold-500 px-5 py-2.5 text-center text-sm font-semibold text-navy-900"
              onClick={() => setMobileOpen(false)}
            >
              Start a Free 60-Day Pilot
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-20">
      {/* Background gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-gold-500/5 blur-[120px]" />
        <div className="absolute -bottom-20 right-1/4 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/5 px-4 py-1.5">
          <span className="h-2 w-2 rounded-full bg-gold-500 animate-pulse" />
          <span className="text-xs font-medium text-gold-400">Now onboarding agency partners for our free 60-day pilot</span>
        </div>

        <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          Your{" "}
          <span className="text-gradient">AI-Powered</span>
          <br />
          Life Insurance Sales Team
        </h1>

        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-slate-300 sm:text-xl">
          AI agents that <span className="font-semibold text-white">qualify your leads over voice</span>,
          answer coverage and pricing questions, flag objections — and only{" "}
          <span className="font-semibold text-white">hand off to your licensed agents</span>{" "}
          when a lead is ready to buy or asks for a human. 24 hours a day, 7 days a week.
          Currently onboarding a limited number of agency partners for a{" "}
          <span className="font-semibold text-white">free 60-day pilot</span>.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="#cta"
            className="rounded-xl bg-gold-500 px-8 py-4 text-base font-bold text-navy-900 shadow-lg shadow-gold-500/20 transition hover:bg-gold-400"
          >
            Start a Free 60-Day Pilot →
          </a>
          <a
            href="#how-it-works"
            className="rounded-xl border border-slate-600 px-8 py-4 text-base font-medium text-slate-200 transition hover:border-slate-400 hover:text-white"
          >
            See How It Works
          </a>
        </div>

        {/* Trust badges */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
          <span>Consent &amp; Do-Not-Call compliance built in</span>
          <span className="text-slate-700">·</span>
          <span>Free 60-day pilot</span>
          <span className="text-slate-700">·</span>
          <span>Results unproven</span>
        </div>
      </div>
    </section>
  );
}

// ── Features ────────────────────────────────────────────────────────────────
const features = [
  {
    emoji: "🔍",
    title: "Lead Capture",
    description:
      "Leads come from consented, self-identified sources — people who actively request a quote or agree to be contacted. We capture and record consent for every channel we reach them on, before any outreach.",
  },
  {
    emoji: "🎙️",
    title: "AI Voice Negotiation",
    description:
      "Our voice agents conduct natural discovery conversations, present policies, handle objections, and negotiate terms — with full disclosure that they're AI.",
  },
  {
    emoji: "📊",
    title: "Real-Time CRM Dashboard",
    description:
      "Monitor every lead across a Kanban pipeline. Watch live transcripts, review qualification scores, and take over any conversation with one click.",
  },
  {
    emoji: "📄",
    title: "Proposals at your fingertips",
    description:
      "Carrier quotes and premiums surface on each lead so your team sees the exact offer and status — no digging through spreadsheets.",
  },
  {
    emoji: "🤝",
    title: "Warm Handoff to Humans",
    description:
      "When a lead needs a human touch, agents deliver a 30-second briefing summary and warm-transfer the call — your team picks up already informed.",
  },
];

function Features() {
  return (
    <section id="features" className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gold-500">
            Platform
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything your sales team does,
            <br />
            <span className="text-gradient">automated by AI</span>
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-navy-700/50 bg-navy-800/50 p-8 transition hover:border-gold-500/30 hover:bg-navy-800"
            >
              <div className="mb-4 text-3xl">{f.emoji}</div>
              <h3 className="mb-3 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How It Works ────────────────────────────────────────────────────────────
const steps = [
  {
    step: "01",
    title: "Lead Capture",
    description:
      "Our pipeline ingests consented, self-identified leads from owned quote forms, referrals, and agency imports — each person's consent is captured and recorded before any outreach.",
  },
  {
    step: "02",
    title: "AI Qualification",
    description:
      "Agents evaluate underwriting criteria, assign intent scores (0-100), and prioritize high-intent leads for immediate engagement.",
  },
  {
    step: "03",
    title: "Voice & SMS Engagement",
    description:
      "Qualified leads receive an AI-powered call or text within 60 seconds. Natural conversation flow with disclosure, discovery, and objection handling.",
  },
  {
    step: "04",
    title: "Close or Handoff",
    description:
      "Complex or human-requested cases get a warm transfer with a briefing summary for your licensed agents. The AI steps out; your team steps in.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gold-500">
            Pipeline
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            From lead to close in{" "}
            <span className="text-gradient">4 steps</span>
          </h2>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.step} className="relative">
              <div className="mb-4 flex items-center gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-500 text-sm font-bold text-navy-900">
                  {s.step}
                </span>
                {/* Connector line (hidden on last item) */}
                {i < steps.length - 1 && (
                  <div className="hidden h-px flex-1 bg-navy-700 lg:block" />
                )}
              </div>
              <h3 className="mb-2 text-lg font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{s.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pilot band ──────────────────────────────────────────────────────────────
const pilotPoints = [
  {
    emoji: "👁️",
    title: "Watch every conversation live.",
    description:
      "Your dashboard, your real leads, in a real database. Transcript, sentiment, and flagged objections in real time — and you can take over any call with one click.",
  },
  {
    emoji: "🤝",
    title: "Warm human handoff.",
    description:
      "When a lead wants a person, your licensed agent picks up already informed — briefing summary in hand. The AI steps out; you step in.",
  },
  {
    emoji: "🛡️",
    title: "Compliance first.",
    description:
      "Consent and opt-out (Do-Not-Call) events are logged, PII is scrubbed from transcripts, and opted-out contacts are suppressed across channels. Request-access and opt-out paths are live and logged today.",
  },
];

function Pilot() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="rounded-3xl border border-navy-700/50 bg-navy-800/50 px-8 py-16">
          <div className="mb-12 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-gold-500">
              Pilot
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Run the pilot.{" "}
              <span className="text-gradient">See it yourself.</span>
            </h2>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {pilotPoints.map((p) => (
              <div key={p.title} className="text-left">
                <div className="mb-3 text-3xl">{p.emoji}</div>
                <h3 className="mb-2 text-lg font-semibold">{p.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{p.description}</p>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-12 max-w-2xl text-center text-sm italic leading-relaxed text-slate-400">
            Apex Life AI is a new platform — results are unproven. That&apos;s exactly why the
            pilot is free: judge it on what you actually see in your dashboard.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── CTA ─────────────────────────────────────────────────────────────────────
function CTA() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", state: "" });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/request-access", {
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
    <section id="cta" className="py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to run your lead stream through it?
        </h2>
        <p className="mb-10 text-lg text-slate-400">
          We&apos;re onboarding a limited number of independent agencies for a free 60-day pilot.
          No cost, no commitment, weekly 15-minute check-ins — and you opt out after 30 days if it
          isn&apos;t delivering. Send your details and we&apos;ll set up your dashboard.
        </p>

        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-navy-700/50 bg-navy-800/40 p-6"
          >
            <input
              type="text"
              value={form.name}
              onChange={update("name")}
              placeholder="Full name"
              required
              className="w-full rounded-xl border border-navy-600 bg-navy-900 px-5 py-3.5 text-white placeholder-slate-500 outline-none transition focus:border-gold-500"
            />
            <input
              type="email"
              value={form.email}
              onChange={update("email")}
              placeholder="you@agency.com"
              required
              className="w-full rounded-xl border border-navy-600 bg-navy-900 px-5 py-3.5 text-white placeholder-slate-500 outline-none transition focus:border-gold-500"
            />
            <input
              type="tel"
              value={form.phone}
              onChange={update("phone")}
              placeholder="Phone (optional)"
              className="w-full rounded-xl border border-navy-600 bg-navy-900 px-5 py-3.5 text-white placeholder-slate-500 outline-none transition focus:border-gold-500"
            />
            <input
              type="text"
              value={form.state}
              onChange={update("state")}
              placeholder="State (e.g. TX)"
              maxLength={2}
              required
              className="w-full rounded-xl border border-navy-600 bg-navy-900 px-5 py-3.5 text-white placeholder-slate-500 outline-none transition focus:border-gold-500"
            />
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
              {submitting ? "Submitting…" : "Start My Free Pilot"}
            </button>
          </form>
        ) : (
          <div className="rounded-2xl border border-gold-500/30 bg-gold-500/5 px-8 py-6">
            <p className="text-lg font-semibold text-gold-400">
              🎉 Thanks — we&apos;ll be in touch.
            </p>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-600">
          This is a real request form — your submission is saved directly to our CRM pipeline.
          No spam, ever. We&apos;ll only write about setting up your pilot.
        </p>
      </div>
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-navy-700/50 py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2 text-lg font-bold">
            <span className="text-gold-500">◆</span>
            <span>Apex Life AI</span>
          </div>

          <div className="flex gap-8 text-sm text-slate-500">
            <a href="#features" className="transition hover:text-slate-300">
              Features
            </a>
            <a href="#how-it-works" className="transition hover:text-slate-300">
              How It Works
            </a>
            <a href="#cta" className="transition hover:text-slate-300">
              Free Pilot
            </a>
          </div>

          <p className="text-xs text-slate-600">
            &copy; {new Date().getFullYear()} Apex Life AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Pilot />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
