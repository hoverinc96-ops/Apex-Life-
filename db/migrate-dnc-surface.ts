/**
 * Do-not-contact surface migration (compliance item E1 / traffic pack §6.6).
 *
 * The compliance vault already had `compliance_dnc_list` (write paths in
 * src/lib/compliance.ts). What was missing was the owner-facing surface: an
 * action that records an opt-out from inside the dashboard, and a screen that
 * shows the list. This migration adds only what the surface needs:
 *
 *   - `compliance_dnc_list.channel` — how the "stop" reached us
 *     (email | phone | comment | other). `dnc_type` remains the suppression
 *     scope (phone | email | both); `channel` is the human-reported channel.
 *   - `compliance_dnc_list.note`    — optional free-text "what they said".
 *   - `leads.do_not_contact`        — the lead-level mark that suppresses
 *     contact affordances in the dashboard.
 *
 * Idempotent: safe to run repeatedly (ADD COLUMN IF NOT EXISTS + a backfill
 * that only flips leads to TRUE).
 *
 * NOTE: existing opt-outs (recorded before this migration) are backfilled so
 * the lead-level mark is correct from day one.
 */
import { Pool } from "pg";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const DDL = `
ALTER TABLE compliance_dnc_list ADD COLUMN IF NOT EXISTS channel VARCHAR(20);
ALTER TABLE compliance_dnc_list ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: any lead that already has a do-not-contact entry is marked.
UPDATE leads
   SET do_not_contact = TRUE
 WHERE do_not_contact = FALSE
   AND id IN (SELECT lead_id FROM compliance_dnc_list WHERE lead_id IS NOT NULL);

-- Backfill the channel on older rows from the stored suppression scope, so the
-- list surface never shows a blank channel.
UPDATE compliance_dnc_list
   SET channel = CASE dnc_type
                   WHEN 'email' THEN 'email'
                   WHEN 'phone' THEN 'phone'
                   ELSE 'other'
                 END
 WHERE channel IS NULL;

CREATE INDEX IF NOT EXISTS idx_dnc_lead_id ON compliance_dnc_list (lead_id);
CREATE INDEX IF NOT EXISTS idx_dnc_added_at ON compliance_dnc_list (added_at DESC);
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running do-not-contact surface migration...");
  try {
    await pool.query(DDL);
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM compliance_dnc_list) AS dnc_entries,
         (SELECT COUNT(*) FROM leads WHERE do_not_contact) AS marked_leads`
    );
    console.log(
      `Do-not-contact surface migration complete: ${rows[0].dnc_entries} DNC entries, ${rows[0].marked_leads} lead(s) marked do-not-contact.`
    );
  } catch (err) {
    console.error("Do-not-contact surface migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
