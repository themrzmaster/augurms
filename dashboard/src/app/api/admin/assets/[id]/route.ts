import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["ready", "rejected"]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (typeof body.status === "string") {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${[...ALLOWED_STATUSES].join(", ")}` },
        { status: 400 }
      );
    }
    updates.push("status = ?");
    params.push(body.status);
  }
  if (typeof body.name === "string") {
    updates.push("name = ?");
    params.push(body.name.trim() || null);
  }
  if (typeof body.notes === "string") {
    updates.push("notes = ?");
    params.push(body.notes.trim() || null);
  }
  if (typeof body.source_version === "string") {
    updates.push("source_version = ?");
    params.push(body.source_version.trim() || null);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "no updatable fields supplied" }, { status: 400 });
  }

  params.push(id);
  await execute(
    `UPDATE custom_assets SET ${updates.join(", ")} WHERE id = ?`,
    params
  );

  const [row] = await query<any>("SELECT * FROM custom_assets WHERE id = ?", [id]);
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, asset: row });
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

  // Don't delete already-published rows from history — flip to rejected so we
  // keep an audit trail of what was once live. Pre-publish rows can disappear.
  const [row] = await query<{ status: string }>(
    "SELECT status FROM custom_assets WHERE id = ?",
    [id]
  );
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.status === "published") {
    return NextResponse.json(
      { error: "cannot delete a published asset; mark as rejected instead" },
      { status: 409 }
    );
  }
  await execute("DELETE FROM custom_assets WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
