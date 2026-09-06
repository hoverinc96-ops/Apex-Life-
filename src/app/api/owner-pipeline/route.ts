import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { serialize } from "@/lib/serialize";

/**
 * GET /api/owner-pipeline — the OWNER's private pipeline (Mode-1 owner seat).
 * Returns consumer inquiries (leads with source='consumer_inquiry' /
 * owner_only=TRUE) plus booking requests (bookings table, all owner-only),
 * newest first. Never includes partner/tenant demo data: the partner kanban
 * reads /api/leads unfiltered, but this endpoint strictly filters on the
 * owner_only markers, so these rows can be kept out of tenant views.
 */
export async function GET(request: NextRequest) {
  try {
    const inquiries = await pool.query(
      `SELECT id, first_name, last_name, email, phone, state, status, source, owner_only, created_at
         FROM leads
        WHERE owner_only = TRUE
        ORDER BY created_at DESC`
    );
    const bookings = await pool.query(
      `SELECT id, name, email, phone, topic, requested_time, status, owner_only,
              google_sync_status, google_event_id, created_at
         FROM bookings
        ORDER BY created_at DESC`
    );
    return NextResponse.json(
      serialize({
        inquiries: inquiries.rows,
        bookings: bookings.rows,
      })
    );
  } catch (err) {
    console.error("GET /api/owner-pipeline error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}