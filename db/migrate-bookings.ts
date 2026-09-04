import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Idempotent — safe to run repeatedly (CREATE TABLE IF NOT EXISTS /
// ADD COLUMN IF NOT EXISTS). This migration powers the owner's PRIVATE
// pipeline (Mode-1 "owner private seat"): lightweight booking requests land
// in the `bookings` table, and consumer inquiries are tagged on `leads` with
// owner_only=TRUE so they are queryable as the owner's pipeline and never
// commingled with partner/tenant demo data.
const DDL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Lightweight booking requests. This is INTAKE ONLY — a request for a call,
-- NOT an auto-confirmed calendar slot (there is no calendar integration).
-- status is a CHECK constraint (not an enum) so the set is easy to extend.
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    topic TEXT NOT NULL DEFAULT 'general',
    requested_time TEXT,
    status TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'confirmed', 'cancelled')),
    owner_only BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_owner_status
    ON bookings (owner_only, status, created_at DESC);

-- Owner-only marker on leads: consumer inquiries (source='consumer_inquiry')
-- and any other owner-pipeline leads are tagged owner_only=TRUE so partner
-- tenant views can always exclude them by filtering owner_only = FALSE.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_only BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_leads_owner_pipeline
    ON leads (owner_only, created_at DESC);
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running bookings + owner-pipeline migration...");
  try {
    await pool.query(DDL);
    console.log("bookings + owner-pipeline migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();