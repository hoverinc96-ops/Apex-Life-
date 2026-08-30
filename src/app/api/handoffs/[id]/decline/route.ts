import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { serialize } from "@/lib/serialize";

/**
 * POST /api/handoffs/[id]/decline — body { reason? }
 * A rep declines a warm handoff. Valid for a handoff in 'queued' or 'claimed'
 * state. Sets status='declined', stores decline_reason and declined_at.
 *
 * Routing on decline (honest, manual): a declined handoff is NOT auto-reassigned
 * to another rep. Instead the lead reverts to 'qualified' so it is back in the
 * pipeline and the owner can manually pick the next rep. The declined handoff
 * stays visible in the owner's Declined view so nothing is lost. This matches
 * the current product — there is no autonomous re-routing engine.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 500)
        : null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query("SELECT * FROM handoffs WHERE id = $1", [id]);
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Handoff not found" }, { status: 404 });
      }
      const handoff = existing.rows[0];
      if (handoff.status !== "queued" && handoff.status !== "claimed") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `Handoff is '${handoff.status}'; only 'queued' or 'claimed' handoffs can be declined.` },
          { status: 409 }
        );
      }

      const result = await client.query(
        `UPDATE handoffs
         SET status = 'declined', decline_reason = $2, declined_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id, reason]
      );

      // Revert the lead to a workable prior state ('qualified') so the owner can
      // re-route manually to a different rep. Record the status change for the trail.
      const leadRes = await client.query(
        "SELECT status FROM leads WHERE id = $1",
        [handoff.lead_id]
      );
      if (leadRes.rows.length > 0) {
        const priorStatus = leadRes.rows[0].status as string;
        const targetStatus = "qualified";
        if (priorStatus !== targetStatus) {
          await client.query(
            `INSERT INTO status_history (lead_id, from_status, to_status, changed_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
            [handoff.lead_id, priorStatus, targetStatus]
          );
        }
        await client.query(
          `UPDATE leads SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [handoff.lead_id, targetStatus]
        );
      }

      await client.query("COMMIT");
      return NextResponse.json(serialize(result.rows[0]));
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("POST /api/handoffs/[id]/decline error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
