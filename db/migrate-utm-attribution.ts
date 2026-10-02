import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * E4 — UTM / ad-click attribution columns for the leads table.
 *
 * Captured on /get-quote entry (see src/lib/attribution.ts) and persisted on
 * the consumer-inquiry insert. All columns are nullable: ABSENT params store
 * NULL — we never invent attribution values or default to a fabricated
 * source. Existing leads keep NULL everywhere (they pre-date capture) and
 * surface as "Direct — no attribution data" in the dashboard.
 *
 * Idempotent — safe to run repeatedly (ADD COLUMN IF NOT EXISTS). Run via
 * `bun run db:migrate-utm-attribution` (see package.json scripts).
 */
const DDL = `
-- UTM params, stored verbatim as they arrived in the URL.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term TEXT;

-- Ad click-IDs (Meta / Google / Microsoft). One click-ID type per lead is
-- typical, but a landing can carry more than one — each gets its own column.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fbclid TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gclid TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS msclkid TEXT;
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running UTM-attribution migration...");
  try {
    await pool.query(DDL);
    console.log("utm-attribution migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
