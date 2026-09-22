"use client";

import { useEffect, useState } from "react";

// ── Carrier strip (homepage only — compliance ruling, see
// /home/team/shared/carrier-strip-ruling.md) ─────────────────────────────────
// Exact display strings from ruling §3. ⚠ OWNER ACTION before publish:
// confirm the appointed entities for "CICA Life" and "CoreBridge Financial"
// from appointment paperwork — if either is not confirmed, delete that entry
// from this array. Keep the list current: if an appointment lapses, remove
// the name. Text-only by ruling §2 — never swap these for logos/badges.
const APPOINTED_CARRIERS: readonly string[] = [
  "Ethos Life",
  "Transamerica",
  "CICA Life",
  "CoreBridge Financial",
  "Liberty Bankers Life",
  "Banner Life",
];

// Slow rotation — one name every few seconds, gentle fade, no strobe.
const ROTATE_MS = 3000;

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return reducedMotion;
}

export default function CarrierStrip() {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion || APPOINTED_CARRIERS.length < 2) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % APPOINTED_CARRIERS.length),
      ROTATE_MS
    );
    return () => clearInterval(id);
  }, [reducedMotion]);

  return (
    <section
      aria-label="Carriers we are appointed with"
      className="border-y border-navy-700/50 bg-navy-800/30 py-14"
    >
      <div className="mx-auto max-w-4xl px-6 text-center">
        <p className="mb-6 text-sm font-semibold tracking-wide text-gold-500">
          Carriers we&apos;re appointed with
        </p>

        {reducedMotion ? (
          // Static list when the visitor prefers reduced motion.
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {APPOINTED_CARRIERS.map((name) => (
              <li key={name} className="text-base font-medium text-slate-200">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          // Gentle cross-fade through the names. Inactive names stay in the
          // DOM (aria-hidden) so the section is stable for screen readers.
          <div
            className="relative flex h-8 items-center justify-center"
            aria-live="off"
          >
            {APPOINTED_CARRIERS.map((name, i) => (
              <span
                key={name}
                aria-hidden={i !== index}
                className={`absolute inset-x-0 text-center text-xl font-medium tracking-wide text-slate-200 transition-all duration-700 ease-in-out sm:text-2xl ${
                  i === index
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-1 opacity-0"
                }`}
              >
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Required disclaimer — static, ruling §1. */}
        <p className="mt-6 text-xs text-slate-500">
          Independent agency. Not affiliated with or endorsed by the carriers
          shown.
        </p>
      </div>
    </section>
  );
}
