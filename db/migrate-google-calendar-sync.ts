import { Pool } from "pg";

/**
 * Migration: Google Calendar sync state for the OWNER's private bookings.
 *
 * Adds `google_event_id` / `google_sync_status` to `bookings` plus a tiny
 * `owner_secrets` key/value table holding the owner's Google OAuth refresh
 * token server-side (never in client code or the repo). Owner-only:
 * bookings are always owner_only=TRUE, and the sync touches only the
 * owner's primary calendar — never partner/tenant data.
 *
 * Sync status values: 'not_synced' | 'synced' | 'skipped_no_config' |
 * 'skipped_no_auth' | 'error'. Idempotent — safe to run repeatedly.
 */
const DDL = `
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS google_event_id TEXT,
    ADD COLUMN IF NOT EXISTS google_sync_status TEXT NOT NULL DEFAULT 'not_synced';

CREATE TABLE IF NOT EXISTS owner_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
`;

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running google-calendar-sync migration...");
  try {
    await pool.query(DDL);
    console.log("google-calendar-sync migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
