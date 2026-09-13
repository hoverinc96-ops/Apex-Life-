import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Consumer-inquiry qualifier columns for the owner's private pipeline.
 *
 * The consumer inquiry flow (spec 02 §2 persistence matrix) captures an age
 * range (Q1, e.g. "30-39") and a term length (Q3, e.g. 20). Those two have no
 * column on `leads` yet. Everything else the flow sends already exists:
 *   - tobacco_user BOOLEAN            (base migration)
 *   - coverage_amount_requested NUMERIC (base migration)
 *   - health_notes JSONB              (base migration — health_status,
 *     monthly_budget, coverage_preference, policy_preference merge here)
 *
 * Idempotent — safe to run repeatedly (ADD COLUMN IF NOT EXISTS). Run via
 * `bun run db:migrate-consumer-inquiry` (see package.json scripts).
 */
const DDL = `
-- Q1 age range: compact VARCHAR(10) ("20-29" … "70+"). Surfaces cleanly in the
-- lead panel; a full DOB is not collected by this flow (no underwriting here).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS age_range VARCHAR(10);

-- Q3 term length in years (10/15/20/30); NULL for whole life / "not sure".
ALTER TABLE leads ADD COLUMN IF NOT EXISTS term_years INT;
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running consumer-inquiry qualifier migration...");
  try {
    await pool.query(DDL);
    console.log("consumer-inquiry qualifier migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();