import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Idempotent hardening of the warm-handoff workflow:
//  - priority (text, normal/high/urgent) so reps see which warm lead to work first
//  - decline_reason + declined_at so a declined handoff is preserved with a reason
//  - SLA targets are working hints for reps, NOT guaranteed real-time responses.
// Uses ADD COLUMN IF NOT EXISTS so repeated runs are safe.
const DDL = `
-- Priority: an urgency cue (owner-set at queue time) so reps know which warm
-- lead deserves attention first. Default 'normal'.
ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'high', 'urgent'));

-- Decline capture: when a rep declines a handoff we keep the stated reason and
-- timestamp so the owner can see (and manually re-route) what was declined.
ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS decline_reason TEXT;
ALTER TABLE handoffs ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;

-- Reps often need to know a handoff's priority when scanning a list.
CREATE INDEX IF NOT EXISTS idx_handoffs_status_priority ON handoffs (status, priority, created_at DESC);
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running handoff-hardening migration...");
  try {
    await pool.query(DDL);
    console.log("handoff-hardening migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
