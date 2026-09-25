"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "apex-welcome-seen";

export default function WelcomeGate() {
  const [show, setShow] = useState(false);
  const primaryRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      seen = false;
    }
    if (!seen) setShow(true);
  }, []);

  useEffect(() => {
    if (show && primaryRef.current) primaryRef.current.focus();
  }, [show]);

  if (!show) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode — just dismiss for this visit */
    }
    setShow(false);
  };

  const dismissAndGo = () => {
    dismiss(); // navigation proceeds via href
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-navy-900/98 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome"
    >
      <div className="w-full max-w-xl text-center">
        <div className="mb-6 flex items-center justify-center gap-2 text-xl font-bold tracking-tight text-white">
          <span className="text-gold-500">◆</span>
          <span>Apex Life</span>
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Welcome.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-slate-300">
          If you&rsquo;ve been putting off life insurance — or just wondering
          what it would actually cost for your family — you&rsquo;re in the
          right place. No spam, no pressure, no obligation. Just a licensed
          agent and straight answers.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            ref={primaryRef}
            href="/get-quote"
            onClick={dismissAndGo}
            className="rounded-lg bg-gold-500 px-6 py-3 text-sm font-semibold text-navy-900 transition hover:bg-gold-400"
          >
            Get a quote
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg border border-navy-600 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-gold-500 hover:text-white"
          >
            See how it works
          </button>
        </div>
        <p className="mt-6 text-xs text-slate-500">
          An inquiry, not an application — nothing is finalized until
          you&rsquo;ve seen real options and decided.
        </p>
      </div>
    </div>
  );
}
