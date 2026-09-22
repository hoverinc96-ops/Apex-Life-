import { NextResponse } from "next/server";
import pool from "@/lib/db";

/**
 * GET /api/compliance/dnc
 *
 * Read-only feed for the dashboard DNC list surface (compliance item E1,
 * traffic pack §6.6). Returns every do-not-contact entry with the lead name
 * resolved where the entry is linked to a lead. Entries without a matching
 * lead (e.g. a consumer opt-out for an unknown contact) still appear — the
 * suppression is what matters, not the link.
 *
 * Read-only by design: there is no edit or delete here. Honoring a
 * do-not-contact is unconditional (§5 C4/C8), so entries are permanent.
 */
export async function GET() {
  try {
    const result = await pool.query(
      `SELECT d.id, d.lead_id, d.phone, d.email, d.dnc_type, d.source,
              d.channel, d.note, d.added_at,
              l.first_name, l.last_name
         FROM compliance_dnc_list d
         LEFT JOIN leads l ON l.id = d.lead_id
        ORDER BY d.added_at DESC`
    );
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error("GET /api/compliance/dnc error:", err);
    return NextResponse.json(
      { error: "Unable to load the do-not-contact list." },
      { status: 500 }
    );
  }
}
