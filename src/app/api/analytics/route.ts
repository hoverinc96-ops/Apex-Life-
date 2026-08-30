import { NextResponse } from "next/server";
import pool from "@/lib/db";

/**
 * GET /api/analytics
 * Live pilot metrics computed from the PostgreSQL database.
 * All numbers come from the real tables — nothing is simulated or seeded
 * at request time. Returns a flat JSON object consumed by the Analytics page.
 */
export async function GET() {
  try {
    const [statusRes, totalsRes, reEngageRes, ttfRes, weeklyRes] =
      await Promise.all([
        // Leads by status
        pool.query(
          `SELECT status, COUNT(*)::int AS count
           FROM leads GROUP BY status`
        ),
        // Core totals
        pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM leads) AS total_leads,
             (SELECT COUNT(*)::int FROM conversations) AS total_conversations,
             (SELECT COUNT(*)::int FROM quotes) AS total_quotes`
        ),
        // Re-engagement queue status
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
             COUNT(*) FILTER (WHERE status = 'sent')::int AS total_sent,
             COUNT(*) FILTER (WHERE status = 'sent' AND channel = 'email' AND sent_at::date = CURRENT_DATE)::int AS emails_sent_today,
             COUNT(*) FILTER (WHERE status = 'sent' AND channel = 'sms' AND sent_at::date = CURRENT_DATE)::int AS sms_sent_today,
             MIN(scheduled_for) FILTER (WHERE status = 'pending') AS next_run
           FROM re_engagement_queue`
        ),
        // Time to first touch: hours between lead creation and the lead's
        // earliest conversation message (per lead with at least one message).
        pool.query(
          `SELECT
             ROUND(AVG(hours)::numeric, 1) AS avg_hours,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours)::numeric, 1) AS median_hours,
             COUNT(*)::int AS n
           FROM (
             SELECT EXTRACT(EPOCH FROM (MIN(m.created_at) - l.created_at)) / 3600.0 AS hours
             FROM leads l
             JOIN conversations c ON c.lead_id = l.id
             JOIN conversation_messages m ON m.conversation_id = c.id
             GROUP BY l.id
           ) t`
        ),
        // Last 8 weeks (Monday-start) — entity counts bucketed by created_at
        pool.query(
          `WITH weeks AS (
             SELECT generate_series(
               (date_trunc('week', CURRENT_DATE) - INTERVAL '7 weeks')::date,
               date_trunc('week', CURRENT_DATE)::date,
               INTERVAL '1 week'
             )::date AS week_start
           )
           SELECT
             w.week_start,
             (SELECT COUNT(*)::int FROM leads l
              WHERE l.created_at >= w.week_start
                AND l.created_at <  w.week_start + INTERVAL '1 week') AS new_leads,
             (SELECT COUNT(*)::int FROM conversations c
              WHERE c.created_at >= w.week_start
                AND c.created_at <  w.week_start + INTERVAL '1 week') AS conversations,
             (SELECT COUNT(*)::int FROM leads l
              WHERE l.created_at >= w.week_start
                AND l.created_at <  w.week_start + INTERVAL '1 week'
                AND l.status IN ('qualified','proposal_sent','in_negotiation','pending_live_handoff','closed_won')) AS qualified_leads,
             (SELECT COUNT(*)::int FROM quotes q
              WHERE q.created_at >= w.week_start
                AND q.created_at <  w.week_start + INTERVAL '1 week') AS proposals_sent,
             (SELECT COUNT(*)::int FROM leads l
              WHERE l.created_at >= w.week_start
                AND l.created_at <  w.week_start + INTERVAL '1 week'
                AND l.status = 'closed_won') AS closed_won
           FROM weeks w
           ORDER BY w.week_start`
        ),
      ]);

    // ── Shape the response ────────────────────────────────────────────────
    const statuses = new Map(
      statusRes.rows.map((r) => [r.status, r.count])
    );
    const ALL_STATUSES = [
      "new",
      "enriching",
      "qualified",
      "unqualified",
      "nurture",
      "proposal_sent",
      "in_negotiation",
      "pending_live_handoff",
      "closed_won",
      "closed_lost",
    ];
    const leadsByStatus: Record<string, number> = {};
    for (const s of ALL_STATUSES) leadsByStatus[s] = statuses.get(s) ?? 0;

    const t = totalsRes.rows[0];
    const r = reEngageRes.rows[0];
    const ttf = ttfRes.rows[0];

    const totalLeads = t.total_leads;
    const totalConversations = t.total_conversations;
    const totalQuotes = t.total_quotes;

    const qualifiedPlus =
      leadsByStatus.qualified +
      leadsByStatus.proposal_sent +
      leadsByStatus.in_negotiation +
      leadsByStatus.pending_live_handoff +
      leadsByStatus.closed_won;

    const proposalPlus =
      leadsByStatus.proposal_sent +
      leadsByStatus.in_negotiation +
      leadsByStatus.pending_live_handoff +
      leadsByStatus.closed_won;

    const contactRate =
      totalLeads > 0 ? (totalConversations / totalLeads) * 100 : null;
    const qualificationRate =
      totalLeads > 0 ? (qualifiedPlus / totalLeads) * 100 : null;
    const proposalConversion =
      qualifiedPlus > 0 ? (proposalPlus / qualifiedPlus) * 100 : null;

    const totalSends = r.total_sent ?? 0;
    const hoursSaved =
      (totalConversations * 8 + totalSends * 2) / 60; // minutes → hours

    return NextResponse.json({
      computedAt: new Date().toISOString(),
      totals: {
        leads: totalLeads,
        leadsByStatus,
        conversations: totalConversations,
        quotes: totalQuotes,
        openReEngagement: r.pending ?? 0,
      },
      kpis: {
        contactRate: round1(contactRate),
        contactConversations: totalConversations,
        contactLeads: totalLeads,
        qualificationRate: round1(qualificationRate),
        qualifiedPlus,
        totalLeads,
        timeToFirstTouchAvgHours:
          ttf.avg_hours == null ? null : Number(ttf.avg_hours),
        timeToFirstTouchMedianHours:
          ttf.median_hours == null ? null : Number(ttf.median_hours),
        timeToFirstTouchCount: ttf.n ?? 0,
        proposalConversion: round1(proposalConversion),
        proposalPlus,
        hoursSaved: round1(hoursSaved),
        hoursSavedConversations: totalConversations,
        hoursSavedSends: totalSends,
      },
      reEngagement: {
        pendingFollowUps: r.pending ?? 0,
        emailsSentToday: r.emails_sent_today ?? 0,
        smsSentToday: r.sms_sent_today ?? 0,
        nextScheduledRun: r.next_run ?? null,
      },
      weekly: weeklyRes.rows.map((w) => ({
        // pg returns DATE columns as JS Date — normalize to YYYY-MM-DD (Monday)
        weekStart: toDateStr(w.week_start),
        newLeads: w.new_leads,
        conversations: w.conversations,
        qualifiedLeads: w.qualified_leads,
        proposalsSent: w.proposals_sent,
        closedWon: w.closed_won,
      })),
    });
  } catch (err) {
    console.error("GET /api/analytics error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function round1(v: number | null): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return Math.round(v * 10) / 10;
}

function toDateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
