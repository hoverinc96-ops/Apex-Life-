import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  enriching: "Enriching",
  qualified: "Qualified",
  unqualified: "Unqualified",
  nurture: "Nurture",
  proposal_sent: "Proposal Sent",
  in_negotiation: "In Negotiation",
  pending_live_handoff: "Pending Handoff",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

const statusLabel = (s: string | null | undefined): string =>
  s ? STATUS_LABELS[s] ?? s : "";

const fmtCurrency = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface TimelineEvent {
  id: string;
  type: "lead_created" | "status_changed" | "conversation" | "message" | "quote";
  title: string;
  description?: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

async function buildTimeline(
  lead: Record<string, unknown>,
  quotes: Record<string, unknown>[],
  conversations: Record<string, unknown>[]
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  const leadId = lead.id as string;

  events.push({
    id: `evt-created-${leadId}`,
    type: "lead_created",
    title: "Lead created",
    description: lead.source
      ? `Source: ${String(lead.source).replace(/_/g, " ")}`
      : undefined,
    timestamp: lead.created_at as string,
  });

  // Status changes — from status_history when it exists, else approximate from
  // updated_at + current status (no history table existed before this build).
  const hist = await pool.query(
    `SELECT * FROM status_history WHERE lead_id = $1 ORDER BY changed_at ASC`,
    [leadId]
  );
  const actorLabel = (actor: string | null | undefined): string => {
    switch (actor) {
      case "ai": return "AI agent";
      case "system": return "System";
      case "rep_action": return "Rep action";
      case "handoff": return "Warm handoff";
      default: return actor && actor.trim() ? actor : "Rep action";
    }
  };
  if (hist.rows.length > 0) {
    for (const h of hist.rows) {
      const from = h.from_status ? `From ${statusLabel(h.from_status)} · ` : "";
      events.push({
        id: `evt-status-${h.id}`,
        type: "status_changed",
        title: `Status updated to ${statusLabel(h.to_status)}`,
        description: `${from}by ${actorLabel(h.changed_by)}`,
        timestamp: h.changed_at,
        meta: { changed_by: h.changed_by },
      });
    }
  } else if ((lead.status as string) !== "new") {
    events.push({
      id: `evt-status-current-${leadId}`,
      type: "status_changed",
      title: `Status updated to ${statusLabel(lead.status as string)}`,
      description: "Current pipeline stage",
      timestamp: lead.updated_at as string,
    });
  }

  for (const c of conversations) {
    events.push({
      id: `evt-conv-${c.id}`,
      type: "conversation",
      title: `${cap(c.channel as string)} conversation`,
      description:
        (c.summary as string)?.slice(0, 140)?.trim() ||
        `${c.direction} ${c.channel}`,
      timestamp: c.created_at as string,
      meta: {
        channel: c.channel,
        direction: c.direction,
        sentiment_score: c.sentiment_score,
      },
    });
    const msgs = (c.messages as Record<string, unknown>[]) ?? [];
    for (const m of msgs) {
      events.push({
        id: `evt-msg-${m.id}`,
        type: "message",
        title: `Message from ${m.sender_role === "ai" ? "AI agent" : "lead"}`,
        description: (m.content as string)?.slice(0, 140),
        timestamp: m.created_at as string,
        meta: { sender_role: m.sender_role },
      });
    }
  }

  for (const q of quotes) {
    const coverage = typeof q.coverage_amount === "number"
      ? ` · ${fmtCurrency(q.coverage_amount)} coverage`
      : "";
    events.push({
      id: `evt-quote-${q.id}`,
      type: "quote",
      title: `Quote created — ${q.carrier_name}`,
      description: `${cap(String(q.policy_type).replace(/_/g, " "))}${coverage}`,
      timestamp: q.created_at as string,
    });
  }

  events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return events;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch lead with quotes and conversations
    const leadResult = await pool.query("SELECT * FROM leads WHERE id = $1", [
      id,
    ]);

    if (leadResult.rows.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const quotesResult = await pool.query(
      "SELECT * FROM quotes WHERE lead_id = $1 ORDER BY created_at DESC",
      [id]
    );

    const conversationsResult = await pool.query(
      `SELECT c.*, COALESCE(json_agg(cm ORDER BY cm.created_at) FILTER (WHERE cm.id IS NOT NULL), '[]') AS messages
       FROM conversations c
       LEFT JOIN conversation_messages cm ON cm.conversation_id = c.id
       WHERE c.lead_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [id]
    );

    const timeline = await buildTimeline(
      leadResult.rows[0],
      quotesResult.rows,
      conversationsResult.rows
    );

    return NextResponse.json({
      ...leadResult.rows[0],
      quotes: quotesResult.rows,
      conversations: conversationsResult.rows,
      timeline,
    });
  } catch (err) {
    console.error("GET /api/leads/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Check lead exists
    const existing = await pool.query("SELECT * FROM leads WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Build dynamic UPDATE — allow any lead column to be updated
    const allowedFields = [
      "first_name",
      "last_name",
      "email",
      "phone",
      "date_of_birth",
      "gender",
      "state",
      "zip_code",
      "status",
      "qualification_score",
      "tobacco_user",
      "annual_income",
      "coverage_amount_requested",
      "health_notes",
      "tcpa_consent",
      "tcpa_consent_date",
      "enrichment_data",
      "assigned_rep_id",
      "external_id",
    ];

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(body[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Record status changes into status_history so timelines grow from now on.
    if (body.status !== undefined && body.status !== existing.rows[0].status) {
      // The dashboard drag / status picker is a manual rep action; allow an
      // explicit caller-supplied actor too (e.g. "ai", "system", "handoff").
      const changedBy = typeof body.changed_by === "string" && body.changed_by
        ? body.changed_by
        : "rep_action";
      await pool.query(
        `INSERT INTO status_history (lead_id, from_status, to_status, changed_at, changed_by)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)`,
        [id, existing.rows[0].status as string, body.status as string, changedBy]
      );
    }

    // Always update updated_at
    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    values.push(id);
    const query = `UPDATE leads SET ${setClauses.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

    const result = await pool.query(query, values);
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/leads/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
