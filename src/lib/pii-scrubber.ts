/**
 * PII/PHI Anonymization Scrubber
 *
 * Redacts sensitive identifiers from free-text (conversation transcripts,
 * message content) before storage, and flags (without redacting) medical
 * terms that may indicate protected health information (PHI).
 *
 * Redaction order matters: credit cards run FIRST (a 16-digit card contains
 * a 3-2-4 dash pattern that would false-positive as an SSN), then SSNs, DOBs,
 * and finally phone numbers (which must not be redacted if they are already
 * known to the system, e.g. the lead's own phone).
 */

export const REDACTED_SSN = "[REDACTED_SSN]";
export const REDACTED_CC = "[REDACTED_CC]";
export const REDACTED_DOB = "[REDACTED_DOB]";
export const REDACTED_PHONE = "[REDACTED_PHONE]";

export interface ScrubResult {
  scrubbedText: string;
  /** e.g. ["SSN → [REDACTED_SSN]", "CC → [REDACTED_CC]"] */
  redactions: string[];
  /** true when a medical/PHI term was detected (term is NOT redacted) */
  containsPHI: boolean;
}

export interface ScrubOptions {
  /** Phone numbers the system already knows (e.g. the lead's own number) — these are NOT redacted. */
  knownPhones?: string[];
}

/**
 * 13–19 digit card numbers, optionally separated by single spaces or dashes
 * (e.g. 4111111111111111, 4111 1111 1111 1111, 4111-1111-1111-1111).
 * The lookarounds stop it from grabbing a slice of a longer digit run while
 * still matching a card that is followed by a normal space/punctuation.
 */
const CC_RE = /(?<!\d)(?:\d[\s-]?){12,18}\d(?![\s-]*\d)/g;

/** SSN in xxx-xx-xxxx form. Runs after CC so card groups don't false-positive. */
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

/** MM/DD/YYYY (or M/D/YYYY). */
const DOB_NUMERIC_RE = /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(19|20)\d{2}\b/g;

/** "Month DD, YYYY" (full or abbreviated month names). */
const DOB_MONTHS =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const DOB_TEXTUAL_RE = new RegExp(
  `\\b(?:${DOB_MONTHS})\\s+\\d{1,2},\\s+(?:19|20)\\d{2}\\b`,
  "gi"
);

/**
 * 10-digit US numbers with optional +1 country code and common separators:
 * (214) 555-0132, 214-555-0132, 214.555.0132, 2145550132, +1-214-555-0132.
 */
const PHONE_RE =
  /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)[\s.-]?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g;

/**
 * Common PHI vocabulary for life-insurance underwriting context.
 * These are FLAGGED (containsPHI = true) but never redacted — the transcript
 * still needs the context, downstream systems just treat the message as PHI.
 */
const PHI_TERMS = [
  "HIV",
  "AIDS",
  "cancer",
  "carcinoma",
  "melanoma",
  "tumor",
  "chemotherapy",
  "diabetes",
  "hepatitis",
  "cirrhosis",
  "liver disease",
  "kidney disease",
  "renal failure",
  "dialysis",
  "transplant",
  "leukemia",
  "lymphoma",
  "multiple sclerosis",
  "parkinson",
  "alzheimer",
  "dementia",
  "epilepsy",
  "seizure",
  "stroke",
  "heart attack",
  "myocardial infarction",
  "COPD",
  "emphysema",
  "asthma",
  "depression",
  "anxiety",
  "bipolar",
  "schizophrenia",
  "antidepressant",
  "antipsychotic",
  "insulin",
  "psychiatric",
  "hospitalized",
  "surgery",
  "prescription",
  "medication",
  "pregnancy",
] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Strip everything non-digit, keep the last 10 digits (drops +1/trunk prefixes). */
export function normalizePhone(s: string): string {
  return s.replace(/\D/g, "").slice(-10);
}

export function scrubPII(text: string, options: ScrubOptions = {}): ScrubResult {
  const knownPhones = new Set((options.knownPhones ?? []).map(normalizePhone));
  const redactions = new Set<string>();

  let scrubbed = text;

  // 1. Credit cards (first — otherwise card groups false-positive as SSNs)
  scrubbed = scrubbed.replace(CC_RE, () => {
    redactions.add(`CC → ${REDACTED_CC}`);
    return REDACTED_CC;
  });

  // 2. SSNs
  scrubbed = scrubbed.replace(SSN_RE, () => {
    redactions.add(`SSN → ${REDACTED_SSN}`);
    return REDACTED_SSN;
  });

  // 3. Dates of birth (numeric + textual)
  scrubbed = scrubbed.replace(DOB_NUMERIC_RE, () => {
    redactions.add(`DOB → ${REDACTED_DOB}`);
    return REDACTED_DOB;
  });
  scrubbed = scrubbed.replace(DOB_TEXTUAL_RE, () => {
    redactions.add(`DOB → ${REDACTED_DOB}`);
    return REDACTED_DOB;
  });

  // 4. Phone numbers — skip ones the system already knows about
  scrubbed = scrubbed.replace(PHONE_RE, (match) => {
    if (knownPhones.has(normalizePhone(match))) return match;
    redactions.add(`Phone → ${REDACTED_PHONE}`);
    return REDACTED_PHONE;
  });

  // 5. PHI flagging — detect on the ORIGINAL text, never redact
  let containsPHI = false;
  for (const term of PHI_TERMS) {
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
    if (re.test(text)) {
      containsPHI = true;
      break;
    }
  }

  return {
    scrubbedText: scrubbed,
    redactions: [...redactions],
    containsPHI,
  };
}
