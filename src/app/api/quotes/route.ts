import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function POST(request: NextRequest) {
  const client = await pool.connect();

  try {
    const body = await request.json();
    const {
      lead_id,
      carrier_name,
      policy_type,
      coverage_amount,
      monthly_premium,
      annual_premium,
      term_length_years,
      proposal_pdf_url,
      quote_payload,
      expires_at,
      lead_status,
    } = body;

    // Validate required fields
    const missing: string[] = [];
    if (!lead_id) missing.push("lead_id");
    if (!carrier_name) missing.push("carrier_name");
    if (!policy_type) missing.push("policy_type");
    if (coverage_amount === undefined || coverage_amount === null) missing.push("coverage_amount");
    if (monthly_premium === undefined || monthly_premium === null) missing.push("monthly_premium");
    if (annual_premium === undefined || annual_premium === null) missing.push("annual_premium");

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    // Create the quote
    const quoteResult = await client.query(
      `INSERT INTO quotes (lead_id, carrier_name, policy_type, coverage_amount, monthly_premium, annual_premium, term_length_years, proposal_pdf_url, quote_payload, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        lead_id,
        carrier_name,
        policy_type,
        coverage_amount,
        monthly_premium,
        annual_premium,
        term_length_years ?? null,
        proposal_pdf_url ?? null,
        quote_payload ? JSON.stringify(quote_payload) : null,
        expires_at ?? null,
      ]
    );

    // Optionally update lead status
    if (lead_status) {
      await client.query("UPDATE leads SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [
        lead_status,
        lead_id,
      ]);
    }

    if (lead_status === "proposal_sent") {
      await client.query(`INSERT INTO re_engagement_queue (lead_id, quote_id, step, channel, status, scheduled_for) VALUES ($1,$2,1,'email','pending',NOW()),($1,$2,2,'email','pending',NOW()+INTERVAL '48 hours'),($1,$2,3,'sms','pending',NOW()+INTERVAL '72 hours')`, [lead_id, quoteResult.rows[0].id]);
    }

    await client.query("COMMIT");

    return NextResponse.json(quoteResult.rows[0], { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/quotes error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
