import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { serialize } from "@/lib/serialize";

/**
 * POST /api/handoffs/[id]/reassign — body { repId (required), reason? }
 * Owner action: move a warm handoff to another rep. Valid for a handoff in
 * 'queued' or 'claimed' state. The handoff's status is reset to 'queued' so the
 * new rep sees it fresh and claims it, claimed_at is cleared, and the
 * reassignment is recorded in the context bundle (context.reassignments array)
 * so the audit trail / timeline is preserved.
 *
 * Honest framing: this is a CONTEXT transfer — the lead's working notes move to
 * another rep in the CRM. Reassigning does NOT ring anyone's phone.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { repId, reason } = body;
    if (!repId || typeof repId !== "string") {
      return NextResponse.json({ error: "repId is required." }, { status: 400 });
    }
    const reasonText =
      typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;

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
          { error: `Handoff is '${handoff.status}'; only 'queued' or 'claimed' handoffs can be reassigned.` },
          { status: 409 }
        );
      }

      // New rep must exist in the team.
      const newRep = await client.query(
        "SELECT id, name FROM team_members WHERE id = $1",
        [repId]
      );
      if (newRep.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Rep not found" }, { status: 404 });
      }
      const newRepName = newRep.rows[0].name as string;

      // Resolve the previous rep's name for the audit record.
      const oldRepRes = await client.query(
        "SELECT name FROM team_members WHERE id = $1",
        [handoff.rep_id]
      );
      const oldRepName =
        oldRepRes.rows.length > 0 ? (oldRepRes.rows[0].name as string) : "Unknown rep";

      // Append to the context bundle's reassignment trail (preserves the audit).
      const context = handoff.context && typeof handoff.context === "object"
        ? handoff.context
        : {};
      const reassignments = Array.isArray(context.reassignments)
        ? context.reassignments
        : [];
      const entry = {
        from_rep_id: handoff.rep_id,
        from_rep_name: oldRepName,
        to_rep_id: repId,
        to_rep_name: newRepName,
        reason: reasonText,
        at: new Date().toISOString(),
      };
      const newContext = {
        ...context,
        reassignments: [...reassignments, entry],
      };

      // Reset to 'queued' so the new rep claims it fresh; clear prior claim.
      const result = await client.query(
        `UPDATE handoffs
         SET rep_id = $2, status = 'queued', claimed_at = NULL,
             context = $3
         WHERE id = $1
         RETURNING *`,
        [id, repId, JSON.stringify(newContext)]
      );

      // Point the lead at the new rep as well.
      await client.query(
        `UPDATE leads SET assigned_rep_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [handoff.lead_id, repId]
      );

      await client.query("COMMIT");
      return NextResponse.json(serialize(result.rows[0]));
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("POST /api/handoffs/[id]/reassign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
