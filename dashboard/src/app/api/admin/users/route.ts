import { NextRequest, NextResponse } from "next/server";
import {
  createAdminUser,
  findAdminUser,
  listAdminUsers,
  getSession,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-z0-9_-]{3,64}$/i;
const MIN_PASSWORD_LEN = 8;

export async function GET() {
  const users = await listAdminUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const role = typeof body.role === "string" ? body.role.trim() : "admin";

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "username must be 3–64 chars, letters/digits/underscore/hyphen only" },
      { status: 400 }
    );
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `password must be at least ${MIN_PASSWORD_LEN} characters` },
      { status: 400 }
    );
  }

  // Don't allow shadowing the env-var bootstrap admin — if someone created a
  // DB row with the same username, the DB row would silently win on login and
  // the env-var fallback would stop working.
  if (process.env.ADMIN_USER && username === process.env.ADMIN_USER) {
    return NextResponse.json(
      { error: `Username "${username}" is reserved by the bootstrap admin (ADMIN_USER env)` },
      { status: 409 }
    );
  }

  const existing = await findAdminUser(username);
  if (existing) {
    return NextResponse.json({ error: `User "${username}" already exists` }, { status: 409 });
  }

  const session = await getSession();
  await createAdminUser({
    username,
    password,
    role,
    createdBy: session?.sub || null,
  });

  return NextResponse.json({ ok: true });
}
