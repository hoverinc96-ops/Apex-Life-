import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { serializeRows, serialize } from "@/lib/serialize";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role, created_at
       FROM team_members ORDER BY created_at ASC`
    );
    return NextResponse.json(serializeRows(result.rows));
  } catch (err) {
    console.error("GET /api/team error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, email, role } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "A name of at least 2 characters is required." }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (role !== "owner" && role !== "rep") {
    return NextResponse.json({ error: "role must be 'owner' or 'rep'." }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `INSERT INTO team_members (name, email, role)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.trim().toLowerCase(), role]
    );
    return NextResponse.json(serialize(result.rows[0]), { status: 201 });
  } catch (err) {
    // Non-null UNIQUE(email) violation -> duplicate
    if ((err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "A member with that email already exists." }, { status: 409 });
    }
    console.error("POST /api/team error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
