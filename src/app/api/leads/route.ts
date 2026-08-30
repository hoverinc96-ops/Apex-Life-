import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const source = searchParams.get("source");

    let query = "SELECT * FROM leads";
    const params: string[] = [];
    const where: string[] = [];

    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (source) {
      params.push(source);
      where.push(`source = $${params.length}`);
    }

    if (where.length > 0) query += " WHERE " + where.join(" AND ");

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);
    return NextResponse.json(result.rows);
  } catch (err) {
    console.error("GET /api/leads error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { first_name, last_name, email, phone, state } = body;

    // Validate required fields
    const missing: string[] = [];
    if (!first_name) missing.push("first_name");
    if (!last_name) missing.push("last_name");
    if (!email) missing.push("email");
    if (!phone) missing.push("phone");
    if (!state) missing.push("state");

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `INSERT INTO leads (first_name, last_name, email, phone, state, status)
       VALUES ($1, $2, $3, $4, $5, 'new')
       RETURNING *`,
      [first_name, last_name, email, phone, state]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/leads error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
