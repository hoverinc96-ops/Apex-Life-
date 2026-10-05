import { Pool } from "pg";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Idempotent — safe to run repeatedly (CREATE TABLE IF NOT EXISTS / DO blocks).
//
// E2 (traffic-starter-pack.md §6.6): transactional acknowledgment email to
// /get-quote submitters. Every attempt outcome — sent, failed, suppressed, or
// skipped — is recorded here exactly once per lead, so the lead detail panel's
// timeline can show "acknowledgment email sent/failed/…" per lead and the
// owner can see which submitters received the (owner-ratified) email follow-up.
//
// The table intentionally holds NO consumer-facing copy — the acknowledgment
// text lives with compliance (frozen). status is a free TEXT field so new
// outcomes can be added without a migration.
const DDL = `
CREATE TABLE IF NOT EXISTS email_ack_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    status TEXT NOT NULL,          -- 'sent' | 'failed' | 'suppressed' | 'skipped'
    from_address TEXT,             -- the From line used (or that would have been used)
    provider_id TEXT,              -- Resend email id on success
    reason TEXT,                   -- machine reason code (no_ak_key, no_approved_copy, dnc, ...)
    detail TEXT,                   -- human-readable detail for the dashboard timeline
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_ack_lead ON email_ack_log (lead_id, created_at);
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running email_ack_log migration...");
  try {
    await pool.query(DDL);
    console.log("email_ack_log migration completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("email_ack_log migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
