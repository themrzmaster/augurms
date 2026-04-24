import { NextRequest, NextResponse } from "next/server";
import {
  signToken,
  verifyPassword,
  sessionCookie,
  checkRateLimit,
  findAdminUser,
  recordAdminLogin,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a minute." },
      { status: 429 }
    );
  }

  const { username, password } = await request.json();
  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // 1) Try DB-backed user first.
  const dbUser = await findAdminUser(username);
  if (dbUser) {
    if (dbUser.disabled) {
      return NextResponse.json({ error: "Account disabled" }, { status: 403 });
    }
    if (!(await verifyPassword(password, dbUser.password_hash))) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    await recordAdminLogin(dbUser.id);
    const token = await signToken({ sub: dbUser.username, role: dbUser.role });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie(token));
    return response;
  }

  // 2) Fallback: env-var bootstrap admin (always available so we can never
  //    get locked out by an empty/unreachable admin_users table).
  const adminUser = process.env.ADMIN_USER;
  const adminPassHash = process.env.ADMIN_PASS_HASH;

  if (
    adminUser &&
    adminPassHash &&
    username === adminUser &&
    (await verifyPassword(password, adminPassHash))
  ) {
    const token = await signToken({ sub: adminUser, role: "admin" });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie(token));
    return response;
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}
