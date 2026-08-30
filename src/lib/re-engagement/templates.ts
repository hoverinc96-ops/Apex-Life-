export type ReEngagementLead = { id?: string; first_name: string; email?: string; phone?: string };
export type ReEngagementQuote = { id: string; carrier_name: string; coverage_amount: number | string; monthly_premium: number | string; proposal_pdf_url?: string | null };

// ── CAN-SPAM compliance (§4.1 / §5 C8) ───────────────────────────────────────
// Every commercial email must include (1) a working unsubscribe mechanism and
// (2) a valid physical postal address. The address below is a placeholder the
// owner must replace with the real registered business address before any send.
export const COMPANY_NAME = "Apex Life AI";
export const COMPANY_POSTAL_ADDRESS =
  process.env.COMPANY_POSTAL_ADDRESS || "123 Main Street, Suite 100, Austin, TX 78701";

// Unsubscribe link placeholder — points at a to-be-built landing page keyed by
// email so a recipient can opt out of future email. Honored opt-outs also flow
// into the compliance_dnc_list via POST /api/compliance/opt-out.
export const unsubscribeUrl = (email?: string) =>
  `${process.env.NEXT_PUBLIC_APP_URL || "https://apexlifeai.ctonew.app"}/unsubscribe${
    email ? `?email=${encodeURIComponent(email)}` : ""
  }`;

const money = (value: number | string) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
const proposalUrl = (quote: ReEngagementQuote) => quote.proposal_pdf_url || `${process.env.NEXT_PUBLIC_APP_URL || "https://apexlifeai.ctonew.app"}/proposal/${quote.id}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));

export function generateReEngagementEmail(lead: ReEngagementLead, quote: ReEngagementQuote) {
  const firstName = escapeHtml(lead.first_name || "there");
  const coverage = money(quote.coverage_amount);
  const premium = money(quote.monthly_premium);
  const url = proposalUrl(quote);
  const unsub = escapeHtml(unsubscribeUrl(lead.email));
  return {
    subject: `${lead.first_name}, your ${coverage} Life Insurance Quote Summary`,
    html: `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#172033"><div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden"><div style="background:#101b35;padding:28px 32px;color:#fff"><div style="font-size:18px;font-weight:bold;color:#d9ae57">◆ Apex Life AI</div><h1 style="font-size:25px;margin:22px 0 0">Your personalized quote</h1></div><div style="padding:32px"><p style="font-size:16px">Hi ${firstName},</p><p style="line-height:1.6;color:#4b5563">We wanted to make sure you had an easy way to review your life insurance options. Here is the quote prepared for you:</p><div style="border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:24px 0"><div style="color:#6b7280;font-size:13px">CARRIER</div><div style="font-size:18px;font-weight:bold;margin:5px 0 18px">${escapeHtml(quote.carrier_name)}</div><div style="display:flex;gap:40px"><div><div style="color:#6b7280;font-size:13px">COVERAGE</div><strong style="font-size:20px">${coverage}</strong></div><div><div style="color:#6b7280;font-size:13px">MONTHLY PREMIUM</div><strong style="font-size:20px">${premium}/mo</strong></div></div></div><p style="text-align:center;margin:30px 0"><a href="${url}" style="display:inline-block;background:#c9983e;color:#fff;text-decoration:none;padding:14px 26px;border-radius:7px;font-weight:bold">View Your Proposal</a></p><p style="font-size:13px;line-height:1.5;color:#6b7280">Questions? Reply to this email and our team will be happy to help. This quote is subject to carrier underwriting and availability.</p></div><div style="padding:20px 32px;background:#f8fafc;color:#94a3b8;font-size:12px;line-height:1.6">${escapeHtml(COMPANY_NAME)} · <a href="${unsub}" style="color:#c9983e;text-decoration:underline">Unsubscribe</a> — you can opt out of future emails at any time, and we'll honor your request within 10 business days.<br/>${escapeHtml(COMPANY_POSTAL_ADDRESS)}</div></div></body></html>`
  };
}

export function generateReEngagementSMS(firstName: string, coverageAmount: number | string, monthlyPremium: number | string, step: number) {
  const link = `${process.env.NEXT_PUBLIC_APP_URL || "https://apexlifeai.ctonew.app"}/quote`;
  if (step === 1) return `Hi ${firstName}, just checking in on your $${money(coverageAmount)} life insurance quote ($${money(monthlyPremium)}/mo). Review it here: ${link} Reply STOP to opt out.`;
  return `Hi ${firstName}, following up on your life insurance quote for $${money(coverageAmount)} of coverage at $${money(monthlyPremium)}/mo. We're happy to answer questions: ${link} Reply STOP to opt out.`;
}

export function isTwilioConfigured() { return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER); }
