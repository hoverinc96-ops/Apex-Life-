import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import pool from "@/lib/db";
import { generateReEngagementEmail } from "@/lib/re-engagement/templates";

export async function GET() { try { const r = await pool.query(`SELECT q.*, l.first_name, l.email FROM re_engagement_queue q JOIN leads l ON l.id=q.lead_id ORDER BY q.scheduled_for ASC`); return NextResponse.json(r.rows); } catch (e) { console.error(e); return NextResponse.json({ error: "Unable to load queue" }, { status: 500 }); } }
export async function POST(request: NextRequest) {
  const { lead_id, quote_id } = await request.json();
  if (!lead_id || !quote_id) return NextResponse.json({ error: "lead_id and quote_id are required" }, { status: 400 });
  try {
    const found = await pool.query(`SELECT l.*, q.* FROM leads l JOIN quotes q ON q.lead_id=l.id AND q.id=$2 WHERE l.id=$1`, [lead_id, quote_id]);
    if (!found.rowCount) return NextResponse.json({ error: "Lead or quote not found" }, { status: 404 });
    const row = found.rows[0];
    if (!["proposal_sent", "in_negotiation"].includes(row.status)) return NextResponse.json({ skipped: true, reason: `Lead status is ${row.status}` });
    if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Email service is not configured" }, { status: 503 });
    const email = generateReEngagementEmail(row, row);
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'Alex at Apex Life <onboarding@resend.dev>', to: row.email, subject: email.subject, html: email.html });
    await pool.query(`INSERT INTO re_engagement_queue (lead_id, quote_id, step, channel, status, scheduled_for, sent_at) VALUES ($1,$2,1,'email','sent',NOW(),NOW()),($1,$2,2,'email', 'pending', NOW()+INTERVAL '48 hours'),($1,$2,3,'sms','pending', NOW()+INTERVAL '72 hours')`, [lead_id, quote_id]);
    return NextResponse.json({ success: true, email_id: result.data?.id });
  } catch (e) { console.error("POST /api/re-engage", e); return NextResponse.json({ error: "Unable to send re-engagement" }, { status: 500 }); }
}
