import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { scrubPII } from "@/lib/pii-scrubber";

/** Columns safe to return to clients — excludes raw_content (unscrubbed PII). */
const MESSAGE_SAFE_COLUMNS =
  "id, conversation_id, sender_role, content, recording_url, latency_ms, created_at";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("lead_id");
    let query = "SELECT * FROM conversations";
    const params: string[] = [];
    if (leadId) {
      query += " WHERE lead_id = $1";
      params.push(leadId);
    }
    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, params);
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error("GET /api/conversations error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Creates a conversation message (when the body carries `conversation_id`) or a
 * new conversation (legacy behavior).
 *
 * Message path: content is run through the PII/PHI scrubber BEFORE storage.
 * The original text goes to `raw_content`, the scrubbed version to `content`,
 * and if medical PHI is detected the conversation is tagged PHI_DETECTED in
 * its key_objections array.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.conversation_id !== undefined) {
      return await createMessage(body);
    }
    return await createConversation(body);
  } catch (err) {
    console.error("POST /api/conversations error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function createConversation(body: Record<string, unknown>) {
  const {
    lead_id,
    channel,
    direction,
    provider_call_id,
    summary,
    sentiment_score,
    key_objections,
    ai_agent_id,
    started_at,
    ended_at,
  } = body;
  if (!lead_id || !channel || !direction) {
    return NextResponse.json(
      { error: "Missing required fields: lead_id, channel, direction" },
      { status: 400 }
    );
  }
  const result = await pool.query(
    `INSERT INTO conversations (lead_id, channel, direction, provider_call_id, summary, sentiment_score, key_objections, ai_agent_id, started_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      lead_id,
      channel,
      direction,
      provider_call_id ?? null,
      summary ?? null,
      sentiment_score ?? null,
      key_objections ?? null,
      ai_agent_id ?? null,
      started_at ?? null,
      ended_at ?? null,
    ]
  );
  return NextResponse.json(result.rows[0], { status: 201 });
}

async function createMessage(body: Record<string, unknown>) {
  const {
    conversation_id,
    sender_role,
    content,
    recording_url,
    latency_ms,
  } = body;

  if (
    typeof content !== "string" ||
    content.trim() === "" ||
    typeof sender_role !== "string" ||
    sender_role.trim() === ""
  ) {
    return NextResponse.json(
      {
        error: "Missing required fields: conversation_id, sender_role, content",
      },
      { status: 400 }
    );
  }

  // Load the conversation + the lead's own phone so their number isn't redacted.
  const convRes = await pool.query(
    `SELECT c.id, c.key_objections, l.phone AS lead_phone
       FROM conversations c
       JOIN leads l ON l.id = c.lead_id
      WHERE c.id = $1`,
    [conversation_id]
  );
  if (convRes.rowCount === 0) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }
  const conversation = convRes.rows[0];

  // PII/PHI scrub BEFORE storing.
  const knownPhones = conversation.lead_phone
    ? [conversation.lead_phone as string]
    : [];
  const scrub = scrubPII(content, { knownPhones });

  const result = await pool.query(
    `INSERT INTO conversation_messages (conversation_id, sender_role, content, raw_content, recording_url, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${MESSAGE_SAFE_COLUMNS}`,
    [
      conversation_id,
      sender_role,
      scrub.scrubbedText,
      content, // original text kept for audit/recovery only
      recording_url ?? null,
      latency_ms ?? null,
    ]
  );

  // Tag the conversation when PHI was detected (once, not duplicated).
  if (scrub.containsPHI) {
    await pool.query(
      `UPDATE conversations
          SET key_objections = array_append(
                COALESCE(key_objections, '{}'::text[]),
                'PHI_DETECTED'
              )
        WHERE id = $1
          AND NOT ('PHI_DETECTED' = ANY(COALESCE(key_objections, '{}'::text[])))`,
      [conversation_id]
    );
  }

  return NextResponse.json(
    {
      ...result.rows[0],
      scrubbed: {
        containsPHI: scrub.containsPHI,
        redactions: scrub.redactions,
      },
    },
    { status: 201 }
  );
}
