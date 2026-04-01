import { createHmac, createHash } from "crypto";

const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY || "";
const R2_SECRET_KEY = process.env.R2_SECRET_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "augurms-client";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

export function isR2Configured(): boolean {
  return !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY);
}

export async function uploadToR2(
  objectKey: string,
  body: Buffer
): Promise<{ success: boolean; url: string; error?: string }> {
  if (!isR2Configured()) {
    return { success: false, url: "", error: "R2 credentials not configured" };
  }

  try {
    const date = new Date();
    const amzDate = date.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const dateStamp = amzDate.slice(0, 8);

    const region = "auto";
    const service = "s3";
    const method = "PUT";
    const canonicalUri = `/${R2_BUCKET}/${objectKey}`;
    const host = new URL(R2_ENDPOINT).host;

    const payloadHash = createHash("sha256").update(body).digest("hex");

    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      method,
      canonicalUri,
      "",
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

    const kDate = createHmac("sha256", "AWS4" + R2_SECRET_KEY)
      .update(dateStamp)
      .digest();
    const kRegion = createHmac("sha256", kDate).update(region).digest();
    const kService = createHmac("sha256", kRegion).update(service).digest();
    const kSigning = createHmac("sha256", kService)
      .update("aws4_request")
      .digest();

    const signature = createHmac("sha256", kSigning)
      .update(stringToSign)
      .digest("hex");

    const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${objectKey}`, {
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
      ? `${R2_PUBLIC_URL}/${objectKey}`
      : `${R2_ENDPOINT}/${R2_BUCKET}/${objectKey}`;

    return { success: true, url: publicUrl };
  } catch (err: any) {
    return { success: false, url: "", error: err.message };
  }
}
