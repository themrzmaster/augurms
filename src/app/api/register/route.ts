import { NextRequest, NextResponse } from "next/server";
import { hashPassword, checkRateLimit } from "@/lib/auth";
import { query, execute } from "@/lib/db";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";

  if (!checkRateLimit(ip, 3, 60_000)) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429 }
    );
  }

  const { username, password } = await request.json();

  // Validate username: 4-12 chars, alphanumeric
  if (!username || !/^[a-zA-Z0-9]{4,12}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 4-12 alphanumeric characters" },
      { status: 400 }
    );
  }

  // Validate password: 6-30 chars
  if (!password || password.length < 6 || password.length > 30) {
    return NextResponse.json(
      { error: "Password must be 6-30 characters" },
      { status: 400 }
    );
  }

  // Check for duplicate username
  const existing = await query<{ id: number }>(
    "SELECT id FROM accounts WHERE name = ?",
    [username]
  );

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Username already taken" },
      { status: 409 }
    );
  }

  // Hash password with bcrypt (salt rounds 12, compatible with Java BCrypt)
  const hashedPassword = await hashPassword(password);

  // Insert into accounts table
  await execute(
    `INSERT INTO accounts (name, password, birthday, tempban, greason, tos)
     VALUES (?, ?, '2000-01-01', '2000-01-01 00:00:00', 0, 1)`,
    [username, hashedPassword]
  );

  return NextResponse.json({ ok: true, message: "Account created successfully" });
}
