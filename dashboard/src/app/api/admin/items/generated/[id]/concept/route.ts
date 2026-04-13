import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getGeneratedItem } from "@/lib/gm/generated-items";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/items/generated/{id}/concept
 *
 * Serves the concept PNG from /tmp/generated-items/{id}/concept.png — used
 * when R2 is not configured (local dev) so the review UI can still preview.
 * In prod, concept_image_url points directly at R2 and this route isn't hit.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await getGeneratedItem(parseInt(id));
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (item.concept_image_url) {
    return NextResponse.redirect(item.concept_image_url);
  }

  const path = join("/tmp", "generated-items", id, "concept.png");
  if (!existsSync(path)) {
    return NextResponse.json({ error: "Concept not found locally" }, { status: 404 });
  }
  const buf = readFileSync(path);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=60" },
  });
}
