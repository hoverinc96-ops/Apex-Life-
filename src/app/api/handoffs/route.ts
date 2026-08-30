import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { serialize, serializeRows } from "@/lib/serialize";

/**
 * GET /api/handoffs?repId=<id>&status=declined
 * List open handoffs (a rep's inbox) by default — status in ('queued','claimed').
 * Pass status=declined to list declined handoffs (owner view, so declined warm
 * leads aren't lost). Sorted so higher priority (urgent>high>normal) comes first.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repId = searchParams.get("repId");
    const statusParam = searchParams.get("status");

    const base = `
      SELECT h.id, h.lead_id, h.rep_id, h.status, h.priority, h.context,
             h.created_at, h.claimed_at, h.completed_at, h.declined_at, h.decline_reason,
             l.first_name, l.last_name, l.email, l.phone, l.state,
             tm.name AS rep_name
      FROM handoffs h
      JOIN leads l ON l.id = h.lead_id
      JOIN team_members tm ON tm.id = h.rep_id
    `;
    const params: string[] = [];
    let where: string;
    if (statusParam === "declined") {
      where = " WHERE h.status = 'declined'";
    } else {
      where = " WHERE h.status IN ('queued', 'claimed')";
    }
    if (repId) {
      params.push(repId);
      where += ` AND h.rep_id = ${params.length}`;
    }
    const result = await pool.query(
      base +
        where +
        ` ORDER BY CASE h.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, h.created_at DESC`,
      params
    );
    return NextResponse.json(serializeRows(result.rows));
  } catch (err) {
    console.error("GET /api/handoffs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/handoffs — { leadId, repId, priority? }
 * Queue a warm handoff: creates a 'queued' handoff row and moves the lead to
 * 'pending_live_handoff'. The context bundle (AI qualification summary, key
 * objections, quote reference, transcript notes) is assembled from the lead's
 * real DB rows so the rep can pick it up. This is a CONTEXT TRANSFER — the
 * AI-qualified lead is handed to a rep in the CRM; there is no phone call
 * routed to the rep in this model.
 *
 * priority (optional): 'normal' | 'high' | 'urgent'. An urgency cue for the rep
 * (which warm lead to work first). This is a working target/hint, NOT a
 * guaranteed real-time response or paging guarantee.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { leadId, repId } = body;
  if (!leadId || typeof leadId !== "string") {
    return NextResponse.json({ error: "leadId is required." }, { status: 400 });
  }
  if (!repId || typeof repId !== "string") {
    return NextResponse.json({ error: "repId is required." }, { status: 400 });
  }

  const priority =
    body.priority === "high" || body.priority === "urgent"
      ? body.priority
      : "normal";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Ensure the lead exists.
    const leadRes = await client.query(
      "SELECT * FROM leads WHERE id = $1",
      [leadId]
    );
    if (leadRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const lead = leadRes.rows[0];

    // Ensure the rep exists and is a rep (owner can also be handed leads, but
    // keep it to actual team members).
    const repRes = await client.query(
      "SELECT id, name FROM team_members WHERE id = $1",
      [repId]
    );
    if (repRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Rep not found" }, { status: 404 });
    }
    const rep = repRes.rows[0];

    // Assemble the warm-transfer context bundle from real DB rows.
    const quoteRes = await client.query(
      `SELECT id, carrier_name, policy_type, coverage_amount, monthly_premium, status
       FROM quotes WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [leadId]
    );
    const convRes = await client.query(
      `SELECT summary, key_objections, sentiment_score, ai_agent_id
       FROM conversations WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [leadId]
    );
    const quote = quoteRes.rows[0] ?? null;
    const conv = convRes.rows[0] ?? null;

    const context = {
      ai_qualification_summary:
        lead.health_notes && typeof lead.health_notes === "object" &&
        (lead.health_notes as Record<string, unknown>).ai_summary
          ? String((lead.health_notes as Record<string, unknown>).ai_summary)
          : `Lead ${lead.first_name} ${lead.last_name} (${lead.state}) — qualification_score ${lead.qualification_score ?? "n/a"}.`,
      qualification_score: lead.qualification_score ?? null,
      key_objections: conv?.key_objections ?? [],
      conversation_summary: conv?.summary ?? null,
      ai_agent_id: conv?.ai_agent_id ?? null,
      sentiment_score: conv?.sentiment_score ?? null,
      quote_reference: quote
        ? { quote_id: quote.id, carrier_name: quote.carrier_name, policy_type: quote.policy_type, coverage_amount: quote.coverage_amount, monthly_premium: quote.monthly_premium, status: quote.status }
        : null,
      handed_to: { rep_id: rep.id, rep_name: rep.name },
    };

    const insertRes = await client.query(
      `INSERT INTO handoffs (lead_id, rep_id, status, priority, context)
       VALUES ($1, $2, 'queued', $3, $4)
       RETURNING *`,
      [leadId, repId, priority, context]
    );

    // Move the lead to pending_live_handoff and record the status change.
    const newStatus = "pending_live_handoff";
    if (lead.status !== newStatus) {
      await client.query(
        `INSERT INTO status_history (lead_id, from_status, to_status, changed_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [leadId, lead.status as string, newStatus]
      );
    }
    await client.query(
      `UPDATE leads SET status = $2, assigned_rep_id = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [leadId, newStatus, repId]
    );

    await client.query("COMMIT");
    return NextResponse.json(serialize(insertRes.rows[0]), { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/handoffs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    client.release();
  }
}
