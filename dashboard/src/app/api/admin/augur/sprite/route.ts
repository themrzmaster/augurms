import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "fs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync("/tmp/augur-sprite.png", buffer);

    return NextResponse.json({ success: true, size: buffer.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
