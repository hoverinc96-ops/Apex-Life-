/**
 * E4 — end-to-end attribution capture for the /get-quote consumer funnel.
 *
 * WHAT IS CAPTURED (compliance verdict §4): the five UTM params
 * (utm_source, utm_medium, utm_campaign, utm_content, utm_term) plus ad
 * click-IDs (fbclid, gclid; msclkid optional). Values are stored EXACTLY as
 * they arrive in the URL — absent params stay null. We never invent
 * attribution: no defaults, no fabricated sources, no referrer guessing.
 *
 * Capture semantics (first-touch):
 *  - On wizard entry, recognized params are read from the URL and persisted
 *    to sessionStorage so they survive client-side navigation and reloads
 *    (the wizard restores answers from sessionStorage on refresh — the same
 *    resilience the attribution needs).
 *  - Once stored, a later visit WITHOUT params keeps the stored values; a
 *    same-tab re-land with DIFFERENT params does NOT overwrite (first-touch
 *    wins — the standard attribution model).
 *  - On successful submit the stored attribution is cleared along with the
 *    answers, so the next visitor in that tab starts clean.
 *
 * The `?utm_source=owner-share` tag the dashboard's "Share quote link" modal
 * appends is captured by exactly this path — before E4 it was silently
 * ignored.
 */

export interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  msclkid: string | null;
}

export const EMPTY_ATTRIBUTION: Attribution = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  utm_term: null,
  fbclid: null,
  gclid: null,
  msclkid: null,
};

/** sessionStorage key — separate from the answers key (apex-consumer-inquiry-v1). */
export const ATTRIBUTION_STORAGE_KEY = "apex-utm-attribution-v1";

/** URL params that carry attribution, in canonical order. */
const ATTRIBUTION_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "msclkid",
] as const;

/** Server-side cap — matches the client trim; anything longer is abuse. */
export const ATTRIBUTION_MAX_LEN = 512;

/**
 * Read attribution out of a URL query string (client: window.location.search).
 * Only present, non-empty values are returned — absent params are simply
 * missing keys, never invented. Values are trimmed and length-capped.
 */
export function readAttributionFromSearch(
  search: string
): Partial<Attribution> {
  const found: Partial<Attribution> = {};
  const params = new URLSearchParams(search);
  for (const key of ATTRIBUTION_PARAMS) {
    const raw = params.get(key);
    if (raw == null) continue;
    const value = raw.trim().slice(0, ATTRIBUTION_MAX_LEN);
    if (value.length === 0) continue;
    found[key] = value;
  }
  return found;
}

/** True when the object carries at least one real attribution value. */
export function hasAttribution(a: Partial<Attribution> | null | undefined): boolean {
  if (!a) return false;
  return ATTRIBUTION_PARAMS.some((k) => {
    const v = (a as Record<string, unknown>)[k];
    return typeof v === "string" && v.length > 0;
  });
}

/**
 * Human-readable one-liner for dashboard surfaces.
 *   "owner-share / none · spring-drive (fbclid:AbC…)"
 *   "Direct — no attribution data"   ← when every field is null/missing.
 * Long click-IDs are truncated for display; the full value stays in the DB.
 */
export function formatAttribution(
  a: Partial<Attribution> | null | undefined
): string {
  if (!hasAttribution(a)) return "Direct — no attribution data";
  const parts: string[] = [];
  if (a?.utm_source) parts.push(a.utm_source);
  if (a?.utm_medium) parts.push(a.utm_medium);
  if (a?.utm_campaign) parts.push(a.utm_campaign);
  const base = parts.join(" / ") || "Unknown";
  const clickId = a?.fbclid ?? a?.gclid ?? a?.msclkid ?? null;
  const clickLabel = clickId ? ` (${clickId.length > 24 ? clickId.slice(0, 24) + "…" : clickId})` : "";
  return `${base}${clickLabel}`;
}

/** Coerce an unknown value (API JSON) into a cleaned attribution string or null. */
export function attributionValueOrNull(v: unknown, max = ATTRIBUTION_MAX_LEN): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s.length > 0 ? s : null;
}

/**
 * Compact chip label for pipeline/clients surfaces: the captured utm_source,
 * else the captured click-ID param name; null when nothing was captured
 * (chips render "Direct" instead). Never invents a value — it only relabels
 * what was actually captured.
 */
export function attributionChipLabel(
  a: Partial<Attribution> | null | undefined
): string | null {
  if (!a) return null;
  if (a.utm_source) return a.utm_source;
  if (a.fbclid) return "fbclid";
  if (a.gclid) return "gclid";
  if (a.msclkid) return "msclkid";
  return null;
}
