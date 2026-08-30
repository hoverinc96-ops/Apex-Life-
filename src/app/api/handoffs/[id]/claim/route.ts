import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { serialize } from "@/lib/serialize";

/**
 * POST /api/handoffs/[id]/claim
 * A rep claims a queued handoff: sets status 'claimed' and claimed_at.
 * This records ownership of the lead's context in the CRM — it does not route
 * or transfer a phone call to the rep.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await pool.query("SELECT * FROM handoffs WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Handoff not found" }, { status: 404 });
    }
    if (existing.rows[0].status !== "queued") {
      return NextResponse.json(
        { error: `Handoff is already '${existing.rows[0].status}'; only 'queued' handoffs can be claimed.` },
        { status: 409 }
      );
    }

    const result = await pool.query(
      `UPDATE handoffs SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return NextResponse.json(serialize(result.rows[0]));
  } catch (err) {
    console.error("POST /api/handoffs/[id]/claim error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
