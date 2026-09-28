"use client";

import { useEffect, useState } from "react";

export const QUOTE_SHARE_URL =
  "https://8092772b2ef8b4200cd7644b1c20224a.ctonew.app/get-quote?utm_source=owner-share";

/**
 * "Share quote link" modal — shows the owner's quote-funnel URL with a copy
 * button. Front-end only: the funnel server already ignores unknown query
 * params, so the utm_source tag is safe today and becomes measurable when
 * UTM capture ships.
 */
export default function ShareLinkModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopy = async () => {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(QUOTE_SHARE_URL);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable (permissions / non-secure context);
      // fall back to a manual select so the owner can still copy by hand.
      const input = document.getElementById("share-link-input") as HTMLInputElement | null;
      if (input) {
        input.select();
        setCopyFailed(false);
        setCopied(false);
        return;
      }
      setCopyFailed(true);
    }
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share quote link"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Share quote link</h3>
            <p className="mt-1 text-sm text-slate-500">
              Sends people to your quote form — submissions land in your pipeline.
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

        <div className="mt-4 flex items-center gap-2">
          <input
            id="share-link-input"
            type="text"
            readOnly
            value={QUOTE_SHARE_URL}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-gold-400"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {copyFailed && (
          <p className="mt-2 text-xs text-red-600">
            Couldn&apos;t copy automatically — select the link and copy it manually.
          </p>
        )}
        <p className="mt-4 text-xs text-slate-400">
          The <code className="rounded bg-slate-50 px-1 py-0.5">utm_source=owner-share</code> tag
          marks submissions that arrived via this link. Tracking per-source is not wired up yet, so
          treat it as a label for later, not a report today.
        </p>
      </div>
    </div>
  );
}
