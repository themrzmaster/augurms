import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { deleteAdminUser, updateAdminUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LEN = 8;

async function loadUser(id: number) {
  const rows = await query<any>(
    "SELECT id, username, role, disabled FROM admin_users WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const user = await loadUser(id);
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const updates: { password?: string; disabled?: boolean; role?: string } = {};

  if (typeof body.password === "string") {
    if (body.password.length < MIN_PASSWORD_LEN) {
      return NextResponse.json(
        { error: `password must be at least ${MIN_PASSWORD_LEN} characters` },
        { status: 400 }
      );
    }
    updates.password = body.password;
  }
  if (typeof body.disabled === "boolean") {
    updates.disabled = body.disabled;
  }
  if (typeof body.role === "string") {
    updates.role = body.role.trim();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no updatable fields supplied" }, { status: 400 });
  }

  await updateAdminUser(id, updates);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const user = await loadUser(id);
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Require disable before delete so we never lose audit history accidentally.
  if (!user.disabled) {
    return NextResponse.json(
      { error: "Disable the user first, then delete." },
      { status: 409 }
    );
  }

  await deleteAdminUser(id);
  return NextResponse.json({ ok: true });
}
