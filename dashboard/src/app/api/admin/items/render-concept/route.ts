import { NextRequest, NextResponse } from "next/server";
import { renderWeaponFromConcept } from "@/lib/wz/sprite-2d";
import { uploadToR2, isR2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

/**
 * POST /api/admin/items/render-concept
 *
 * Runs the 2D sprite pipeline server-side from a concept image and uploads
 * the resulting icon + animation frames to R2. Same response shape as
 * /api/admin/items/render-weapon so the admin UI can treat them
 * interchangeably.
 *
 * Body: { itemId: number, concept: "data:image/png;base64,..." }
 * Returns: { origins, frames: { animName: [url, ...] }, iconUrl }
 */
export async function POST(request: NextRequest) {
  try {
    const { itemId, concept } = await request.json();
    if (!itemId || !concept) {
      return NextResponse.json(
        { error: "itemId and concept (data URL or base64 PNG) are required" },
        { status: 400 }
      );
    }

    const conceptPng = Buffer.from(concept.replace(/^data:image\/\w+;base64,/, ""), "base64");
    const rendered = await renderWeaponFromConcept({ conceptPng });

    const frameUrls: Record<string, string[]> = {};
    let iconUrl: string | null = null;
    const uploadResults: string[] = [];

    if (rendered.iconDataUrl) {
      const iconBuf = Buffer.from(rendered.iconDataUrl.replace(/^data:image\/\w+;base64,/, ""), "base64");
      if (isR2Configured()) {
        const r2Key = `custom-items/${itemId}/icon.png`;
        const result = await uploadToR2(r2Key, iconBuf);
        if (result.success) {
          iconUrl = `${R2_PUBLIC_URL}/${r2Key}`;
          uploadResults.push("icon.png");
        }
      } else {
        iconUrl = rendered.iconDataUrl;
      }
    }

    for (const [animName, dataUrls] of Object.entries(rendered.frames)) {
      frameUrls[animName] = [];
      for (let i = 0; i < dataUrls.length; i++) {
        const pngBuf = Buffer.from(dataUrls[i].replace(/^data:image\/\w+;base64,/, ""), "base64");
        if (isR2Configured()) {
          const r2Key = `custom-items/${itemId}/${animName}/${i}.png`;
          const result = await uploadToR2(r2Key, pngBuf);
          if (result.success) {
            frameUrls[animName].push(`${R2_PUBLIC_URL}/${r2Key}`);
            uploadResults.push(`${animName}/${i}.png`);
          }
        } else {
          frameUrls[animName].push(dataUrls[i]);
        }
      }
    }

    if (isR2Configured()) {
      const originsKey = `custom-items/${itemId}/origins.json`;
      await uploadToR2(originsKey, Buffer.from(JSON.stringify(rendered.origins)));
    }

    return NextResponse.json({
      success: true,
      origins: rendered.origins,
      frames: frameUrls,
      iconUrl,
      uploaded: uploadResults.length,
      message: isR2Configured()
        ? `Rendered + uploaded ${uploadResults.length} files`
        : `Rendered ${Object.values(frameUrls).flat().length} frames (R2 not configured, using data URLs)`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Render-concept failed: ${err.message}` },
      { status: 500 }
    );
  }
}
