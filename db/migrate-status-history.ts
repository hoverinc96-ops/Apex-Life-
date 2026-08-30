import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Idempotent — safe to run repeatedly (CREATE TABLE IF NOT EXISTS / DO blocks).
const DDL = `
DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM ('new', 'enriching', 'qualified', 'unqualified', 'nurture', 'proposal_sent', 'in_negotiation', 'pending_live_handoff', 'closed_won', 'closed_lost');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    from_status lead_status,
    to_status lead_status NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    changed_by TEXT
);

-- Idempotent: add the actor column on an already-existing table.
ALTER TABLE status_history ADD COLUMN IF NOT EXISTS changed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_status_history_lead ON status_history (lead_id, changed_at);
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running status_history migration...");
  try {
    await pool.query(DDL);
    console.log("status_history migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
