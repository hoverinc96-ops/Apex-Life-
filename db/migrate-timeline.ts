import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Timeline seed — makes every demo lead's Timeline tab show a real,
 * chronological status progression instead of nothing.
 *
 * Idempotent: only fills status_history for leads that currently have NO
 * status_history rows (so it never double-records, and it never touches the
 * leads that already carry real recorded history from testing). The actor
 * column (changed_by) captures who/what caused each transition.
 */
const CHAINS: Record<string, { from: string; to: string; by: string }[]> = {
  qualified: [
    { from: "new", to: "qualified", by: "ai" },
  ],
  proposal_sent: [
    { from: "new", to: "qualified", by: "ai" },
    { from: "qualified", to: "proposal_sent", by: "ai" },
  ],
  in_negotiation: [
    { from: "new", to: "qualified", by: "ai" },
    { from: "qualified", to: "proposal_sent", by: "ai" },
    { from: "proposal_sent", to: "in_negotiation", by: "rep_action" },
  ],
  pending_live_handoff: [
    { from: "new", to: "qualified", by: "ai" },
    { from: "qualified", to: "proposal_sent", by: "ai" },
    { from: "proposal_sent", to: "in_negotiation", by: "rep_action" },
    { from: "in_negotiation", to: "pending_live_handoff", by: "handoff" },
  ],
  closed_won: [
    { from: "new", to: "qualified", by: "ai" },
    { from: "qualified", to: "proposal_sent", by: "ai" },
    { from: "proposal_sent", to: "in_negotiation", by: "rep_action" },
    { from: "in_negotiation", to: "closed_won", by: "rep_action" },
  ],
  closed_lost: [
    { from: "new", to: "qualified", by: "ai" },
    { from: "qualified", to: "proposal_sent", by: "ai" },
    { from: "proposal_sent", to: "in_negotiation", by: "rep_action" },
    { from: "in_negotiation", to: "closed_lost", by: "rep_action" },
  ],
};

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }
  console.log("Running timeline seed migration...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Ensure the actor column exists (idempotent).
    await client.query("ALTER TABLE status_history ADD COLUMN IF NOT EXISTS changed_by TEXT");

    const { rows } = await client.query(
      `SELECT l.id, l.status, l.created_at, COUNT(sh.id) AS hist_count
         FROM leads l
         LEFT JOIN status_history sh ON sh.lead_id = l.id
        GROUP BY l.id, l.status, l.created_at
        ORDER BY l.created_at`
    );

    let inserted = 0;
    for (const lead of rows) {
      // Only back-fill progress for leads with no recorded history at all.
      if (Number(lead.hist_count) > 0) continue;
      const chain = CHAINS[(lead.status as string)] ?? [];
      // Stagger events across the days after the lead was created.
      const base = new Date(lead.created_at);
      for (let i = 0; i < chain.length; i++) {
        const step = chain[i];
        const at = new Date(base.getTime() + (i + 1) * 24 * 3600 * 1000);
        await client.query(
          `INSERT INTO status_history (lead_id, from_status, to_status, changed_at, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [lead.id, step.from, step.to, at, step.by]
        );
        inserted++;
      }
    }
    await client.query("COMMIT");
    console.log(`Timeline seed completed: added ${inserted} status_history events.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Timeline seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
