import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(_request: NextRequest) {
  try {
    const rows = await query(
      "SELECT id, `name`, banned, banreason, createdat FROM accounts ORDER BY id ASC LIMIT 100",
    );
    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to query accounts. Is the database running?", details: err.message },
      { status: 500 },
    );
  }
}
