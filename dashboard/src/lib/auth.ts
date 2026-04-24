import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { execute, query } from "@/lib/db";

const COOKIE_NAME = "augur_session";
const JWT_EXPIRY = "7d";

export interface AdminUserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  disabled: number;
  created_by: string | null;
  created_at: string;
  last_login_at: string | null;
}

export async function findAdminUser(username: string): Promise<AdminUserRow | null> {
  try {
    const rows = await query<AdminUserRow>(
      "SELECT * FROM admin_users WHERE username = ? LIMIT 1",
      [username]
    );
    return rows[0] || null;
  } catch {
    // Table may not exist yet (pre-migration); fall back to env-var only.
    return null;
  }
}

export async function listAdminUsers(): Promise<Omit<AdminUserRow, "password_hash">[]> {
  const rows = await query<AdminUserRow>(
    "SELECT id, username, role, disabled, created_by, created_at, last_login_at FROM admin_users ORDER BY username"
  );
  return rows as Omit<AdminUserRow, "password_hash">[];
}

export async function createAdminUser(opts: {
  username: string;
  password: string;
  role?: string;
  createdBy?: string | null;
}): Promise<void> {
  const hash = await hashPassword(opts.password);
  await execute(
    "INSERT INTO admin_users (username, password_hash, role, created_by) VALUES (?, ?, ?, ?)",
    [opts.username, hash, opts.role || "admin", opts.createdBy ?? null]
  );
}

export async function updateAdminUser(
  id: number,
  updates: { password?: string; disabled?: boolean; role?: string }
): Promise<void> {
  const fields: string[] = [];
  const params: any[] = [];
  if (typeof updates.password === "string") {
    fields.push("password_hash = ?");
    params.push(await hashPassword(updates.password));
  }
  if (typeof updates.disabled === "boolean") {
    fields.push("disabled = ?");
    params.push(updates.disabled ? 1 : 0);
  }
  if (typeof updates.role === "string") {
    fields.push("role = ?");
    params.push(updates.role);
  }
  if (fields.length === 0) return;
  params.push(id);
  await execute(`UPDATE admin_users SET ${fields.join(", ")} WHERE id = ?`, params);
}

export async function deleteAdminUser(id: number): Promise<void> {
  await execute("DELETE FROM admin_users WHERE id = ?", [id]);
}

export async function recordAdminLogin(id: number): Promise<void> {
  try {
    await execute("UPDATE admin_users SET last_login_at = NOW() WHERE id = ?", [id]);
  } catch {}
}

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is required");
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: { sub: string; role: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getSecret());
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as { sub: string; role: string; exp: number };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function sessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export function clearSessionCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

// Rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string, maxAttempts = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxAttempts) return false;
  entry.count++;
  return true;
}
