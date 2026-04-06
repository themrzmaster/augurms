import { NextRequest, NextResponse } from "next/server";
import { generateReactorFrames } from "@/lib/wz/reactor-animator";
import type { AnimationStyle } from "@/lib/wz/reactor-animator";

// POST: Generate animation preview frames from a PNG
// Returns base64-encoded PNG frames for client-side preview
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("png") as File;
    const style = (formData.get("style") as AnimationStyle) || "breakable";

    if (!file) {
      return NextResponse.json({ error: "PNG file required" }, { status: 400 });
    }

    const pngBuf = Buffer.from(await file.arrayBuffer());
    const frames = generateReactorFrames(pngBuf, style);

    return NextResponse.json({
      idle: frames.idle.toString("base64"),
      hit: frames.hit.map((f) => f.toString("base64")),
      break: frames.break.map((f) => f.toString("base64")),
      width: frames.width,
      height: frames.height,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
