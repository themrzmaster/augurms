import { NextRequest, NextResponse } from "next/server";
import { uploadToR2, isR2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

/**
 * POST /api/admin/items/render-weapon
 *
 * Receives pre-rendered weapon frames (from client-side Three.js) and uploads to R2.
 * Body: { itemId, icon (base64), origins, frames: { animName: [base64, ...] } }
 * Returns: { origins, frames: { animName: [url, ...] }, iconUrl }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, icon, origins, frames } = body;

    if (!itemId || !frames || !origins) {
      return NextResponse.json(
        { error: "itemId, origins, and frames are required" },
        { status: 400 }
      );
    }

    const frameUrls: Record<string, string[]> = {};
    let iconUrl: string | null = null;
    const uploadResults: string[] = [];

    // Upload icon
    if (icon) {
      const iconBuf = Buffer.from(icon.replace(/^data:image\/png;base64,/, ""), "base64");
      if (isR2Configured()) {
        const r2Key = `custom-items/${itemId}/icon.png`;
        const result = await uploadToR2(r2Key, iconBuf);
        if (result.success) {
          iconUrl = `${R2_PUBLIC_URL}/${r2Key}`;
          uploadResults.push("Uploaded icon.png");
        }
      } else {
        iconUrl = icon; // Keep data URL for local dev
      }
    }

    // Upload animation frames
    for (const [animName, dataUrls] of Object.entries(frames as Record<string, string[]>)) {
      frameUrls[animName] = [];

      for (let i = 0; i < dataUrls.length; i++) {
        const dataUrl = dataUrls[i];
        const pngBuf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");

        if (isR2Configured()) {
          const r2Key = `custom-items/${itemId}/${animName}/${i}.png`;
          const result = await uploadToR2(r2Key, pngBuf);
          if (result.success) {
            frameUrls[animName].push(`${R2_PUBLIC_URL}/${r2Key}`);
            uploadResults.push(`Uploaded ${animName}/${i}.png`);
          }
        } else {
          frameUrls[animName].push(dataUrl); // Keep data URL for local dev
        }
      }
    }

    // Upload origins.json
    if (isR2Configured()) {
      const originsKey = `custom-items/${itemId}/origins.json`;
      await uploadToR2(originsKey, Buffer.from(JSON.stringify(origins)));
    }

    return NextResponse.json({
      success: true,
      origins,
      frames: frameUrls,
      iconUrl,
      uploaded: uploadResults.length,
      message: isR2Configured()
        ? `Uploaded ${uploadResults.length} files to R2`
        : `${Object.values(frameUrls).flat().length} frames ready (R2 not configured, using data URLs)`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Upload failed: ${err.message}` },
      { status: 500 }
    );
  }
}
