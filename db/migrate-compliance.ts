/**
 * Compliance, Security & Audit Vault migration.
 *
 * Adds the TCPA/HIPAA compliance schema (audit log, consent records, DNC list)
 * plus a nullable `raw_content` column on `conversation_messages` so the PII
 * scrubber can store the original (unscrubbed) message alongside the scrubbed
 * version.
 *
 * Idempotent: safe to run repeatedly (IF NOT EXISTS / DO $$ ... EXCEPTION).
 */
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const DDL = `
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- sha256 digest for audit-chain hashing

-- ── TCPA / HIPAA compliance audit log (blockchain-style immutable chain) ────
CREATE TABLE IF NOT EXISTS compliance_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- 'consent_granted', 'consent_revoked', 'opt_out', 'dnc_request', 'call_initiated', 'call_completed', 'form_submitted', 'disclosure_played'
    event_data JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    cryptographic_hash TEXT NOT NULL, -- SHA-256 hash of the event payload for immutability
    previous_hash TEXT, -- links to previous audit entry (blockchain-style chain)
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── Consent records (exact text + frozen form snapshot) ─────────────────────
CREATE TABLE IF NOT EXISTS compliance_consent_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    consent_type VARCHAR(50) NOT NULL, -- 'tcpa_voice', 'tcpa_sms', 'tcpa_email', 'hipaa_authorization'
    consent_status VARCHAR(20) NOT NULL DEFAULT 'granted', -- 'granted', 'revoked', 'expired'
    consent_text TEXT NOT NULL, -- the exact text the lead agreed to
    form_snapshot JSONB DEFAULT '{}'::jsonb, -- frozen snapshot of the form state at consent time
    ip_address INET,
    user_agent TEXT,
    granted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
);

-- ── Do-Not-Call / Do-Not-Contact list ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_dnc_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    dnc_type VARCHAR(20) NOT NULL DEFAULT 'phone', -- 'phone', 'email', 'both'
    source VARCHAR(50), -- 'lead_request', 'manual_add', 'carrier_list'
    added_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ── Immutability: auto-chain + SHA-256 hash on every audit insert ───────────
-- A BEFORE INSERT trigger computes the row's SHA-256 over the event payload and
-- links it to the previous entry's hash, so any tampering breaks the chain.
CREATE OR REPLACE FUNCTION compliance_compute_audit_hash() RETURNS trigger AS $$
DECLARE
    last_hash TEXT;
BEGIN
    SELECT cryptographic_hash INTO last_hash
      FROM compliance_audit_log
     ORDER BY created_at DESC, id DESC
     LIMIT 1;
    NEW.previous_hash := last_hash;
    NEW.cryptographic_hash := encode(
        digest(
            COALESCE(NEW.previous_hash, '')
            || '|' || COALESCE(NEW.lead_id::text, '')
            || '|' || NEW.event_type
            || '|' || COALESCE(NEW.event_data::text, '{}')
            || '|' || COALESCE(NEW.ip_address::text, '')
            || '|' || COALESCE(NEW.user_agent, '')
            || '|' || COALESCE(NEW.created_at::text, ''),
            'sha256'
        ),
        'hex'
    );
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compliance_audit_hash ON compliance_audit_log;
CREATE TRIGGER trg_compliance_audit_hash
    BEFORE INSERT ON compliance_audit_log
    FOR EACH ROW EXECUTE FUNCTION compliance_compute_audit_hash();

-- ── PII scrubber support: keep the original (raw) message content ───────────
ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS raw_content TEXT;
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running compliance migration...");
  try {
    await pool.query(DDL);
    console.log("Compliance migration completed successfully.");
  } catch (err) {
    console.error("Compliance migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
