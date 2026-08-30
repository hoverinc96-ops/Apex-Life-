export type TeamRole = "owner" | "rep";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  created_at: string;
}

export type HandoffStatus = "queued" | "claimed" | "completed" | "declined";

export type HandoffPriority = "normal" | "high" | "urgent";

export interface Reassignment {
  from_rep_id: string;
  from_rep_name: string;
  to_rep_id: string;
  to_rep_name: string;
  reason?: string | null;
  at: string;
}

export interface QuoteReference {
  quote_id: string;
  carrier_name: string | null;
  policy_type: string | null;
  coverage_amount: number | null;
  monthly_premium: number | null;
  status: string | null;
}

export interface HandoffContext {
  ai_qualification_summary?: string | null;
  qualification_score?: number | null;
  key_objections?: string[] | null;
  conversation_summary?: string | null;
  ai_agent_id?: string | null;
  sentiment_score?: number | null;
  quote_reference?: QuoteReference | null;
  handed_to?: { rep_id: string; rep_name: string } | null;
  reassignments?: Reassignment[] | null;
}

export interface Handoff {
  id: string;
  lead_id: string;
  rep_id: string;
  status: HandoffStatus;
  priority: HandoffPriority;
  context: HandoffContext;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  rep_name: string;
}

export const ROLE_CAPABILITIES: {
  role: TeamRole;
  label: string;
  points: string[];
}[] = [
  {
    role: "owner",
    label: "Owner",
    points: [
      "Full control of the CRM — sees all leads in every pipeline stage",
      "Manages team members (adds owners and reps)",
      "Assigns leads and hands off qualified leads to reps",
      "Can take over and work any lead directly",
    ],
  },
  {
    role: "rep",
    label: "Rep",
    points: [
      "Works leads assigned to them in the CRM",
      "Sees their handoff inbox of AI-qualified leads",
      "Claims, works, and closes their assigned leads",
      "Access is scoped to their own handoffs and assigned leads",
    ],
  },
];
