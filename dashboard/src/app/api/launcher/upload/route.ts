import { NextResponse } from "next/server";
import { uploadToR2 } from "@/lib/r2";

// POST: Upload files to R2 (accepts multipart form data or JSON with file paths)
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  // JSON mode: accept file info for manifest-only updates
  if (contentType.includes("application/json")) {
    const body = await request.json();

    if (!body.files || !Array.isArray(body.files)) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Files with paths = upload from server filesystem
    const results = [];
    const fs = await import("fs");
    const path = await import("path");
    for (const file of body.files) {
      if (file.path && fs.existsSync(file.path)) {
        const data = fs.readFileSync(file.path);
        const result = await uploadToR2(file.name || path.basename(file.path), data);
        results.push({ name: file.name, ...result });
      }
    }

    return NextResponse.json({ results });
  }

  // Multipart mode: direct file upload
  try {
    const formData = await request.formData();
    const results = [];

    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        const buffer = Buffer.from(await value.arrayBuffer());
        const result = await uploadToR2(value.name || key, buffer);
        results.push({ name: value.name || key, ...result });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
