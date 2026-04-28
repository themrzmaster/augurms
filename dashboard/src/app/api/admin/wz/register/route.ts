import { NextRequest, NextResponse } from "next/server";
import { isR2Configured, uploadToR2 } from "@/lib/r2";
import { dispatchWzToNx } from "@/lib/wz-to-nx";
import { restartGameServer } from "@/lib/fly-restart";
import { Readable } from "stream";
import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";

// Companion to /api/admin/wz/upload. When a WZ file is too large to push
// through the dashboard (Cloudflare body cap is 100 MB on Free/Pro, 500 MB
// on Enterprise — Map.wz at 638 MB beats every plan), the admin can upload
// the binary directly to R2 with `wrangler r2 object put` and then call
// this route to (a) verify the file landed, (b) record its hash + size in
// the launcher manifest, (c) dispatch wz-to-nx, (d) for server-wz.tar.gz,
// drop a version marker and restart the game server.

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

const SERVER_TARBALL = "server-wz.tar.gz";

interface ManifestFile {
  name: string;
  hash: string;
  size: number;
  url: string;
  hd?: boolean;
}
interface Manifest {
  version: string;
  updatedAt?: string;
  files: ManifestFile[];
  downloadBase?: string;
}

function readManifest(): { manifest: Manifest; volumePath: string } {
  const VOLUME_MANIFEST = join(
    process.env.COSMIC_ROOT || "/cosmic",
    "launcher-manifest.json"
  );
  const BUNDLED_MANIFEST = join(process.cwd(), "launcher-manifest.json");
  const path = existsSync(VOLUME_MANIFEST) ? VOLUME_MANIFEST : BUNDLED_MANIFEST;
  const manifest = JSON.parse(readFileSync(path, "utf-8")) as Manifest;
  return { manifest, volumePath: VOLUME_MANIFEST };
}

/** Stream the file from R2 to compute size + sha256 without buffering it. */
async function streamHash(
  url: string
): Promise<{ size: number; hash: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `R2 returned HTTP ${res.status} for ${url} — has the file been uploaded yet?`
    );
  }
  if (!res.body) throw new Error(`No body when fetching ${url}`);
  const stream = Readable.fromWeb(res.body as any);
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { size, hash: hash.digest("hex") };
}

export async function POST(request: NextRequest) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 credentials not configured" },
      { status: 500 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be JSON" },
      { status: 400 }
    );
  }

  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  let manifestData: { manifest: Manifest; volumePath: string };
  try {
    manifestData = readManifest();
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to read manifest: ${err.message}` },
      { status: 500 }
    );
  }
  const { manifest, volumePath } = manifestData;

  const isServerTarball = name === SERVER_TARBALL;
  const manifestEntry = manifest.files.find((f) => f.name === name);

  if (!isServerTarball && !manifestEntry) {
    return NextResponse.json(
      {
        error: `${name} is not in the launcher manifest. Allowed: ${manifest.files
          .map((f) => f.name)
          .concat(SERVER_TARBALL)
          .join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    const url = `${R2_PUBLIC_URL}/${name}`;
    const { size, hash } = await streamHash(url);

    let newVersion: string | undefined;
    let serverRestart:
      | { success: boolean; error?: string; machineId?: string }
      | undefined;

    if (isServerTarball) {
      try {
        await uploadToR2(
          "server-wz.version",
          Buffer.from(new Date().toISOString())
        );
      } catch {}
      try {
        const machineId = await restartGameServer();
        serverRestart = { success: true, machineId };
      } catch (err: any) {
        serverRestart = { success: false, error: err.message };
      }
    } else if (manifestEntry) {
      manifestEntry.hash = hash;
      manifestEntry.size = size;
      const parts = (manifest.version || "1.0.0").split(".");
      parts[2] = String(parseInt(parts[2] || "0") + 1);
      manifest.version = parts.join(".");
      manifest.updatedAt = new Date().toISOString();
      newVersion = manifest.version;

      mkdirSync(dirname(volumePath), { recursive: true });
      writeFileSync(volumePath, JSON.stringify(manifest, null, 2));

      if (name.toLowerCase().endsWith(".wz")) {
        dispatchWzToNx([name]).catch(() => {});
      }
    }

    return NextResponse.json({
      ok: true,
      name,
      hash,
      size,
      version: newVersion,
      serverRestart,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
