import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { serialize } from "@/lib/serialize";

/**
 * POST /api/handoffs/[id]/complete — body { closedWon?: boolean }
 * The rep finishes the handoff: sets status 'completed', completed_at, and
 * advances the lead status. Default target is 'in_negotiation'; pass
 * closedWon:true to advance to 'closed_won' instead. Forwards the lead's
 * complete progress in the same transaction and records the status change.
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

    const closedWon = body.closedWon === true;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query("SELECT * FROM handoffs WHERE id = $1", [id]);
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Handoff not found" }, { status: 404 });
      }
      const handoff = existing.rows[0];
      if (handoff.status === "completed" || handoff.status === "declined") {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `Handoff is already '${handoff.status}'; it cannot be completed again.` },
          { status: 409 }
        );
      }

      const result = await client.query(
        `UPDATE handoffs SET status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING *`,
        [id]
      );

      // Advance the lead. Accepts completed handoffs in any prior state
      // (queued or claimed) since completing a handoff from either is valid.
      const leadRes = await client.query(
        "SELECT status FROM leads WHERE id = $1",
        [handoff.lead_id]
      );
      if (leadRes.rows.length > 0) {
        const priorStatus = leadRes.rows[0].status as string;
        const targetStatus = closedWon ? "closed_won" : "in_negotiation";
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
    console.error("POST /api/handoffs/[id]/complete error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
