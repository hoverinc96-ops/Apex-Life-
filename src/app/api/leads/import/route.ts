import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import type { PoolClient } from "pg";
import pool from "@/lib/db";
import { normalizePhone } from "@/lib/pii-scrubber";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 10_000;

const UNSUPPORTED_FILE_MESSAGE =
  "We couldn't read this file type — please save it as .xlsx, .csv, or .txt and try again.";

const SCANNED_PDF_MESSAGE =
  "This PDF looks scanned — we can't read pictures of tables. Export from Excel as .xlsx or .csv and try again.";

/**
 * Flattens one Excel cell value (string | number | Date | formula/rich-text/hyperlink
 * object) into the plain string the CSV pipeline expects.
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.result !== undefined && v.result !== null) return cellToString(v.result); // formula result
    if (Array.isArray(v.richText)) {
      return v.richText
        .map((rt) => cellToString((rt as { text?: string }).text))
        .join("");
    }
    if (v.text !== undefined && v.text !== null) return String(v.text); // hyperlink / rich text fallback
    return "";
  }
  return String(value);
}

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface CsvRow {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  state?: string;
  coverage_amount?: string;
  notes?: string;
}

/** True when the buffer starts with the zip local-file magic PK\x03\x04 (or an
 *  empty-archive PK\x05\x04) — i.e. the container .xlsx lives in. */
function isZipMagic(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x50 && // P
    buf[1] === 0x4b && // K
    (buf[2] === 0x03 || buf[2] === 0x05) &&
    buf[3] === 0x04
  );
}

/** True when the buffer contains the "%PDF-" signature within its first KB —
 *  PDFs may carry junk bytes before the header, but never that far in. */
function isPdfMagic(buf: Buffer): boolean {
  return buf.subarray(0, 1024).includes("%PDF-");
}

/**
 * Decodes an upload to text regardless of encoding: handles UTF-8, UTF-8 BOM,
 * and UTF-16 LE/BE BOM (transcoded), and strips any leftover BOM character.
 */
function decodeTextFile(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le").replace(/^\uFEFF/, "");
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16(); // BE → LE in place, then decode as LE
    return swapped.toString("utf16le").replace(/^\uFEFF/, "");
  }
  return buf.toString("utf8").replace(/^\uFEFF/, "");
}

/**
 * Heuristic binary check on decoded text: NUL bytes or a run of unusual
 * control characters mean the file isn't delimited text (e.g. legacy .xls
 * BIFF binaries, images, PDFs) and should get the friendly re-save error.
 */
function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4096);
  if (sample.includes("\u0000")) return true;
  let controlChars = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) controlChars++;
  }
  return sample.length > 0 && controlChars / sample.length > 0.02;
}

/**
 * Picks a delimiter from the first non-empty line by majority count among the
 * realistic candidates (comma, semicolon, tab, pipe). Comma wins ties; a line
 * with none of them leaves the comma default.
 */
function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t", "|"]) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Loads a zip-container workbook (.xlsx) and flattens its first sheet into
 *  the same string[][] shape the CSV path produces. */
async function parseXlsxBuffer(buf: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs bundles non-generic Buffer typings that clash with @types/node 22's
  // generic Buffer; cast through unknown — the runtime call is unchanged.
  const loadXlsx = workbook.xlsx.load.bind(workbook.xlsx) as unknown as (
    data: Buffer
  ) => Promise<ExcelJS.Workbook>;
  await loadXlsx(buf);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("workbook has no worksheets");
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[]; // 1-based; index 0 unused
    const cells: string[] = [];
    for (let c = 1; c < values.length; c++) cells.push(cellToString(values[c]));
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    rows.push(cells);
  });
  return rows;
}

/**
 * Column matching shared by every format: a header cell maps to a field when
 * its normalized form (lowercase, non-alphanumerics stripped) is in that
 * field's alias set — so "First Name", "firstname", and "FIRST-NAME" all match
 * first_name, while unknown columns are ignored silently. Alias sets are
 * disjoint, so one cell can only ever match one field.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  first_name: ["firstname", "first"],
  last_name: ["lastname", "last", "surname", "familyname"],
  email: ["email", "emailaddress", "mail"],
  phone: ["phone", "phonenumber", "mobile", "cell", "cellphone", "contactnumber", "tel"],
  state: ["state", "st"],
  coverage_amount: ["coverageamount", "coverage", "coverageamountrequested"],
  notes: ["notes", "note", "comments", "healthnotes"],
};

/** Bare "name"/"fullname" fallback — used ONLY when no first-name column exists. */
const FULL_NAME_ALIASES = new Set(["name", "fullname"]);

function normalizeHeaderCell(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

interface ColumnMap {
  idx: Record<string, number>;
  fullNameIdx: number;
}

/**
 * Resolves which column serves each field: the first matching column wins per
 * field. When no first-name column exists, a bare "name"/"fullname" column is
 * remembered instead — its values split on whitespace (first token → first
 * name, rest → last name) in the row loop.
 */
function resolveColumns(headerCells: string[]): ColumnMap {
  const normalized = headerCells.map(normalizeHeaderCell);
  const idx: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    idx[field] = -1;
    for (let c = 0; c < normalized.length; c++) {
      if (aliases.includes(normalized[c])) {
        idx[field] = c;
        break;
      }
    }
  }
  let fullNameIdx = -1;
  if (idx.first_name === -1) {
    for (let c = 0; c < normalized.length; c++) {
      if (FULL_NAME_ALIASES.has(normalized[c])) {
        fullNameIdx = c;
        break;
      }
    }
  }
  return { idx, fullNameIdx };
}

/**
 * Number of distinct alias sets a candidate header line matches. PDF header
 * detection needs ≥2 so data rows (emails, phones, state codes) never qualify
 * as the header.
 */
function countAliasMatches(cells: string[]): number {
  const fields = new Set<string>();
  for (const cell of cells) {
    const n = normalizeHeaderCell(cell);
    if (!n) continue;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.includes(n)) {
        fields.add(field);
        break;
      }
    }
  }
  return fields.size;
}

/** "10+ digits" marks a line as table data (a phone) — email or digits without
 *  mistaking prose or dollar amounts for rows. */
function digitCount(s: string): number {
  return (s.match(/\d/g) || []).length;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width?: number;
}

interface PdfExtraction {
  lines: string[][]; // cells per visual line, reading order (page by page, top→bottom)
  pages: number;
  textChars: number;
}

/**
 * Extracts visual lines from a PDF as cell arrays with pdfjs-dist. pdf-parse v2
 * was tried first but its normalized text output collapses column gaps to single
 * spaces (verified: positioned columns 20–200pt apart all extract as " "), which
 * makes the 2+-separator row rule unsatisfiable for positioned tables — so
 * columns are recovered geometrically here instead: whitespace items carry the
 * gap width they span, and a gap wider than ~0.45× the font height (i.e. 2+
 * space widths, matching the "2+ space-runs/tabs" row rule) is a column break.
 */
async function extractPdfLines(buf: Buffer): Promise<PdfExtraction> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;

  const lines: string[][] = [];
  let textChars = 0;

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      // Group text items into visual lines by baseline y (2pt buckets absorb
      // sub-pixel jitter between items on the same line).
      const byLine = new Map<number, { str: string; x: number; endX: number; h: number }[]>();
      for (const item of content.items as unknown as PdfTextItem[]) {
        if (typeof item.str !== "string" || item.str.length === 0) continue;
        textChars += item.str.replace(/\s/g, "").length;
        const x = item.transform[4];
        const y = item.transform[5];
        const h = Math.abs(item.transform[3]) || 10;
        const bucket = Math.round(y / 2) * 2;
        let lineItems = byLine.get(bucket);
        if (!lineItems) {
          lineItems = [];
          byLine.set(bucket, lineItems);
        }
        lineItems.push({ str: item.str, x, endX: x + (item.width ?? 0), h });
      }

      // Top of page first: y grows upward in PDF space.
      for (const y of [...byLine.keys()].sort((a, b) => b - a)) {
        const items = byLine.get(y)!.sort((a, b) => a.x - b.x);
        const cells: string[] = [];
        let cell = "";
        let prevEnd: number | null = null;
        let breakPending = false;
        for (const it of items) {
          if (it.str.trim().length === 0) {
            // Whitespace item: the gap it spans is endX - x.
            if (it.endX - it.x > it.h * 0.45) breakPending = true;
            else if (cell.length > 0) cell += " ";
            continue;
          }
          const xGap = prevEnd !== null ? it.x - prevEnd : 0;
          if ((breakPending || xGap > it.h * 0.45) && cell.length > 0) {
            cells.push(cell.trim());
            cell = "";
          }
          breakPending = false;
          cell += it.str;
          prevEnd = it.endX;
        }
        if (cell.length > 0) cells.push(cell.trim());
        const line = cells.filter((c) => c.length > 0);
        if (line.length > 0) lines.push(line);
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return { lines, pages: doc.numPages, textChars };
}

export async function POST(request: NextRequest) {
  const summary = {
    total: 0,
    imported: 0,
    duplicates: 0,
    failed: 0,
    errors: [] as { row: number; reason: string }[],
  };

  let client: PoolClient | undefined;
  try {
    const formData = await request.formData();
    const entry = formData.get("file");

    if (entry === null || typeof entry === "string") {
      return NextResponse.json(
        { error: "Missing CSV file. Send it as multipart/form-data with field name 'file'." },
        { status: 400 }
      );
    }
    const file = entry as File;

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 5 MB size limit." },
        { status: 413 }
      );
    }

    // Decide the format by CONTENT, not by file name or MIME type — mobile
    // pickers and renames make extensions unreliable, and any reasonable
    // export should import. Zip magic (PK\x03\x04) → .xlsx path; %PDF- magic →
    // PDF table extraction; anything that decodes as text (UTF-8 / UTF-8 BOM /
    // UTF-16 BOM, comma, semicolon, tab, or pipe separated) goes through the
    // CSV pipeline; a truly binary file gets the plain-language re-save error
    // instead of a parser crash.
    let rows: string[][] = [];
    let noun = "CSV";
    let zipPath = false;
    let pdfPath = false;
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      zipPath = isZipMagic(buf);
      pdfPath = !zipPath && isPdfMagic(buf);
      if (zipPath) {
        noun = "Excel workbook";
        rows = await parseXlsxBuffer(buf);
      } else if (pdfPath) {
        noun = "PDF";
        const extraction = await extractPdfLines(buf);
        // Scanned or image-only PDFs: almost no extractable text per page, or
        // no line that looks like a table data row (contains an email or 10+
        // digits). Either way the pictures-of-tables message applies.
        if (extraction.textChars < 40 * extraction.pages) {
          return NextResponse.json({ error: SCANNED_PDF_MESSAGE }, { status: 422 });
        }
        const tableRows = extraction.lines.filter((cells) => cells.length >= 3); // 2+ separator runs
        const hasDataRow = tableRows.some((cells) =>
          cells.some((c) => EMAIL_RE.test(c) || digitCount(c) >= 10)
        );
        if (!hasDataRow) {
          return NextResponse.json({ error: SCANNED_PDF_MESSAGE }, { status: 422 });
        }
        // Header = first candidate line matching ≥2 alias sets; only lines
        // after it feed the pipeline as data rows.
        const headerAt = tableRows.findIndex((cells) => countAliasMatches(cells) >= 2);
        if (headerAt === -1) {
          return NextResponse.json(
            {
              error:
                "Couldn't find a header row with recognizable column names in this PDF. Include columns like First Name, Last Name, E-mail, or Full Name.",
            },
            { status: 400 }
          );
        }
        rows = [tableRows[headerAt], ...tableRows.slice(headerAt + 1)];
      } else {
        const text = decodeTextFile(buf);
        if (looksBinary(text)) {
          return NextResponse.json({ error: UNSUPPORTED_FILE_MESSAGE }, { status: 415 });
        }
        rows = parse(text, {
          delimiter: sniffDelimiter(text),
          skip_empty_lines: true,
          trim: true,
        }) as string[][];
      }
    } catch {
      return NextResponse.json(
        {
          error: zipPath
            ? "Could not parse the file as an Excel workbook (.xlsx). Re-save it as .xlsx or export to CSV."
            : pdfPath
              ? "Could not parse this PDF. If it's a scanned document, export the table as .xlsx or .csv and try again."
              : "Could not parse the file as CSV. Check quoting and delimiters.",
        },
        { status: 400 }
      );
    }

    if (rows.length < 2) {
      return NextResponse.json(
        { error: `${noun} must contain a header row and at least one data row.` },
        { status: 400 }
      );
    }
    if (rows.length - 1 > MAX_ROWS) {
      return NextResponse.json(
        { error: `${noun} exceeds the ${MAX_ROWS.toLocaleString()} row import limit.` },
        { status: 400 }
      );
    }

    // Column resolution is shared by every format: normalized header cells are
    // matched against alias sets (so "First Name" and "firstname" both work),
    // with the bare "name"/"fullname" fallback (values split on whitespace)
    // when no first-name column exists. Unknown columns are ignored silently.
    const { idx, fullNameIdx } = resolveColumns(rows[0]);

    if (idx.first_name === -1 && fullNameIdx === -1) {
      return NextResponse.json(
        {
          error: `${noun} header is missing name columns — include "First Name" and "Last Name" (or "Surname"), or a "Full Name" column.`,
        },
        { status: 400 }
      );
    }
    if (idx.first_name !== -1 && idx.last_name === -1 && fullNameIdx === -1) {
      return NextResponse.json(
        {
          error: `${noun} header is missing a last-name column — include "Last Name" or "Surname", or use a "Full Name" column.`,
        },
        { status: 400 }
      );
    }

    const dataRows = rows.slice(1);
    summary.total = dataRows.length;

    client = await pool.connect();
    await client.query("BEGIN");

    // Load existing identifiers for dedupe (email OR phone), inside the transaction.
    const existing = await client.query(`SELECT lower(email) AS email, phone FROM leads`);
    const existingEmails = new Set<string>();
    const existingPhones = new Set<string>();
    for (const r of existing.rows) {
      if (r.email) existingEmails.add(String(r.email).trim().toLowerCase());
      if (r.phone) existingPhones.add(normalizePhone(String(r.phone)));
    }
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    for (let i = 0; i < dataRows.length; i++) {
      const raw = dataRows[i];
      const csvLine = i + 2; // 1-based spreadsheet row (header is row 1)
      const get = (colIdx: number): string =>
        colIdx >= 0 && raw[colIdx] !== undefined ? String(raw[colIdx]).trim() : "";

      let firstName = get(idx.first_name);
      let lastName = get(idx.last_name);
      if (fullNameIdx !== -1) {
        // Bare "name"/"fullname" column: first whitespace token → first name,
        // the rest → last name.
        const tokens = get(fullNameIdx).split(/\s+/).filter(Boolean);
        firstName = tokens[0] ?? "";
        if (idx.last_name === -1) lastName = tokens.slice(1).join(" ");
      }

      const record: CsvRow = {
        first_name: firstName,
        last_name: lastName,
        email: get(idx.email),
        phone: get(idx.phone),
        state: get(idx.state),
        coverage_amount: get(idx.coverage_amount),
        notes: get(idx.notes),
      };

      // Skip fully empty rows (e.g. trailing commas) without counting them.
      if (!Object.values(record).some((v) => v && v.length > 0)) {
        summary.total--;
        continue;
      }

      const fail = (reason: string) => {
        summary.failed++;
        summary.errors.push({ row: csvLine, reason });
      };

      if (!record.first_name) { fail("missing first_name"); continue; }
      if (!record.last_name) { fail("missing last_name"); continue; }
      if (!record.email && !record.phone) { fail("requires email or phone"); continue; }

      const email = record.email ? record.email.toLowerCase() : "";
      const phone = record.phone ? normalizePhone(record.phone) : "";

      if (record.email && !EMAIL_RE.test(record.email)) {
        fail(`invalid email: ${record.email}`); continue;
      }
      if (record.phone && phone.length < 10) {
        fail("phone must contain at least 10 digits"); continue;
      }

      const state = (record.state || "").toUpperCase();
      if (!US_STATES.has(state)) {
        fail(`invalid state code: ${record.state || "(empty)"}`); continue;
      }

      let coverage: number | null = null;
      if (record.coverage_amount && record.coverage_amount.length > 0) {
        const n = Number(record.coverage_amount.replace(/[$,]/g, ""));
        if (!Number.isFinite(n) || n <= 0) {
          fail(`invalid coverage_amount: ${record.coverage_amount}`); continue;
        }
        coverage = n;
      }

      // Dedupe by email OR phone against existing leads and rows in this batch.
      if (email && (existingEmails.has(email) || seenEmails.has(email))) {
        summary.duplicates++;
        summary.errors.push({ row: csvLine, reason: `duplicate: email ${email} already exists` });
        continue;
      }
      if (phone && (existingPhones.has(phone) || seenPhones.has(phone))) {
        summary.duplicates++;
        summary.errors.push({ row: csvLine, reason: "duplicate: phone already exists" });
        continue;
      }

      seenEmails.add(email);
      seenPhones.add(phone);

      const healthNotes = record.notes
        ? { notes: record.notes.slice(0, 2000) }
        : {};

      await client.query(
        `INSERT INTO leads (first_name, last_name, email, phone, state, status, source, coverage_amount_requested, health_notes, enrichment_data)
         VALUES ($1, $2, $3, $4, $5, 'new', 'csv_import', $6, $7, $8)`,
        [
          record.first_name.slice(0, 50),
          record.last_name.slice(0, 50),
          email.slice(0, 255),
          phone.slice(0, 20),
          state,
          coverage,
          JSON.stringify(healthNotes),
          JSON.stringify({ source: "csv_import" }),
        ]
      );
      summary.imported++;
    }

    await client.query("COMMIT");
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    console.error("POST /api/leads/import error:", err);
    if (client) await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json(
      { error: "Internal server error while importing leads." },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
