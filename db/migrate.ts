import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const DDL = `
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM ('new', 'enriching', 'qualified', 'unqualified', 'nurture', 'proposal_sent', 'in_negotiation', 'pending_live_handoff', 'closed_won', 'closed_lost');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE channel_type AS ENUM ('voice', 'sms', 'email', 'web_chat');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE conversation_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('draft', 'presented', 'accepted', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE policy_type AS ENUM ('term', 'whole_life', 'universal_life', 'variable_universal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE handoff_reason AS ENUM ('customer_requested', 'high_value_lead', 'underwriting_flag', 'objection_threshold_exceeded', 'manual_takeover');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tables
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(100),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(20),
    state VARCHAR(2) NOT NULL,
    zip_code VARCHAR(10),
    status lead_status DEFAULT 'new',
    qualification_score INT CHECK (qualification_score BETWEEN 0 AND 100),
    tobacco_user BOOLEAN DEFAULT FALSE,
    annual_income NUMERIC(12, 2),
    coverage_amount_requested NUMERIC(12, 2),
    health_notes JSONB DEFAULT '{}'::jsonb,
    tcpa_consent BOOLEAN DEFAULT FALSE,
    tcpa_consent_date TIMESTAMPTZ,
    enrichment_data JSONB DEFAULT '{}'::jsonb,
    assigned_rep_id UUID,
    source VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    channel channel_type NOT NULL,
    direction conversation_direction NOT NULL,
    provider_call_id VARCHAR(100),
    summary TEXT,
    sentiment_score NUMERIC(3, 2),
    key_objections TEXT[],
    ai_agent_id VARCHAR(50),
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    recording_url TEXT,
    latency_ms INT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    carrier_name VARCHAR(100) NOT NULL,
    policy_type policy_type NOT NULL,
    term_length_years INT,
    coverage_amount NUMERIC(12, 2) NOT NULL,
    monthly_premium NUMERIC(10, 2) NOT NULL,
    annual_premium NUMERIC(10, 2) NOT NULL,
    status quote_status DEFAULT 'draft',
    proposal_pdf_url TEXT,
    quote_payload JSONB DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    from_status lead_status,
    to_status lead_status NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_status_history_lead ON status_history (lead_id, changed_at);

CREATE TABLE IF NOT EXISTS agent_handoffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    reason handoff_reason NOT NULL,
    assigned_rep_id UUID NOT NULL,
    briefing_summary TEXT NOT NULL,
    lead_intent_level VARCHAR(20),
    recommended_policy_id UUID REFERENCES quotes(id),
    is_resolved BOOLEAN DEFAULT FALSE,
    transferred_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ
);
`;

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  console.log("Running migration...");

  try {
    await pool.query(DDL);
    console.log("Migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
