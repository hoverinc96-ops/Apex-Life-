"use client";

import { useRef, useState } from "react";

interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
  errors: { row: number; reason: string }[];
}

export default function ImportLeadsPanel({ onImported }: { onImported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  };

  const handleImport = async () => {
    if (!file) {
      setError("Choose a CSV file first.");
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
        Import leads from CSV
        <span className="ml-1 rounded-full border border-gold-500/30 bg-gold-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-400">
          Upload
        </span>
      </button>

      {open && (
        <div className="space-y-4 px-6 pb-5 pt-1">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label htmlFor="leads-csv-file" className="mb-1.5 block text-xs font-medium text-slate-400">
                CSV file <span className="text-slate-500">(columns: first_name, last_name, email, phone, state, coverage_amount, notes)</span>
              </label>
              <input
                ref={inputRef}
                id="leads-csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full max-w-md cursor-pointer rounded-lg border border-navy-700/50 bg-navy-800/60 text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-navy-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gold-400 hover:file:bg-navy-600"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-900 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
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
