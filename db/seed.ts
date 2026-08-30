import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  console.log("Seeding database...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── Leads ────────────────────────────────────────────────────────────────
    const leads = [
      // 3 in 'new'
      {
        first_name: "Michael",
        last_name: "Torres",
        email: "mtorres@email.com",
        phone: "(214) 555-0132",
        date_of_birth: "1992-03-15",
        gender: "male",
        state: "TX",
        zip_code: "75001",
        status: "new",
        qualification_score: null,
        tobacco_user: false,
        annual_income: 85000,
        coverage_amount_requested: 500000,
        health_notes: {},
        tcpa_consent: true,
        tcpa_consent_date: "2026-07-28",
        enrichment_data: { source: "web_form", utm_campaign: "fb_ads_2026" },
      },
      {
        first_name: "Jennifer",
        last_name: "Park",
        email: "jpark@email.com",
        phone: "(310) 555-0145",
        date_of_birth: "1985-11-02",
        gender: "female",
        state: "CA",
        zip_code: "90012",
        status: "new",
        qualification_score: null,
        tobacco_user: false,
        annual_income: 125000,
        coverage_amount_requested: 750000,
        health_notes: {},
        tcpa_consent: true,
        tcpa_consent_date: "2026-07-29",
        enrichment_data: { source: "google_ads", keyword: "term life insurance" },
      },
      {
        first_name: "Robert",
        last_name: "Kim",
        email: "rkim@email.com",
        phone: "(404) 555-0187",
        date_of_birth: "1978-07-22",
        gender: "male",
        state: "GA",
        zip_code: "30303",
        status: "new",
        qualification_score: null,
        tobacco_user: true,
        annual_income: 65000,
        coverage_amount_requested: 300000,
        health_notes: {},
        tcpa_consent: true,
        tcpa_consent_date: "2026-07-30",
        enrichment_data: { source: "web_form", utm_campaign: "email_nurture_q3" },
      },

      // 2 in 'qualified'
      {
        first_name: "Amanda",
        last_name: "Richardson",
        email: "arichardson@email.com",
        phone: "(615) 555-0211",
        date_of_birth: "1989-06-10",
        gender: "female",
        state: "TN",
        zip_code: "37201",
        status: "qualified",
        qualification_score: 78,
        tobacco_user: false,
        annual_income: 110000,
        coverage_amount_requested: 1000000,
        health_notes: { conditions: [], medications: [], last_checkup: "2026-01" },
        tcpa_consent: true,
        tcpa_consent_date: "2026-07-25",
        enrichment_data: { source: "partner_referral", partner: "health_compare" },
      },
      {
        first_name: "David",
        last_name: "Nguyen",
        email: "dnguyen@email.com",
        phone: "(832) 555-0433",
        date_of_birth: "1994-09-28",
        gender: "male",
        state: "TX",
        zip_code: "77002",
        status: "qualified",
        qualification_score: 85,
        tobacco_user: false,
        annual_income: 95000,
        coverage_amount_requested: 500000,
        health_notes: { conditions: [], medications: [], last_checkup: "2026-03" },
        tcpa_consent: true,
        tcpa_consent_date: "2026-07-26",
        enrichment_data: { source: "web_form", utm_campaign: "linkedin_ads" },
      },

      // 2 in 'proposal_sent'
      {
        first_name: "Sarah",
        last_name: "Mitchell",
        email: "smitchell@email.com",
        phone: "(602) 555-0677",
        date_of_birth: "1982-04-03",
        gender: "female",
        state: "AZ",
        zip_code: "85001",
        status: "proposal_sent",
        qualification_score: 72,
        tobacco_user: false,
        annual_income: 140000,
        coverage_amount_requested: 750000,
        health_notes: { conditions: ["mild hypertension"], medications: ["lisinopril"], last_checkup: "2026-02" },
        tcpa_consent: true,
        tcpa_consent_date: "2026-07-20",
        enrichment_data: { source: "google_ads", keyword: "best life insurance 2026" },
      },
      {
        first_name: "James",
        last_name: "O'Brien",
        email: "jobrien@email.com",
        phone: "(312) 555-0891",
        date_of_birth: "1975-12-18",
        gender: "male",
        state: "IL",
        zip_code: "60601",
        status: "proposal_sent",
        qualification_score: 68,
        tobacco_user: false,
        annual_income: 180000,
        coverage_amount_requested: 1000000,
        health_notes: { conditions: [], medications: [], last_checkup: "2025-11" },
        tcpa_consent: true,
        tcpa_consent_date: "2026-07-18",
        enrichment_data: { source: "web_form", utm_campaign: "email_nurture_q3" },
      },

      // 2 in 'in_negotiation'
      {
        first_name: "Lisa",
        last_name: "Patel",
        email: "lpatel@email.com",
        phone: "(408) 555-0344",
        date_of_birth: "1990-08-07",
        gender: "female",
        state: "CA",
        zip_code: "95113",
        status: "in_negotiation",
        qualification_score: 88,
        tobacco_user: false,
        annual_income: 155000,
        coverage_amount_requested: 750000,
        health_notes: { conditions: [], medications: [], last_checkup: "2026-05" },
        tcpa_consent: true,
        tcpa_consent_date: "2026-07-10",
        enrichment_data: { source: "partner_referral", partner: "credit_karma" },
      },
      {
        first_name: "Thomas",
        last_name: "Washington",
        email: "twashington@email.com",
        phone: "(704) 555-0765",
        date_of_birth: "1980-02-14",
        gender: "male",
        state: "NC",
        zip_code: "28202",
        status: "in_negotiation",
        qualification_score: 91,
        tobacco_user: true,
        annual_income: 45000,
        coverage_amount_requested: 250000,
        health_notes: { conditions: ["type 2 diabetes"], medications: ["metformin"], last_checkup: "2026-04" },
        tcpa_consent: true,
        tcpa_consent_date: "2026-07-08",
        enrichment_data: { source: "web_form", utm_campaign: "fb_ads_2026" },
      },

      // 1 in 'pending_live_handoff'
      {
        first_name: "Maria",
        last_name: "Garcia",
        email: "mgarcia@email.com",
        phone: "(305) 555-0522",
        date_of_birth: "1968-05-30",
        gender: "female",
        state: "FL",
        zip_code: "33101",
        status: "pending_live_handoff",
        qualification_score: 55,
        tobacco_user: false,
        annual_income: 72000,
        coverage_amount_requested: 400000,
        health_notes: { conditions: ["high cholesterol", "mild asthma"], medications: ["atorvastatin", "albuterol"], last_checkup: "2026-03" },
        tcpa_consent: true,
        tcpa_consent_date: "2026-07-05",
        enrichment_data: { source: "direct_mail", campaign: "retirement_planning_q2" },
      },

      // 2 in 'closed_won'
      {
        first_name: "Christopher",
        last_name: "Lee",
        email: "clee@email.com",
        phone: "(212) 555-0988",
        date_of_birth: "1987-01-25",
        gender: "male",
        state: "NY",
        zip_code: "10001",
        status: "closed_won",
        qualification_score: 94,
        tobacco_user: false,
        annual_income: 165000,
        coverage_amount_requested: 1000000,
        health_notes: { conditions: [], medications: [], last_checkup: "2026-06" },
        tcpa_consent: true,
        tcpa_consent_date: "2026-06-15",
        enrichment_data: { source: "web_form", utm_campaign: "fb_ads_2026" },
      },
      {
        first_name: "Patricia",
        last_name: "Johnson",
        email: "pjohnson@email.com",
        phone: "(702) 555-0411",
        date_of_birth: "1972-10-08",
        gender: "female",
        state: "NV",
        zip_code: "89101",
        status: "closed_won",
        qualification_score: 82,
        tobacco_user: false,
        annual_income: 130000,
        coverage_amount_requested: 500000,
        health_notes: { conditions: [], medications: [], last_checkup: "2026-04" },
        tcpa_consent: true,
        tcpa_consent_date: "2026-06-20",
        enrichment_data: { source: "google_ads", keyword: "whole life insurance quotes" },
      },
    ];

    const leadIds: Record<number, string> = {};

    for (let i = 0; i < leads.length; i++) {
      const l = leads[i];
      const result = await client.query(
        `INSERT INTO leads (first_name, last_name, email, phone, date_of_birth, gender, state, zip_code, status, qualification_score, tobacco_user, annual_income, coverage_amount_requested, health_notes, tcpa_consent, tcpa_consent_date, enrichment_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [
          l.first_name, l.last_name, l.email, l.phone, l.date_of_birth, l.gender,
          l.state, l.zip_code, l.status, l.qualification_score, l.tobacco_user,
          l.annual_income, l.coverage_amount_requested,
          JSON.stringify(l.health_notes), l.tcpa_consent, l.tcpa_consent_date,
          JSON.stringify(l.enrichment_data),
        ]
      );
      leadIds[i] = result.rows[0].id;
    }

    console.log(`Inserted ${leads.length} leads.`);

    // ── Quotes for closed_won leads (indices 10 & 11) ───────────────────────
    // Christopher Lee (index 10)
    await client.query(
      `INSERT INTO quotes (lead_id, carrier_name, policy_type, term_length_years, coverage_amount, monthly_premium, annual_premium, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [leadIds[10], "Banner Life", "term", 20, 1000000, 42.50, 510.00, "accepted", "2026-08-15"]
    );
    await client.query(
      `INSERT INTO quotes (lead_id, carrier_name, policy_type, coverage_amount, monthly_premium, annual_premium, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [leadIds[10], "Prudential", "whole_life", 500000, 385.00, 4620.00, "presented", "2026-08-20"]
    );

    // Patricia Johnson (index 11)
    await client.query(
      `INSERT INTO quotes (lead_id, carrier_name, policy_type, term_length_years, coverage_amount, monthly_premium, annual_premium, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [leadIds[11], "AIG", "term", 30, 500000, 65.75, 789.00, "accepted", "2026-08-10"]
    );

    console.log("Inserted quotes for closed_won leads.");

    // ── Conversations for 'in_negotiation' leads (indices 8 & 9) ────────────
    // Lisa Patel (index 8)
    const conv1 = await client.query(
      `INSERT INTO conversations (lead_id, channel, direction, summary, sentiment_score, key_objections, ai_agent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        leadIds[8], "voice", "outbound",
        "Lisa is interested in a 20-year term policy. Discussed health history — no major issues. She is comparing rates with two other carriers.",
        0.72,
        ["price_comparison", "wants_to_think_about_it"],
        "agent-alex-v2",
      ]
    );
    const conv1Id = conv1.rows[0].id;

    // Messages for Lisa's conversation
    const msgs1 = [
      { role: "ai", content: "Hello, is this Lisa? This is Alex from Apex Life AI. I'm following up on your request for a life insurance quote. Do you have a few minutes?", latency: 120 },
      { role: "lead", content: "Yes, this is Lisa. I have about 10 minutes. What do you need from me?", latency: 850 },
      { role: "ai", content: "Great, thank you! Just a quick overview — I have your basic info from the form you filled out. You're looking for $750,000 in coverage, is that right? And you're located in California?", latency: 105 },
      { role: "lead", content: "Yes, that's correct. I want to make sure my family is protected. I've been looking at a few options online.", latency: 1100 },
      { role: "ai", content: "That's a smart move, Lisa. Let me run a few carrier quotes for you. Based on your profile — 35, non-smoker, good health — I'm seeing competitive rates. I'll send you a proposal with a few options to review. When would be a good time to follow up?", latency: 98 },
    ];
    for (const m of msgs1) {
      await client.query(
        `INSERT INTO conversation_messages (conversation_id, sender_role, content, latency_ms)
         VALUES ($1, $2, $3, $4)`,
        [conv1Id, m.role, m.content, m.latency]
      );
    }

    // Thomas Washington (index 9)
    const conv2 = await client.query(
      `INSERT INTO conversations (lead_id, channel, direction, summary, sentiment_score, key_objections, ai_agent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        leadIds[9], "sms", "outbound",
        "Thomas has type 2 diabetes and is a tobacco user. He needs $250K coverage. Rates are higher due to health classification. He's hesitant about the premium cost.",
        0.45,
        ["too_expensive", "health_concerns", "needs_spouse_input"],
        "agent-alex-v2",
      ]
    );
    const conv2Id = conv2.rows[0].id;

    // Messages for Thomas's conversation
    const msgs2 = [
      { role: "ai", content: "Hi Thomas! This is Alex with Apex Life AI. I'm reaching out about your life insurance inquiry. Is now a good time to chat via text?", latency: 80 },
      { role: "lead", content: "Yeah I can text. What carriers do you work with?", latency: 3500 },
      { role: "ai", content: "We work with over 20 top-rated carriers including Banner, AIG, and Prudential. I see you requested $250K in coverage — is that still accurate? Also, I want to make sure we get you the best rate — do you currently use any tobacco products?", latency: 95 },
      { role: "lead", content: "Yes, $250K. And yeah I smoke about half a pack a day. Also I take metformin for diabetes. Will that affect my rates?", latency: 2800 },
      { role: "ai", content: "I appreciate your honesty, Thomas. Being upfront helps us find you the best policy. Tobacco use and diabetes will affect the premium, but we have carriers that specialize in these situations. Let me put together a quote and I'll have something for you shortly.", latency: 88 },
    ];
    for (const m of msgs2) {
      await client.query(
        `INSERT INTO conversation_messages (conversation_id, sender_role, content, latency_ms)
         VALUES ($1, $2, $3, $4)`,
        [conv2Id, m.role, m.content, m.latency]
      );
    }

    console.log("Inserted conversations and messages for in_negotiation leads.");

    await client.query("COMMIT");
    console.log("Seed completed successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
