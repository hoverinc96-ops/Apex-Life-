import { NextResponse } from "next/server";
import pool from "@/lib/db";

/**
 * Rich conversation feed for the Conversations page: every conversation joined
 * with its lead (for the lead name) and its full message thread. Handles
 * conversations whose lead has been deleted by returning null lead fields so
 * the UI can show "Unknown lead" gracefully.
 */
export async function GET() {
  try {
    const result = await pool.query(
      `SELECT
         c.id,
         c.lead_id,
         c.channel,
         c.direction,
         c.provider_call_id,
         c.summary,
         c.sentiment_score,
         c.key_objections,
         c.ai_agent_id,
         c.started_at,
         c.ended_at,
         c.created_at,
         l.first_name AS lead_first_name,
         l.last_name AS lead_last_name,
         l.email AS lead_email,
         COALESCE(json_agg(cm ORDER BY cm.created_at) FILTER (WHERE cm.id IS NOT NULL), '[]') AS messages
       FROM conversations c
       LEFT JOIN leads l ON l.id = c.lead_id
       LEFT JOIN conversation_messages cm ON cm.conversation_id = c.id
       GROUP BY c.id, l.first_name, l.last_name, l.email
       ORDER BY c.created_at DESC`
    );
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error("GET /api/conversations/feed error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
