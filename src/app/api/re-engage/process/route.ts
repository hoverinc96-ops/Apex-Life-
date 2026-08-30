import { NextResponse } from "next/server";
import { Resend } from "resend";
import pool from "@/lib/db";
import { generateReEngagementEmail, generateReEngagementSMS, isTwilioConfigured } from "@/lib/re-engagement/templates";

export async function POST() {
  const items = await pool.query(`SELECT q.*, l.first_name, l.email, l.phone, l.status AS lead_status, qt.carrier_name, qt.coverage_amount, qt.monthly_premium, qt.proposal_pdf_url FROM re_engagement_queue q JOIN leads l ON l.id=q.lead_id LEFT JOIN quotes qt ON qt.id=q.quote_id WHERE q.status='pending' AND q.scheduled_for <= NOW() ORDER BY q.scheduled_for LIMIT 50`);
  let processed = 0; const details: Array<{ id: string; status: string }> = [];
  for (const item of items.rows) {
    if (["closed_won", "closed_lost"].includes(item.lead_status)) { await pool.query(`UPDATE re_engagement_queue SET status='skipped', error_message='Lead converted or closed' WHERE id=$1`, [item.id]); details.push({ id: item.id, status: "skipped" }); processed++; continue; }
    try {
      if (item.channel === "sms") { if (!isTwilioConfigured()) { await pool.query(`UPDATE re_engagement_queue SET status='skipped', error_message='Twilio not configured' WHERE id=$1`, [item.id]); details.push({ id: item.id, status: "skipped" }); processed++; continue; } /* dormant Twilio integration */ throw new Error("Twilio integration is dormant"); }
      if (!process.env.RESEND_API_KEY) throw new Error("Resend not configured");
      const email = generateReEngagementEmail(item, item);
      await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'Alex at Apex Life <onboarding@resend.dev>', to: item.email, subject: email.subject, html: email.html });
      await pool.query(`UPDATE re_engagement_queue SET status='sent', sent_at=NOW() WHERE id=$1`, [item.id]); details.push({ id: item.id, status: "sent" }); processed++;
    } catch (e) { await pool.query(`UPDATE re_engagement_queue SET status='failed', error_message=$2 WHERE id=$1`, [item.id, e instanceof Error ? e.message : "Unknown error"]); details.push({ id: item.id, status: "failed" }); processed++; }
  }
  return NextResponse.json({ processed, details });
}
