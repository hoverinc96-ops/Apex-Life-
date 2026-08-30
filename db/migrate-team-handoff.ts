import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Idempotent — safe to run repeatedly (CREATE TABLE IF NOT EXISTS / ON CONFLICT).
const DDL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Team: an agency owner plus sales reps. role is a CHECK constraint (not an
-- enum) so the set is easy to extend without a migration if we add roles later.
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'rep')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Warm-lead-transfer handoffs. This is a CONTEXT transfer, not a phone call:
-- an AI-qualified lead (and its context bundle) is handed to a rep who owns
-- the lead in the CRM. There is no real call routing in this model.
CREATE TABLE IF NOT EXISTS handoffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    rep_id UUID NOT NULL REFERENCES team_members(id),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'claimed', 'completed', 'declined')),
    context JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_handoffs_rep_status ON handoffs (rep_id, status);
CREATE INDEX IF NOT EXISTS idx_handoffs_lead ON handoffs (lead_id);

-- Seed default members: one owner and one demo rep. Idempotent (ON CONFLICT).
INSERT INTO team_members (name, email, role) VALUES
    ('Alex Morgan', 'owner@apexlifeai.app', 'owner'),
    ('Demo Rep', 'rep@apexlifeai.app', 'rep')
ON CONFLICT (email) DO NOTHING;
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running team + handoff migration...");
  try {
    await pool.query(DDL);
    console.log("team + handoff migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
