import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyPassword, sessionCookie, checkRateLimit } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a minute." },
      { status: 429 }
    );
  }

  const { username, password } = await request.json();

  const adminUser = process.env.ADMIN_USER;
  const adminPassHash = process.env.ADMIN_PASS_HASH;

  if (!adminUser || !adminPassHash) {
    return NextResponse.json(
      { error: "Admin credentials not configured" },
      { status: 500 }
    );
  }

  if (username !== adminUser || !(await verifyPassword(password, adminPassHash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signToken({ sub: adminUser, role: "admin" });
  const cookie = sessionCookie(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookie);
  return response;
}
