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
    // export should import. Zip magic (PK\x03\x04) → .xlsx path; anything that
    // decodes as text (UTF-8 / UTF-8 BOM / UTF-16 BOM, comma, semicolon, tab,
    // or pipe separated) goes through the CSV pipeline; a truly binary file
    // gets the plain-language re-save error instead of a parser crash.
    let rows: string[][] = [];
    let noun = "CSV";
    let zipPath = false;
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      zipPath = isZipMagic(buf);
      if (zipPath) {
        noun = "Excel workbook";
        rows = await parseXlsxBuffer(buf);
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

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const findCol = (...names: string[]) => {
      for (const n of names) {
        const idx = header.indexOf(n);
        if (idx !== -1) return idx;
      }
      return -1;
    };
    const idxFirstName = col("first_name");
    const idxLastName = col("last_name");
    const idxEmail = findCol("email", "email_address");
    const idxPhone = findCol("phone", "phone_number", "mobile", "cell");
    const idxState = col("state");
    const idxCoverage = findCol("coverage_amount", "coverage", "coverage_amount_requested");
    const idxNotes = findCol("notes", "note", "comments", "health_notes");

    if (idxFirstName === -1 || idxLastName === -1) {
      return NextResponse.json(
        { error: `${noun} header is missing required columns 'first_name' and 'last_name'.` },
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
      const get = (idx: number): string =>
        idx >= 0 && raw[idx] !== undefined ? String(raw[idx]).trim() : "";

      const record: CsvRow = {
        first_name: get(idxFirstName),
        last_name: get(idxLastName),
        email: get(idxEmail),
        phone: get(idxPhone),
        state: get(idxState),
        coverage_amount: get(idxCoverage),
        notes: get(idxNotes),
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
