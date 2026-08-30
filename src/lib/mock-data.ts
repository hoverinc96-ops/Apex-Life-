// ── Types ────────────────────────────────────────────────────────────────────
export interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  state: string;
  zip_code: string;
  status: LeadStatus;
  qualification_score: number | null;
  tobacco_user: boolean;
  annual_income: number;
  coverage_amount_requested: number;
  health_notes: Record<string, unknown>;
  created_at: string;
}

export type LeadStatus =
  | "new"
  | "qualified"
  | "proposal_sent"
  | "in_negotiation"
  | "pending_live_handoff"
  | "closed_won";

export interface Quote {
  id: string;
  lead_id: string;
  carrier_name: string;
  policy_type: string;
  term_length_years: number | null;
  coverage_amount: number;
  monthly_premium: number;
  annual_premium: number;
  status: string;
}

export interface ConversationMessage {
  id: string;
  sender_role: string;
  content: string;
}

export interface Conversation {
  id: string;
  lead_id: string;
  channel: string;
  direction: string;
  summary: string;
  sentiment_score: number;
  key_objections: string[];
  messages: ConversationMessage[];
}

export interface TimelineEvent {
  id: string;
  type: "lead_created" | "status_changed" | "conversation" | "message" | "quote";
  title: string;
  description?: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

// ── Pipeline column config ──────────────────────────────────────────────────
export const PIPELINE_COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: "new", label: "New Leads" },
  { status: "qualified", label: "Qualified" },
  { status: "proposal_sent", label: "Proposal Sent" },
  { status: "in_negotiation", label: "In Negotiation" },
  { status: "pending_live_handoff", label: "Pending Live Handoff" },
  { status: "closed_won", label: "Closed Won" },
];

// ── Relative date helper ────────────────────────────────────────────────────
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ── 12 Mock Leads ───────────────────────────────────────────────────────────
export const mockLeads: Lead[] = [
  // 3 new
  {
    id: "a1b2c3d4-0001-4000-8000-000000000001",
    first_name: "Michael",
    last_name: "Torres",
    email: "mtorres@email.com",
    phone: "(214) 555-0132",
    date_of_birth: "1992-03-15",
    state: "TX",
    zip_code: "75001",
    status: "new",
    qualification_score: null,
    tobacco_user: false,
    annual_income: 85000,
    coverage_amount_requested: 500000,
    health_notes: {},
    created_at: daysAgo(3),
  },
  {
    id: "a1b2c3d4-0001-4000-8000-000000000002",
    first_name: "Jennifer",
    last_name: "Park",
    email: "jpark@email.com",
    phone: "(310) 555-0145",
    date_of_birth: "1985-11-02",
    state: "CA",
    zip_code: "90012",
    status: "new",
    qualification_score: null,
    tobacco_user: false,
    annual_income: 125000,
    coverage_amount_requested: 750000,
    health_notes: {},
    created_at: daysAgo(2),
  },
  {
    id: "a1b2c3d4-0001-4000-8000-000000000003",
    first_name: "Robert",
    last_name: "Kim",
    email: "rkim@email.com",
    phone: "(404) 555-0187",
    date_of_birth: "1978-07-22",
    state: "GA",
    zip_code: "30303",
    status: "new",
    qualification_score: null,
    tobacco_user: true,
    annual_income: 65000,
    coverage_amount_requested: 300000,
    health_notes: {},
    created_at: daysAgo(1),
  },

  // 2 qualified
  {
    id: "a1b2c3d4-0001-4000-8000-000000000004",
    first_name: "Amanda",
    last_name: "Richardson",
    email: "arichardson@email.com",
    phone: "(615) 555-0211",
    date_of_birth: "1989-06-10",
    state: "TN",
    zip_code: "37201",
    status: "qualified",
    qualification_score: 78,
    tobacco_user: false,
    annual_income: 110000,
    coverage_amount_requested: 1000000,
    health_notes: { conditions: [], medications: [], last_checkup: "2026-01" },
    created_at: daysAgo(6),
  },
  {
    id: "a1b2c3d4-0001-4000-8000-000000000005",
    first_name: "David",
    last_name: "Nguyen",
    email: "dnguyen@email.com",
    phone: "(832) 555-0433",
    date_of_birth: "1994-09-28",
    state: "TX",
    zip_code: "77002",
    status: "qualified",
    qualification_score: 85,
    tobacco_user: false,
    annual_income: 95000,
    coverage_amount_requested: 500000,
    health_notes: { conditions: [], medications: [], last_checkup: "2026-03" },
    created_at: daysAgo(5),
  },

  // 2 proposal_sent
  {
    id: "a1b2c3d4-0001-4000-8000-000000000006",
    first_name: "Sarah",
    last_name: "Mitchell",
    email: "smitchell@email.com",
    phone: "(602) 555-0677",
    date_of_birth: "1982-04-03",
    state: "AZ",
    zip_code: "85001",
    status: "proposal_sent",
    qualification_score: 72,
    tobacco_user: false,
    annual_income: 140000,
    coverage_amount_requested: 750000,
    health_notes: { conditions: ["mild hypertension"], medications: ["lisinopril"], last_checkup: "2026-02" },
    created_at: daysAgo(11),
  },
  {
    id: "a1b2c3d4-0001-4000-8000-000000000007",
    first_name: "James",
    last_name: "O'Brien",
    email: "jobrien@email.com",
    phone: "(312) 555-0891",
    date_of_birth: "1975-12-18",
    state: "IL",
    zip_code: "60601",
    status: "proposal_sent",
    qualification_score: 68,
    tobacco_user: false,
    annual_income: 180000,
    coverage_amount_requested: 1000000,
    health_notes: { conditions: [], medications: [], last_checkup: "2025-11" },
    created_at: daysAgo(13),
  },

  // 2 in_negotiation
  {
    id: "a1b2c3d4-0001-4000-8000-000000000008",
    first_name: "Lisa",
    last_name: "Patel",
    email: "lpatel@email.com",
    phone: "(408) 555-0344",
    date_of_birth: "1990-08-07",
    state: "CA",
    zip_code: "95113",
    status: "in_negotiation",
    qualification_score: 88,
    tobacco_user: false,
    annual_income: 155000,
    coverage_amount_requested: 750000,
    health_notes: { conditions: [], medications: [], last_checkup: "2026-05" },
    created_at: daysAgo(21),
  },
  {
    id: "a1b2c3d4-0001-4000-8000-000000000009",
    first_name: "Thomas",
    last_name: "Washington",
    email: "twashington@email.com",
    phone: "(704) 555-0765",
    date_of_birth: "1980-02-14",
    state: "NC",
    zip_code: "28202",
    status: "in_negotiation",
    qualification_score: 91,
    tobacco_user: true,
    annual_income: 45000,
    coverage_amount_requested: 250000,
    health_notes: { conditions: ["type 2 diabetes"], medications: ["metformin"], last_checkup: "2026-04" },
    created_at: daysAgo(23),
  },

  // 1 pending_live_handoff
  {
    id: "a1b2c3d4-0001-4000-8000-000000000010",
    first_name: "Maria",
    last_name: "Garcia",
    email: "mgarcia@email.com",
    phone: "(305) 555-0522",
    date_of_birth: "1968-05-30",
    state: "FL",
    zip_code: "33101",
    status: "pending_live_handoff",
    qualification_score: 55,
    tobacco_user: false,
    annual_income: 72000,
    coverage_amount_requested: 400000,
    health_notes: { conditions: ["high cholesterol", "mild asthma"], medications: ["atorvastatin", "albuterol"], last_checkup: "2026-03" },
    created_at: daysAgo(26),
  },

  // 2 closed_won
  {
    id: "a1b2c3d4-0001-4000-8000-000000000011",
    first_name: "Christopher",
    last_name: "Lee",
    email: "clee@email.com",
    phone: "(212) 555-0988",
    date_of_birth: "1987-01-25",
    state: "NY",
    zip_code: "10001",
    status: "closed_won",
    qualification_score: 94,
    tobacco_user: false,
    annual_income: 165000,
    coverage_amount_requested: 1000000,
    health_notes: { conditions: [], medications: [], last_checkup: "2026-06" },
    created_at: daysAgo(46),
  },
  {
    id: "a1b2c3d4-0001-4000-8000-000000000012",
    first_name: "Patricia",
    last_name: "Johnson",
    email: "pjohnson@email.com",
    phone: "(702) 555-0411",
    date_of_birth: "1972-10-08",
    state: "NV",
    zip_code: "89101",
    status: "closed_won",
    qualification_score: 82,
    tobacco_user: false,
    annual_income: 130000,
    coverage_amount_requested: 500000,
    health_notes: { conditions: [], medications: [], last_checkup: "2026-04" },
    created_at: daysAgo(41),
  },
];

// ── Mock Quotes ─────────────────────────────────────────────────────────────
export const mockQuotes: Quote[] = [
  // Christopher Lee quotes
  {
    id: "q-0001",
    lead_id: "a1b2c3d4-0001-4000-8000-000000000011",
    carrier_name: "Banner Life",
    policy_type: "term",
    term_length_years: 20,
    coverage_amount: 1000000,
    monthly_premium: 42.50,
    annual_premium: 510.00,
    status: "accepted",
  },
  {
    id: "q-0002",
    lead_id: "a1b2c3d4-0001-4000-8000-000000000011",
    carrier_name: "Prudential",
    policy_type: "whole_life",
    term_length_years: null,
    coverage_amount: 500000,
    monthly_premium: 385.00,
    annual_premium: 4620.00,
    status: "presented",
  },
  // Patricia Johnson quotes
  {
    id: "q-0003",
    lead_id: "a1b2c3d4-0001-4000-8000-000000000012",
    carrier_name: "AIG",
    policy_type: "term",
    term_length_years: 30,
    coverage_amount: 500000,
    monthly_premium: 65.75,
    annual_premium: 789.00,
    status: "accepted",
  },
  // Lisa Patel quotes
  {
    id: "q-0004",
    lead_id: "a1b2c3d4-0001-4000-8000-000000000008",
    carrier_name: "Lincoln Financial",
    policy_type: "term",
    term_length_years: 20,
    coverage_amount: 750000,
    monthly_premium: 38.25,
    annual_premium: 459.00,
    status: "draft",
  },
  {
    id: "q-0005",
    lead_id: "a1b2c3d4-0001-4000-8000-000000000008",
    carrier_name: "Pacific Life",
    policy_type: "universal_life",
    term_length_years: null,
    coverage_amount: 750000,
    monthly_premium: 210.00,
    annual_premium: 2520.00,
    status: "presented",
  },
  // Thomas Washington quote
  {
    id: "q-0006",
    lead_id: "a1b2c3d4-0001-4000-8000-000000000009",
    carrier_name: "Mutual of Omaha",
    policy_type: "term",
    term_length_years: 15,
    coverage_amount: 250000,
    monthly_premium: 89.50,
    annual_premium: 1074.00,
    status: "draft",
  },
];

// ── Mock Conversations ──────────────────────────────────────────────────────
export const mockConversations: Conversation[] = [
  {
    id: "conv-0001",
    lead_id: "a1b2c3d4-0001-4000-8000-000000000008", // Lisa Patel
    channel: "voice",
    direction: "outbound",
    summary:
      "Lisa is interested in a 20-year term policy. Discussed health history — no major issues. She is comparing rates with two other carriers.",
    sentiment_score: 0.72,
    key_objections: ["price_comparison", "wants_to_think_about_it"],
    messages: [
      {
        id: "msg-001",
        sender_role: "ai",
        content:
          "Hello, is this Lisa? This is Alex from Apex Life AI. I'm following up on your request for a life insurance quote. Do you have a few minutes?",
      },
      {
        id: "msg-002",
        sender_role: "lead",
        content:
          "Yes, this is Lisa. I have about 10 minutes. What do you need from me?",
      },
      {
        id: "msg-003",
        sender_role: "ai",
        content:
          "Great, thank you! Just a quick overview — I have your basic info from the form you filled out. You're looking for $750,000 in coverage, is that right? And you're located in California?",
      },
      {
        id: "msg-004",
        sender_role: "lead",
        content:
          "Yes, that's correct. I want to make sure my family is protected. I've been looking at a few options online.",
      },
      {
        id: "msg-005",
        sender_role: "ai",
        content:
          "That's a smart move, Lisa. Let me run a few carrier quotes for you. Based on your profile — 35, non-smoker, good health — I'm seeing competitive rates. I'll send you a proposal with a few options to review. When would be a good time to follow up?",
      },
    ],
  },
  {
    id: "conv-0002",
    lead_id: "a1b2c3d4-0001-4000-8000-000000000009", // Thomas Washington
    channel: "sms",
    direction: "outbound",
    summary:
      "Thomas has type 2 diabetes and is a tobacco user. He needs $250K coverage. Rates are higher due to health classification. He's hesitant about the premium cost.",
    sentiment_score: 0.45,
    key_objections: ["too_expensive", "health_concerns", "needs_spouse_input"],
    messages: [
      {
        id: "msg-006",
        sender_role: "ai",
        content:
          "Hi Thomas! This is Alex with Apex Life AI. I'm reaching out about your life insurance inquiry. Is now a good time to chat via text?",
      },
      {
        id: "msg-007",
        sender_role: "lead",
        content: "Yeah I can text. What carriers do you work with?",
      },
      {
        id: "msg-008",
        sender_role: "ai",
        content:
          "We work with over 20 top-rated carriers including Banner, AIG, and Prudential. I see you requested $250K in coverage — is that still accurate? Also, I want to make sure we get you the best rate — do you currently use any tobacco products?",
      },
      {
        id: "msg-009",
        sender_role: "lead",
        content:
          "Yes, $250K. And yeah I smoke about half a pack a day. Also I take metformin for diabetes. Will that affect my rates?",
      },
      {
        id: "msg-010",
        sender_role: "ai",
        content:
          "I appreciate your honesty, Thomas. Being upfront helps us find you the best policy. Tobacco use and diabetes will affect the premium, but we have carriers that specialize in these situations. Let me put together a quote and I'll have something for you shortly.",
      },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
export function getLeadsByStatus(status: LeadStatus): Lead[] {
  return mockLeads.filter((l) => l.status === status);
}

export function getLeadById(id: string): Lead | undefined {
  return mockLeads.find((l) => l.id === id);
}

export function getQuotesForLead(leadId: string): Quote[] {
  return mockQuotes.filter((q) => q.lead_id === leadId);
}

export function getConversationsForLead(leadId: string): Conversation[] {
  return mockConversations.filter((c) => c.lead_id === leadId);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getDaysSince(dateStr: string): number {
  const now = new Date();
  const then = new Date(dateStr);
  const diff = now.getTime() - then.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getScoreColor(score: number | null): string {
  if (score === null) return "bg-slate-600 text-slate-300";
  if (score >= 80) return "bg-emerald-500/20 text-emerald-400";
  if (score >= 60) return "bg-amber-500/20 text-amber-400";
  return "bg-red-500/20 text-red-400";
}
