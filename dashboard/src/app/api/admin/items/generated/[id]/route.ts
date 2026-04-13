import { NextRequest, NextResponse } from "next/server";
import { getGeneratedItem, updateGeneration } from "@/lib/gm/generated-items";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
// The publish job (WZ patch + R2 uploads + server restart) takes 2–5 minutes.
// Default Fly dashboard limit is 300s; 600 gives a comfortable cap.
export const maxDuration = 600;

const PUBLISH_POLL_INTERVAL_MS = 3000;
const PUBLISH_POLL_TIMEOUT_MS = 8 * 60_000;

interface PublishStatus {
  status: "idle" | "running" | "done" | "error";
  step?: string;
  error?: string;
  items_published?: number;
  version?: string;
  finishedAt?: string;
  actions?: string[];
}

async function waitForPublish(baseUrl: string, authHeaders: Record<string, string>): Promise<PublishStatus> {
  const deadline = Date.now() + PUBLISH_POLL_TIMEOUT_MS;
  let last: PublishStatus = { status: "idle" };
  while (Date.now() < deadline) {
    const res = await fetch(new URL("/api/admin/items/publish", baseUrl).toString(), {
      headers: authHeaders,
    });
    if (res.ok) {
      last = (await res.json()) as PublishStatus;
      if (last.status === "done" || last.status === "error") return last;
    }
    await new Promise((r) => setTimeout(r, PUBLISH_POLL_INTERVAL_MS));
  }
  return { ...last, status: "error", error: last.error ?? `Publish did not finish within ${PUBLISH_POLL_TIMEOUT_MS / 1000}s (last step: ${last.step ?? "unknown"})` };
}

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const item = await getGeneratedItem(parseInt(id));
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let iconUrl: string | null = null;
  let frames: Record<string, string[]> | null = null;
  let origins: Record<string, Array<{ gripX: number; gripY: number }>> | null = null;

  if (item.item_id) {
    const rows = await query<{ icon_url: string | null; stats: unknown }>(
      "SELECT icon_url, stats FROM custom_items WHERE item_id = ? LIMIT 1",
      [item.item_id]
    );
    if (rows[0]) {
      iconUrl = rows[0].icon_url;
      // mysql2 auto-decodes JSON columns, but older mariadb drivers may return strings.
      const stats =
        typeof rows[0].stats === "string"
          ? JSON.parse(rows[0].stats)
          : (rows[0].stats as Record<string, unknown> | null) ?? {};
      const wf = (stats as any)?._weaponFrames;
      frames = wf?.frames ?? null;
      origins = wf?.origins ?? null;
    }
  }

  return NextResponse.json({ item, assets: { iconUrl, frames, origins } });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const genId = parseInt(id);
  const body = await request.json();
  const action = body.action as "publish" | "reject" | undefined;
  if (!action) {
    return NextResponse.json({ error: "action required ('publish' or 'reject')" }, { status: 400 });
  }

  const item = await getGeneratedItem(genId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "reject") {
    await updateGeneration(genId, { status: "rejected" });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // publish
  if (item.status !== "ready") {
    return NextResponse.json(
      { error: `Can only publish items in 'ready' state (current: ${item.status})` },
      { status: 409 }
    );
  }

  // Forward whichever auth the incoming request carried (browser cookie OR
  // GM x-gm-secret) to the nested publish calls — otherwise middleware 401s
  // our own self-fetch.
  const cookie = request.headers.get("cookie") ?? "";
  const gmSecret = request.headers.get("x-gm-secret") ?? "";
  const authHeaders: Record<string, string> = {};
  if (cookie) authHeaders.cookie = cookie;
  if (gmSecret) authHeaders["x-gm-secret"] = gmSecret;

  const pub = await fetch(new URL("/api/admin/items/publish", request.url).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
  });
  if (!pub.ok) {
    const text = await pub.text();
    await updateGeneration(genId, { error: `publish kickoff failed: ${text}` });
    return NextResponse.json({ error: `Publish failed to start: ${text}` }, { status: 502 });
  }

  // The publish route is fire-and-forget — poll publish-status.json until the
  // background job actually completes, so callers (esp. the GM tool) get a
  // truthful success/failure signal instead of "started" masquerading as "done".
  const finalStatus = await waitForPublish(request.url, authHeaders);
  if (finalStatus.status === "error") {
    const errMsg = finalStatus.error ?? "publish job reported error with no message";
    await updateGeneration(genId, { error: errMsg });
    return NextResponse.json({ error: `Publish job failed: ${errMsg}`, publishStatus: finalStatus }, { status: 502 });
  }

  await updateGeneration(genId, { status: "published" });
  return NextResponse.json({
    ok: true,
    status: "published",
    items_published: finalStatus.items_published,
    launcherVersion: finalStatus.version,
  });
}
