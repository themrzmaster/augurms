import { NextResponse } from "next/server";

const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY || "";
const R2_SECRET_KEY = process.env.R2_SECRET_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "augurms-client";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

// Upload a file to R2 using S3-compatible PutObject
async function uploadToR2(
  key: string,
  body: Buffer
): Promise<{ success: boolean; url: string; error?: string }> {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY) {
    return { success: false, url: "", error: "R2 credentials not configured" };
  }

  try {
    // Use AWS S3 v4 signature
    const url = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
    const date = new Date();
    const amzDate = date.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const dateStamp = amzDate.slice(0, 8);

    // For simplicity, use the @aws-sdk/client-s3 approach via fetch with presigned-like headers
    // Actually, let's use a simpler approach: direct PUT with basic auth headers
    const { createHmac, createHash } = await import("crypto");

    const region = "auto";
    const service = "s3";
    const method = "PUT";
    const canonicalUri = `/${R2_BUCKET}/${key}`;
    const host = new URL(R2_ENDPOINT).host;

    const payloadHash = createHash("sha256").update(body).digest("hex");

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      method,
      canonicalUri,
      "", // query string
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    const signingKey = (key: string, data: string) =>
      createHmac("sha256", key).update(data).digest();

    let kDate = signingKey("AWS4" + R2_SECRET_KEY, dateStamp);
    let kRegion = createHmac("sha256", kDate).update(region).digest();
    let kService = createHmac("sha256", kRegion).update(service).digest();
    let kSigning = createHmac("sha256", kService)
      .update("aws4_request")
      .digest();

    const signature = createHmac("sha256", kSigning)
      .update(stringToSign)
      .digest("hex");

    const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${key}`, {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        "Content-Length": String(body.length),
      },
      body: new Uint8Array(body),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, url: "", error: `R2 upload failed: ${res.status} ${text}` };
    }

    const publicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;

    return { success: true, url: publicUrl };
  } catch (err: any) {
    return { success: false, url: "", error: err.message };
  }
}

// POST: Upload files to R2 (accepts multipart form data or JSON with base64)
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
    for (const file of body.files) {
      if (file.path && fs.existsSync(file.path)) {
        const data = fs.readFileSync(file.path);
        const result = await uploadToR2(file.name || require("path").basename(file.path), data);
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
