"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Consumer inquiry wizard — "/get-quote".
 *
 * Ethos-style one-question-per-screen flow (11 screens: intro + 9 numbered
 * steps + review + success), built from the design specs in
 * /home/team/shared/consumer-inquiry-page/ and the compliance verdict 06
 * (Variant A — explicit consent, fail-closed). This is an INQUIRY, not an
 * application: no quote is generated here, and no SSN / DOB / income /
 * medical records / payment are ever collected. Submissions POST to
 * /api/consumer-inquiry (owner private pipeline, source=consumer_inquiry).
 *
 * Compliance wiring (verdict 06, binding):
 *  - Consent checkbox uses the verbatim v1 text (frozen string below); the
 *    submit button stays disabled until it is checked; the payload sends
 *    consent_contact: true ONLY when checked.
 *  - Q9 state select offers ONLY the owner's licensed states (NJ, TX, FL,
 *    MA) + "Prefer not to say" — no other states.
 *  - Q5 helper uses the verdict's required edit ("A medical exam isn't
 *    always required." + "we only share your details with the licensed
 *    agent who helps you, and we never sell them.").
 *  - No "Takes about two minutes" claim anywhere.
 *  - Trust strip: No obligation · No spam · Opt out anytime · Your details
 *    are never sold. No manufactured urgency, no scarcity, no income
 *    questions.
 *  - 503 (consent capture disabled) renders an honest setup error state,
 *    no retry-loop spam.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STORAGE_KEY = "apex-consumer-inquiry-v1";

/** Verbatim v1 consent text — compliance verdict 06 §1.3 (frozen). */
const CONSENT_TEXT =
  "I agree Apex Life AI may contact me by email, phone, or SMS about life insurance options based on this inquiry. I understand this is not an application: it doesn't create a policy, isn't a promise of coverage, and doesn't guarantee any rate. I can change my mind and ask you to stop anytime.";

/** Owner-licensed states only (owner ratification 2026-09-13). */
const LICENSED_STATES = [
  { code: "NJ", label: "New Jersey" },
  { code: "TX", label: "Texas" },
  { code: "FL", label: "Florida" },
  { code: "MA", label: "Massachusetts" },
] as const;

// ── Steps ───────────────────────────────────────────────────────────────────
const INTRO = 0;
const REVIEW = 10;
const SUCCESS = 11;

const STEP_QUESTIONS = [
  "How old are you?",
  "How much coverage are you thinking about?",
  "How long do you want coverage to last?",
  "Do you currently use tobacco or nicotine?",
  "How would you describe your health right now?",
  "What monthly payment fits your budget?",
  "What's your name?",
  "Where should we send your options?",
  "How else can we reach you?",
  "One last check — is this right?",
];

const STEP_PHASE = (step: number): string => {
  if (step >= 1 && step <= 6) return "Quick questions";
  if (step >= 7 && step <= 9) return "Your details";
  return "Almost done — review";
};

const STEP_HELPERS: Record<number, string> = {
  1: "Rates depend partly on age — rough is fine. Pick the range that fits.",
  2: "Rough is fine. A common approach: enough to cover a mortgage plus a few years of income for your family.",
  3: "Term insurance covers you for a set number of years — it's often the most affordable way to protect your family. Whole life never expires.",
  4: "This affects pricing, so honest answers get you honest options. Vaping and nicotine gum count.",
  5: "A medical exam isn't always required. A licensed agent will go over the details with you — we only share your details with the licensed agent who helps you, and we never sell them.",
  6: "Real options depend on your age, health, and where you live — we'll show you what's actually possible.",
  7: "Just so we know what to call you.",
  8: "We reach out by email either way. No spam — ever. Opt out anytime.",
  9: "Almost done — just a couple more. Phone is optional; email works fine.",
};

// ── Answer options (values match Spec 02 §1 exactly) ────────────────────────
const AGE_OPTIONS = [
  { value: "20-29", label: "20–29" },
  { value: "30-39", label: "30–39" },
  { value: "40-49", label: "40–49" },
  { value: "50-59", label: "50–59" },
  { value: "60-69", label: "60–69" },
  { value: "70+", label: "70 or older" },
];

type CoverageOption =
  | { amount: number; pref?: never }
  | { amount?: never; pref: "over_1m" | "not_sure" };
const COVERAGE_OPTIONS: (CoverageOption & { label: string })[] = [
  { amount: 100000, label: "$100,000" },
  { amount: 250000, label: "$250,000" },
  { amount: 500000, label: "$500,000" },
  { amount: 1000000, label: "$1,000,000" },
  { pref: "over_1m", label: "More than $1M" },
  { pref: "not_sure", label: "Not sure yet" },
];

type TermOption =
  | { years: number; pref?: never }
  | { years?: never; pref: "whole_life" | "not_sure" };
const TERM_OPTIONS: (TermOption & { label: string })[] = [
  { years: 10, label: "10 years" },
  { years: 15, label: "15 years" },
  { years: 20, label: "20 years" },
  { years: 30, label: "30 years" },
  { pref: "whole_life", label: "Whole life (lifetime)" },
  { pref: "not_sure", label: "Not sure" },
];

const TOBACCO_OPTIONS = [
  { value: false, label: "No" },
  { value: true, label: "Yes — including vaping and nicotine gum" },
];

const HEALTH_OPTIONS = [
  { value: "great", label: "Great — no major conditions" },
  { value: "minor", label: "Good — I manage something minor" },
  { value: "condition", label: "I have a condition I'd like to talk about" },
  { value: "prefer_not", label: "Prefer not to say" },
];

const BUDGET_OPTIONS = [
  { value: "under_50", label: "Under $50" },
  { value: "50_100", label: "$50–$100" },
  { value: "100_200", label: "$100–$200" },
  { value: "over_200", label: "Over $200" },
  { value: "not_sure", label: "Not sure — show me what's possible" },
];

// ── State ────────────────────────────────────────────────────────────────────
type Answers = {
  age_range: string | null;
  coverage_amount_requested: number | null;
  coverage_preference: "over_1m" | "not_sure" | null;
  term_years: number | null;
  policy_preference: "whole_life" | "not_sure" | null;
  tobacco_use: boolean | null;
  health_status: string | null;
  monthly_budget: string | null;
  name: string;
  email: string;
  phone: string;
  state: string | null; // 2-letter code, or null ("Prefer not to say")
};

const EMPTY_ANSWERS: Answers = {
  age_range: null,
  coverage_amount_requested: null,
  coverage_preference: null,
  term_years: null,
  policy_preference: null,
  tobacco_use: null,
  health_status: null,
  monthly_budget: null,
  name: "",
  email: "",
  phone: "",
  state: null,
};

type FieldErrors = { name?: string; email?: string; consent?: string };

const coverLabel = (a: Answers): string => {
  if (a.coverage_amount_requested != null)
    return "$" + a.coverage_amount_requested.toLocaleString("en-US");
  return a.coverage_preference === "over_1m"
    ? "More than $1M"
    : a.coverage_preference === "not_sure"
      ? "Not sure yet"
      : "—";
};

const termLabel = (a: Answers): string => {
  if (a.term_years != null) return `${a.term_years} years`;
  return a.policy_preference === "whole_life"
    ? "Whole life (lifetime)"
    : a.policy_preference === "not_sure"
      ? "Not sure"
      : "—";
};

const labelFor = <T,>(
  options: { value: T; label: string }[],
  value: T | null | undefined
): string => {
  if (value == null) return "—";
  return options.find((o) => o.value === value)?.label ?? String(value);
};

// ── Component ────────────────────────────────────────────────────────────────
export default function GetQuotePage() {
  const [step, setStep] = useState<number>(INTRO);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phoneWarn, setPhoneWarn] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const consentRef = useRef<HTMLInputElement | null>(null);

  // ── sessionStorage persistence (refresh resilience) ──
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { answers?: Partial<Answers>; step?: number };
      if (
        saved &&
        typeof saved.step === "number" &&
        saved.step >= 1 &&
        saved.step <= REVIEW &&
        saved.answers
      ) {
        setAnswers({ ...EMPTY_ANSWERS, ...saved.answers });
        setStep(saved.step);
      }
    } catch {
      // Corrupt storage — start fresh.
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
    }
  }, []);

  useEffect(() => {
    try {
      if (step >= 1 && step <= REVIEW) {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, step }));
      } else if (step === SUCCESS) {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage unavailable (private mode etc.) — flow still works in-memory.
    }
  }, [answers, step]);

  const clearStored = useCallback(() => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  // ── Focus management ──
  useEffect(() => {
    if (step >= 1 && step <= SUCCESS) {
      headingRef.current?.focus({ preventScroll: true });
    } else if (step === INTRO) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [step]);

  useEffect(() => {
    if (errors.name) nameRef.current?.focus();
    else if (errors.email) emailRef.current?.focus();
    else if (errors.consent) consentRef.current?.focus();
  }, [errors]);

  // ── Screen-reader announcement on step change ──
  useEffect(() => {
    if (step === INTRO) {
      setAnnouncement("Life insurance, without the runaround.");
    } else if (step === SUCCESS) {
      const first = answers.name.trim().split(/\s+/)[0];
      setAnnouncement(`Thanks, ${first || "there"} — your inquiry is in.`);
    } else {
      setAnnouncement(`Step ${step} of 10. ${STEP_QUESTIONS[step - 1]}`);
    }
  }, [step, answers.name]);

  // ── Field completion (for clickable progress segments) ──
  const fieldComplete = useCallback(
    (s: number): boolean => {
      switch (s) {
        case 1:
          return answers.age_range != null;
        case 2:
          return answers.coverage_amount_requested != null || answers.coverage_preference != null;
        case 3:
          return answers.term_years != null || answers.policy_preference != null;
        case 4:
          return answers.tobacco_use != null;
        case 5:
          return answers.health_status != null;
        case 6:
          return answers.monthly_budget != null;
        case 7:
          return answers.name.trim().length >= 2;
        case 8:
          return EMAIL_RE.test(answers.email.trim());
        case 9:
          return true; // phone + state are optional; completing 1–8 reaches it
        default:
          return false;
      }
    },
    [answers]
  );

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((a) => ({ ...a, [key]: value }));
  };

  const goTo = (target: number) => {
    setSubmitError(null);
    setErrors({});
    setStep(target);
  };

  const selectStep = (target: number) => {
    // Jump from the review screen back to a specific step; answers preserved.
    goTo(target);
  };

  // ── Step validation + Continue ──
  const validateStep = (s: number): boolean => {
    const next: FieldErrors = {};
    if (s === 7) {
      const n = answers.name.trim();
      if (!n) next.name = "Please tell us your name.";
      else if (n.length < 2) next.name = "Mind adding your full name?";
    }
    if (s === 8) {
      const e = answers.email.trim();
      if (!e) next.email = "Please enter your email so we can send your options.";
      else if (!EMAIL_RE.test(e)) next.email = "That email doesn't look right — mind double-checking it?";
    }
    if (s === 9) {
      const digits = answers.phone.replace(/\D/g, "");
      setPhoneWarn(digits.length > 0 && digits.length < 7);
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleContinue = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    if (!validateStep(step)) return;
    const target = Math.min(step + 1, REVIEW);
    goTo(target);
  };

  // ── Submit (review) ──
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    if (!consent) {
      setErrors({ consent: "Please tick the box so we know it's OK to contact you." });
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      // One retry after a transient failure, so a single blip never loses the
      // submission. No retry loop beyond that — the user drives re-submits.
      const attempt = async (): Promise<Response> =>
        fetch("/api/consumer-inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: answers.name.trim(),
            email: answers.email.trim(),
            phone: answers.phone.trim() ? answers.phone.trim() : undefined,
            state: answers.state ?? undefined,
            age_range: answers.age_range,
            coverage_amount_requested: answers.coverage_amount_requested,
            coverage_preference: answers.coverage_preference,
            term_years: answers.term_years,
            policy_preference: answers.policy_preference,
            tobacco_use: answers.tobacco_use,
            health_status: answers.health_status,
            monthly_budget: answers.monthly_budget,
            consent_contact: true,
          }),
        });
      let response = await attempt();
      if (response.status === 503 || response.status >= 500) {
        response = await attempt();
      }
      if (response.ok) {
        clearStored();
        setStep(SUCCESS);
        return;
      }
      let message = "Something went wrong on our end — your answers are safe. Please try again.";
      try {
        const data = (await response.json()) as { error?: string };
        if (data?.error) message = data.error;
      } catch {
        /* keep default */
      }
      if (response.status === 503) {
        // Consent capture is temporarily disabled server-side. Honest setup
        // error — no auto-retry loop; the user can try again whenever.
        setSubmitError("We're setting things up — please try again shortly.");
        return;
      }
      if (response.status === 400) {
        // Route validation failed — map back to the offending step.
        if (/name/i.test(message)) {
          goTo(7);
          setErrors({ name: "Please tell us your name." });
          return;
        }
        if (/email/i.test(message)) {
          goTo(8);
          setErrors({ email: "That email doesn't look right — mind double-checking it?" });
          return;
        }
        if (/state/i.test(message)) {
          goTo(9);
          setSubmitError("Please pick your state from the list.");
          return;
        }
      }
      setSubmitError(message);
    } catch {
      setSubmitError("Something went wrong on our end — your answers are safe. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const exitHome = () => {
    clearStored();
  };

  const skipToQuestions = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    goTo(step >= 1 && step <= REVIEW ? step : 1);
  };

  // ── Progress bar (steps 1–10 only) ──
  const renderProgress = () => {
    if (step < 1 || step > REVIEW) return null;
    return (
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={step}
        aria-label="Progress"
        className="mb-6"
      >
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-slate-600">
            Step {step} of 10
          </span>
          <span className="text-[13px] text-slate-500">{STEP_PHASE(step)}</span>
        </div>
        <ol aria-label="Steps" className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => {
            const s = i + 1;
            const isCurrent = s === step;
            const isPast = s < step;
            const canClick =
              !isCurrent && s < step && s <= 9 && (s === 9 || fieldComplete(s));
            return (
              <li key={s} className="h-[6px] flex-1">
                {canClick ? (
                  <button
                    type="button"
                    aria-label={`Go back to step ${s}: ${STEP_QUESTIONS[s - 1]}`}
                    onClick={() => selectStep(s)}
                    className="block h-full w-full rounded-full bg-gold-500 transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
                  />
                ) : (
                  <span
                    aria-current={isCurrent ? "step" : undefined}
                    aria-disabled={!isPast && !isCurrent ? true : undefined}
                    className={`block h-full w-full rounded-full ${
                      isCurrent
                        ? "bg-gold-500 ring-2 ring-inset ring-navy-900/70"
                        : isPast
                          ? "bg-gold-500"
                          : "bg-[#E4E2DB]"
                    }`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    );
  };

  // ── Shared UI ──
  const renderBack = () =>
    step >= 1 && step <= REVIEW ? (
      <div className="mb-6">
        <button
          type="button"
          onClick={() => goTo(step === 1 ? INTRO : step - 1)}
          aria-label="Back to previous question"
          className="-ml-2 rounded-lg px-2 py-2 text-sm font-medium text-navy-700 transition hover:underline hover:underline-offset-4 hover:decoration-gold-500 hover:text-navy-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
        >
          ← Back
        </button>
      </div>
    ) : null;

  const renderOptionCards = (
    qKey: string,
    checked: boolean,
    onChange: () => void,
    label: string,
    big = false
  ) => (
    <label
      className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl bg-white px-5 text-left transition hover:bg-[#FAFAF7] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#d4a843] ${
        checked
          ? "bg-[#FBF6EA] ring-2 ring-inset ring-gold-500"
          : "ring-1 ring-inset ring-[#E5E2DA]"
      } ${big ? "py-5" : "py-4"}`}
    >
      <input
        type="radio"
        name={qKey}
        value={label}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className={`font-medium text-navy-900 ${big ? "text-lg leading-snug" : "text-base"}`}
      >
        {label}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? "border-gold-500" : "border-[#C9C5BC]"
        }`}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-gold-500" />}
      </span>
    </label>
  );

  const renderFieldError = (msg: string | undefined, id: string) =>
    msg ? (
      <p id={id} role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-red-600">
        <span aria-hidden="true">⚠</span>
        {msg}
      </p>
    ) : null;

  // ── Screens ──
  const renderIntro = () => (
    <div className="step-enter text-center">
      <div className="mb-2 flex items-center justify-center gap-2 text-lg font-bold text-navy-900">
        <span className="text-gold-500">◆</span>
        <span>Apex Life AI</span>
      </div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-3xl font-bold tracking-tight text-navy-900 outline-none"
      >
        Life insurance, without the runaround.
      </h1>
      <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-slate-600">
        A few quick questions, plain answers, and options that actually fit —
        from a licensed agent who takes the time to explain things.
      </p>
      <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-[15px] text-slate-700">
        <li className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-0.5 text-gold-500">◆</span>
          No obligation. This is just an inquiry.
        </li>
        <li className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-0.5 text-gold-500">◆</span>
          No spam. We only write about your options.
        </li>
        <li className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-0.5 text-gold-500">◆</span>
          Opt out anytime — just say the word.
        </li>
      </ul>
      <button
        type="button"
        onClick={() => goTo(1)}
        className="mt-8 w-full rounded-xl bg-gold-500 px-6 py-4 text-base font-semibold text-navy-900 transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
      >
        Get started →
      </button>
      <p className="mt-5 text-[11px] leading-relaxed text-slate-500">
        This is an inquiry about life insurance options. Submitting doesn&apos;t
        create a policy, lock in a rate, or guarantee coverage.
      </p>
    </div>
  );

  const renderQuestionStep = () => {
    const s = step as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    const q = STEP_QUESTIONS[s - 1];
    const helper = STEP_HELPERS[s];

    if (s === 7 || s === 8 || s === 9) {
      return (
        <div className="step-enter">
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-navy-900 outline-none sm:text-3xl">
            {q}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{helper}</p>
          <div className="mt-7 flex flex-col gap-5">
            {s === 7 && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gq-name" className="text-sm font-medium text-navy-900">
                  Full name
                </label>
                <input
                  id="gq-name"
                  ref={nameRef}
                  type="text"
                  value={answers.name}
                  onChange={(e) => {
                    set("name", e.target.value);
                    if (errors.name) setErrors((er) => ({ ...er, name: undefined }));
                  }}
                  placeholder="Jamie Rivera"
                  autoComplete="name"
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? "gq-name-error" : undefined}
                  className="w-full rounded-xl border border-[#E5E2DA] bg-white px-4 py-3.5 text-base text-navy-900 placeholder-slate-400 outline-none transition focus:border-gold-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
                />
                {renderFieldError(errors.name, "gq-name-error")}
              </div>
            )}
            {s === 8 && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="gq-email" className="text-sm font-medium text-navy-900">
                  Email
                </label>
                <input
                  id="gq-email"
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  value={answers.email}
                  onChange={(e) => {
                    set("email", e.target.value);
                    if (errors.email) setErrors((er) => ({ ...er, email: undefined }));
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? "gq-email-error" : undefined}
                  className="w-full rounded-xl border border-[#E5E2DA] bg-white px-4 py-3.5 text-base text-navy-900 placeholder-slate-400 outline-none transition focus:border-gold-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
                />
                {renderFieldError(errors.email, "gq-email-error")}
              </div>
            )}
            {s === 9 && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="gq-phone" className="text-sm font-medium text-navy-900">
                    Phone <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <input
                    id="gq-phone"
                    type="tel"
                    inputMode="tel"
                    value={answers.phone}
                    onChange={(e) => {
                      set("phone", e.target.value);
                      setPhoneWarn(false);
                    }}
                    placeholder="(555) 123-4567"
                    autoComplete="tel"
                    aria-invalid={phoneWarn ? true : undefined}
                    aria-describedby={phoneWarn ? "gq-phone-warn" : undefined}
                    className="w-full rounded-xl border border-[#E5E2DA] bg-white px-4 py-3.5 text-base text-navy-900 placeholder-slate-400 outline-none transition focus:border-gold-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
                  />
                  {phoneWarn && (
                    <p id="gq-phone-warn" role="status" className="mt-2 flex items-start gap-1.5 text-sm text-amber-700">
                      <span aria-hidden="true">i</span>
                      That number looks short — double-check it if you&apos;d like us to call.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="gq-state" className="text-sm font-medium text-navy-900">
                    State <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <select
                    id="gq-state"
                    value={answers.state ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      set("state", v === "" || v === "__prefer_not" ? null : v);
                    }}
                    autoComplete="address-level1"
                    className="w-full rounded-xl border border-[#E5E2DA] bg-white px-4 py-3.5 text-base text-navy-900 outline-none transition focus:border-gold-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
                  >
                    <option value="">Select a state</option>
                    {LICENSED_STATES.map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.label} ({st.code})
                      </option>
                    ))}
                    <option value="__prefer_not">Prefer not to say</option>
                  </select>
                  <p className="mt-1 text-[13px] text-slate-500">
                    We&apos;ll use this to confirm we can serve you where you live.
                  </p>
                </div>
              </>
            )}
          </div>
          <button
            type="submit"
            className="mt-8 w-full rounded-xl bg-gold-500 px-6 py-4 text-base font-semibold text-navy-900 transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
          >
            Continue →
          </button>
        </div>
      );
    }

    // Option-card steps (1–6)
    const renderCards = () => {
      switch (s) {
        case 1:
          return (
            <fieldset>
              <legend className="sr-only">{q}</legend>
              <div className="flex flex-col gap-3">
                {AGE_OPTIONS.map((o) =>
                  renderOptionCards(
                    "q1",
                    answers.age_range === o.value,
                    () => set("age_range", o.value),
                    o.label
                  )
                )}
              </div>
            </fieldset>
          );
        case 2:
          return (
            <fieldset>
              <legend className="sr-only">{q}</legend>
              <div className="flex flex-col gap-3">
                {COVERAGE_OPTIONS.map((o) => {
                  const checked = o.pref
                    ? answers.coverage_preference === o.pref
                    : answers.coverage_amount_requested === o.amount;
                  return renderOptionCards(
                    "q2",
                    checked,
                    () =>
                      setAnswers((a) =>
                        o.pref
                          ? { ...a, coverage_amount_requested: null, coverage_preference: o.pref }
                          : { ...a, coverage_amount_requested: o.amount, coverage_preference: null }
                      ),
                    o.label
                  );
                })}
              </div>
            </fieldset>
          );
        case 3:
          return (
            <fieldset>
              <legend className="sr-only">{q}</legend>
              <div className="flex flex-col gap-3">
                {TERM_OPTIONS.map((o) => {
                  const checked = o.pref
                    ? answers.policy_preference === o.pref
                    : answers.term_years === o.years;
                  return renderOptionCards(
                    "q3",
                    checked,
                    () =>
                      setAnswers((a) =>
                        o.pref
                          ? { ...a, term_years: null, policy_preference: o.pref }
                          : { ...a, term_years: o.years, policy_preference: null }
                      ),
                    o.label
                  );
                })}
              </div>
            </fieldset>
          );
        case 4:
          return (
            <fieldset>
              <legend className="sr-only">{q}</legend>
              <div className="flex flex-col gap-3">
                {TOBACCO_OPTIONS.map((o) =>
                  renderOptionCards(
                    "q4",
                    answers.tobacco_use === o.value,
                    () => set("tobacco_use", o.value),
                    o.label,
                    true
                  )
                )}
              </div>
            </fieldset>
          );
        case 5:
          return (
            <fieldset>
              <legend className="sr-only">{q}</legend>
              <div className="flex flex-col gap-3">
                {HEALTH_OPTIONS.map((o) =>
                  renderOptionCards(
                    "q5",
                    answers.health_status === o.value,
                    () => set("health_status", o.value),
                    o.label
                  )
                )}
              </div>
            </fieldset>
          );
        case 6:
          return (
            <fieldset>
              <legend className="sr-only">{q}</legend>
              <div className="flex flex-col gap-3">
                {BUDGET_OPTIONS.map((o) =>
                  renderOptionCards(
                    "q6",
                    answers.monthly_budget === o.value,
                    () => set("monthly_budget", o.value),
                    o.label
                  )
                )}
              </div>
            </fieldset>
          );
        default:
          return null;
      }
    };

    const selectionMade =
      (s === 1 && answers.age_range != null) ||
      (s === 2 && (answers.coverage_amount_requested != null || answers.coverage_preference != null)) ||
      (s === 3 && (answers.term_years != null || answers.policy_preference != null)) ||
      (s === 4 && answers.tobacco_use != null) ||
      (s === 5 && answers.health_status != null) ||
      (s === 6 && answers.monthly_budget != null);

    return (
      <div className="step-enter">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-navy-900 outline-none sm:text-3xl">
          {q}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{helper}</p>
        <div className="mt-7">{renderCards()}</div>
        <button
          type="submit"
          disabled={!selectionMade}
          className="mt-8 w-full rounded-xl bg-gold-500 px-6 py-4 text-base font-semibold text-navy-900 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
        >
          Continue →
        </button>
      </div>
    );
  };

  const renderReview = () => {
    const stateLabel = answers.state
      ? `${LICENSED_STATES.find((st) => st.code === answers.state)?.label ?? answers.state} (${answers.state})`
      : "Prefer not to say";
    const rows: { key: string; label: string; value: string; target: number }[] = [
      { key: "age", label: "Age", value: labelFor(AGE_OPTIONS, answers.age_range), target: 1 },
      { key: "coverage", label: "Coverage", value: coverLabel(answers), target: 2 },
      { key: "term", label: "Term", value: termLabel(answers), target: 3 },
      {
        key: "tobacco",
        label: "Tobacco/nicotine",
        value: answers.tobacco_use === true ? "Yes — including vaping and nicotine gum" : answers.tobacco_use === false ? "No" : "—",
        target: 4,
      },
      { key: "health", label: "Health", value: labelFor(HEALTH_OPTIONS, answers.health_status), target: 5 },
      { key: "budget", label: "Budget", value: labelFor(BUDGET_OPTIONS, answers.monthly_budget), target: 6 },
      { key: "name", label: "Name", value: answers.name.trim() || "—", target: 7 },
      { key: "email", label: "Email", value: answers.email.trim() || "—", target: 8 },
      { key: "phone", label: "Phone", value: answers.phone.trim() || "—", target: 9 },
      { key: "state", label: "State", value: answers.state ? stateLabel : "—", target: 9 },
    ];

    return (
      <div className="step-enter">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold tracking-tight text-navy-900 outline-none sm:text-3xl">
          One last check — is this right?
        </h1>
        <dl className="mt-6">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-4 border-b border-[#E5E2DA] py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <dt className="text-[13px] text-slate-600">{row.label}</dt>
                <dd className="truncate text-base font-medium text-navy-900">{row.value}</dd>
              </div>
              <button
                type="button"
                onClick={() => selectStep(row.target)}
                aria-label={`Change ${row.label.toLowerCase()}`}
                className="shrink-0 rounded-lg px-2 py-1.5 text-[13px] font-medium text-navy-700 underline-offset-4 transition hover:text-navy-900 hover:underline hover:decoration-gold-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
              >
                Change
              </button>
            </div>
          ))}
        </dl>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-[#E5E2DA] bg-white px-4 py-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#d4a843]">
          <input
            ref={consentRef}
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              setSubmitError(null);
              if (errors.consent) setErrors((er) => ({ ...er, consent: undefined }));
            }}
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "gq-consent-error" : undefined}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#d4a843]"
          />
          <span className="text-[13px] leading-relaxed text-slate-700">{CONSENT_TEXT}</span>
        </label>
        {renderFieldError(errors.consent, "gq-consent-error")}

        <p className="mt-4 text-[13px] leading-relaxed text-slate-500">
          This is an inquiry, not an application. No coverage is guaranteed —
          final terms depend on underwriting and are confirmed with you before
          anything is official.
        </p>

        {submitError && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <span aria-hidden="true">⚠</span>
            <div>
              <p>{submitError}</p>
              <button
                type="button"
                onClick={handleSubmit}
                className="mt-2 font-semibold underline underline-offset-2 hover:text-red-900"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={!consent || submitting}
          className="mt-6 w-full rounded-xl bg-gold-500 px-6 py-4 text-base font-semibold text-navy-900 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
        >
          {submitting ? "Sending…" : "Send me my options"}
        </button>
        <p className="mt-4 text-center text-[13px] text-slate-500">
          We&apos;ll be in touch with options based on what you shared. No spam —
          ever. You can ask us to stop at any time.
        </p>
      </div>
    );
  };

  const renderSuccess = () => {
    const first = answers.name.trim().split(/\s+/)[0] || "there";
    return (
      <div className="step-enter">
        <div className="mb-4 flex justify-center">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-500/15 text-2xl text-gold-500"
          >
            ✓
          </span>
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="text-center text-2xl font-bold tracking-tight text-navy-900 outline-none sm:text-3xl">
          Thanks, {first} — your inquiry is in.
        </h1>
        <p className="mt-4 text-center text-[15px] font-medium text-navy-900">
          Here&apos;s what happens next:
        </p>
        <ol className="mx-auto mt-3 max-w-md list-none space-y-2 text-left text-[15px] leading-relaxed text-slate-600">
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 font-bold text-gold-500">1.</span>
            A licensed agent reviews what you shared.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 font-bold text-gold-500">2.</span>
            They put together life insurance options that fit.
          </li>
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 font-bold text-gold-500">3.</span>
            They reach out with those options and answer any questions — no
            pressure, no obligation.
          </li>
        </ol>
        <p className="mt-5 text-center text-[15px] leading-relaxed text-slate-600">
          This was an inquiry, not an application — nothing is finalized until
          you&apos;ve seen real options and made a decision with the agent.
        </p>
        <p className="mt-3 text-center text-[15px] text-slate-600">
          Any questions in the meantime? Just reply to the email you&apos;ll
          receive from us.
        </p>
        <a
          href="/"
          className="mt-8 block w-full rounded-xl bg-gold-500 px-6 py-4 text-center text-base font-semibold text-navy-900 transition hover:bg-gold-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a843]"
        >
          Back to homepage
        </a>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-[#F7F6F2] text-navy-900">
      <a
        href="#questions"
        onClick={skipToQuestions}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to questions
      </a>

      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pb-2 pt-5 sm:px-6">
        {step === INTRO || step === SUCCESS ? (
          <a
            href="/"
            className="flex items-center gap-2 text-sm font-bold text-navy-900"
          >
            <span className="text-lg text-gold-500">◆</span>
            Apex Life AI
          </a>
        ) : (
          <span className="flex items-center gap-2 text-sm font-bold text-navy-900">
            <span className="text-lg text-gold-500">◆</span>
            Apex Life AI
          </span>
        )}
        {step === INTRO || step === SUCCESS ? (
          <a
            href="/"
            onClick={exitHome}
            className="px-2 py-2 text-sm font-medium text-slate-500 transition hover:text-navy-900 hover:underline hover:underline-offset-4 hover:decoration-gold-500"
          >
            ← Back to Apex Life AI
          </a>
        ) : (
          <span aria-hidden="true" className="invisible select-none px-2 py-2 text-sm">
            ← Back to Apex Life AI
          </span>
        )}
      </header>

      <div className="mx-auto w-full max-w-[560px] px-4 pb-14 pt-4 sm:px-6">
        <div
          id="questions"
          className="rounded-[20px] border border-[#E5E2DA] bg-white p-6 shadow-[0_1px_3px_rgba(10,22,40,0.08),0_8px_24px_rgba(10,22,40,0.06)] sm:p-8"
        >
          {renderProgress()}
          {renderBack()}

          <form
            noValidate
            onSubmit={step === REVIEW ? handleSubmit : handleContinue}
          >
            {step === INTRO && renderIntro()}
            {step >= 1 && step <= 9 && renderQuestionStep()}
            {step === REVIEW && renderReview()}
            {step === SUCCESS && renderSuccess()}
          </form>
        </div>
      </div>

      <footer className="mx-auto w-full max-w-3xl px-4 pb-10 text-center sm:px-6">
        <p className="text-[13px] font-medium text-slate-600">
          No obligation <span aria-hidden="true">·</span> No spam{" "}
          <span aria-hidden="true">·</span> Opt out anytime{" "}
          <span aria-hidden="true">·</span> Your details are never sold
        </p>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-slate-500">
          Your details are used only to follow up on this inquiry and are never
          sold. Need a do-not-contact request? Email privacy@apexlife.ai or
          just tell the agent — we&apos;ll make sure you&apos;re not contacted
          again.
        </p>
      </footer>

      {/* Screen-reader step announcements */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </main>
  );
}