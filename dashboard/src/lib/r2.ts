import { createHmac, createHash } from "crypto";
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";

const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY || "";
const R2_SECRET_KEY = process.env.R2_SECRET_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "augurms-client";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

export function isR2Configured(): boolean {
  return !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY);
}

function signRequest(method: string, objectKey: string, payloadHash: string, contentLength: number) {
  const date = new Date();
  const amzDate = date.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const dateStamp = amzDate.slice(0, 8);

  const region = "auto";
  const service = "s3";
  const canonicalUri = `/${R2_BUCKET}/${objectKey}`;
  const host = new URL(R2_ENDPOINT).host;

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

  return {
    authorization,
    amzDate,
    payloadHash,
    url: `${R2_ENDPOINT}/${R2_BUCKET}/${objectKey}`,
  };
}

/** Upload a Buffer to R2 (fine for small files < 50MB) */
export async function uploadToR2(
  objectKey: string,
  body: Buffer
): Promise<{ success: boolean; url: string; error?: string }> {
  if (!isR2Configured()) {
    return { success: false, url: "", error: "R2 credentials not configured" };
  }

  try {
    const payloadHash = createHash("sha256").update(body).digest("hex");
    const sig = signRequest("PUT", objectKey, payloadHash, body.length);

    const res = await fetch(sig.url, {
      method: "PUT",
      headers: {
        Authorization: sig.authorization,
        "x-amz-content-sha256": sig.payloadHash,
        "x-amz-date": sig.amzDate,
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
      : sig.url;

    return { success: true, url: publicUrl };
  } catch (err: any) {
    return { success: false, url: "", error: err.message };
  }
}

/** Stream a file to R2 without loading it into memory. Uses UNSIGNED-PAYLOAD. */
export async function uploadFileToR2(
  objectKey: string,
  filePath: string
): Promise<{ success: boolean; url: string; hash: string; size: number; error?: string }> {
  if (!isR2Configured()) {
    return { success: false, url: "", hash: "", size: 0, error: "R2 credentials not configured" };
  }

  try {
    const fileSize = statSync(filePath).size;

    // Compute SHA-256 by streaming (for manifest, not for auth)
    const hash = await new Promise<string>((resolve, reject) => {
      const h = createHash("sha256");
      const s = createReadStream(filePath);
      s.on("data", (chunk) => h.update(chunk));
      s.on("end", () => resolve(h.digest("hex")));
      s.on("error", reject);
    });

    // Use UNSIGNED-PAYLOAD so we don't need to hash the body for auth
    const sig = signRequest("PUT", objectKey, "UNSIGNED-PAYLOAD", fileSize);

    // Stream file as request body
    const fileStream = createReadStream(filePath);
    const readable = Readable.toWeb(fileStream) as ReadableStream;

    const res = await fetch(sig.url, {
      method: "PUT",
      headers: {
        Authorization: sig.authorization,
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
        "x-amz-date": sig.amzDate,
        "Content-Length": String(fileSize),
      },
      body: readable,
      // @ts-ignore — Node fetch supports duplex
      duplex: "half",
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, url: "", hash: "", size: 0, error: `R2 upload failed: ${res.status} ${text}` };
    }

    const publicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${objectKey}`
      : sig.url;

    return { success: true, url: publicUrl, hash, size: fileSize };
  } catch (err: any) {
    return { success: false, url: "", hash: "", size: 0, error: err.message };
  }
}
