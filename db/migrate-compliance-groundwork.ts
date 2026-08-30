/**
 * Compliance Groundwork migration (Stage 0 — write-path enablement).
 *
 * Extends the existing compliance vault schema so the runtime write paths in
 * src/lib/compliance.ts can persist a full, audit-ready consent + opt-out trail
 * (see lead-sourcing-compliance.md §1.4 / §5 controls C2/C4/C7).
 *
 * This migration is idempotent and NON-DESTRUCTIVE — it only ADDs columns or
 * relaxes a NOT NULL constraint; it never drops or alters existing data:
 *
 *   1. compliance_consent_records: add `consent_text_version`, `funnel_id`,
 *      `campaign_id` so each consent row can be traced to the exact consent
 *      text version and the funnel/campaign that captured it (§1.4 attribution
 *      for the success fee; §5 C7 audit trail). funnel/campaign also carried
 *      in `form_snapshot` — these top-level columns make it queryable.
 *
 *   2. compliance_dnc_list: relax `phone NOT NULL` so an email-only opt-out
 *      (email unsubscribe, §5 C8) can be recorded without fabricating a phone
 *      number. DNC suppression is cross-channel (§5 C4); a row must not require
 *      a phone just because the person only gave an email.
 */
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const DDL = `
-- Consent records: trace each consent to its exact text version + funnel/campaign
ALTER TABLE compliance_consent_records
    ADD COLUMN IF NOT EXISTS consent_text_version TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE compliance_consent_records
    ADD COLUMN IF NOT EXISTS funnel_id TEXT;
ALTER TABLE compliance_consent_records
    ADD COLUMN IF NOT EXISTS campaign_id TEXT;

-- DNC list: allow email-only opt-outs (phone no longer mandatory)
ALTER TABLE compliance_dnc_list
    ALTER COLUMN phone DROP NOT NULL;
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running compliance-groundwork migration...");
  try {
    await pool.query(DDL);
    console.log("Compliance-groundwork migration completed successfully.");
  } catch (err) {
    console.error("Compliance-groundwork migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
