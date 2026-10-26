"use client";

import { useEffect, useRef, useState } from "react";

interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
  errors: { row: number; reason: string }[];
}

export default function ImportLeadsPanel({
  onImported,
  forceOpen = false,
}: {
  onImported?: () => void;
  /** Lets a parent (e.g. the Overview quick action) open the panel too. */
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The Overview quick action flips forceOpen — actually open the panel when it does.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setResult(null);
      setError(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setImporting(true);
    setResult(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/leads/import", { method: "POST", body: formData });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Import failed");
      }
      setResult(body as ImportResult);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed — please try again.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="shrink-0 border-b border-navy-700/50 bg-navy-800/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-6 py-3 text-left text-sm font-medium text-slate-200 transition hover:text-gold-400"
        aria-expanded={open}
      >
        <svg
          className={`h-4 w-4 text-gold-500 transition-transform ${open ? "rotate-90" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
        Import leads from CSV or Excel
        <span className="ml-1 rounded-full border border-gold-500/30 bg-gold-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-400">
          Upload
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-100 px-6 pb-5 pt-4">
          {/* Full-panel drop zone. The native <input type="file"> is stretched
              across the whole zone (absolute inset-0, opacity-0) so every tap
              hits the real control — never display:none or 0-height, which
              iOS/Safari need a real hit target to open the picker. No `accept`
              attribute: it makes mobile pickers gray out everything else;
              the server validates by content instead. */}
          <div>
            <label
              htmlFor="leads-csv-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`relative flex min-h-[88px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                dragOver
                  ? "border-gold-400 bg-gold-500/10"
                  : "border-navy-700/50 bg-navy-800/40 hover:border-gold-500/50 hover:bg-navy-700/30"
              }`}
            >
              <svg
                className="h-6 w-6 shrink-0 text-gold-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              </svg>
              <span className="pointer-events-none text-sm font-semibold text-slate-200">
                {file ? file.name : "Tap to choose a file or drag it here"}
              </span>
              <span className="pointer-events-none text-xs text-slate-500">
                CSV, Excel (.xlsx), or .txt · up to 5 MB · columns: first_name, last_name, email, phone, state, coverage_amount, notes
              </span>
              <input
                ref={inputRef}
                id="leads-csv-file"
                type="file"
                onChange={handleFileChange}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import"}
            </button>
            <a
              href="/leads-template.csv"
              download="leads-template.csv"
              className="text-xs font-medium text-gold-400 underline-offset-2 hover:text-gold-300 hover:underline"
            >
              Download CSV template
            </a>
          </div>
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
          {result && (
            <div className="rounded-lg border border-navy-700/50 bg-navy-900/60 p-3">
              <p className="text-sm font-medium text-emerald-400">
                ✓ {result.imported} imported, {result.duplicates} duplicates skipped, {result.failed} failed
                <span className="ml-2 text-xs font-normal text-slate-500">
                  ({result.total} rows processed)
                </span>
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-navy-700/50 bg-navy-800/60 p-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Skipped / failed rows
                  </p>
                  <ul className="space-y-0.5 text-xs text-red-400">
                    {result.errors.map((err, idx) => (
                      <li key={idx}>
                        Row {err.row}: {err.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
