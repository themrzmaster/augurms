import { NextRequest, NextResponse } from "next/server";
import { uploadFileToR2, uploadToR2, isR2Configured } from "@/lib/r2";
import { dispatchWzToNx } from "@/lib/wz-to-nx";
import { restartGameServer } from "@/lib/fly-restart";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

// 1 GB cap. Map.wz is the heaviest at ~640 MB, so this leaves headroom but
// catches accidental uploads of, e.g., a full disk image.
const MAX_BYTES = 1024 * 1024 * 1024;

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

function readManifest(): { manifest: Manifest; path: string } {
  const VOLUME_MANIFEST = join(
    process.env.COSMIC_ROOT || "/cosmic",
    "launcher-manifest.json"
  );
  const BUNDLED_MANIFEST = join(process.cwd(), "launcher-manifest.json");
  const path = existsSync(VOLUME_MANIFEST) ? VOLUME_MANIFEST : BUNDLED_MANIFEST;
  const manifest = JSON.parse(readFileSync(path, "utf-8")) as Manifest;
  return { manifest, path };
}

export async function POST(request: NextRequest) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 credentials not configured" },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Body must be multipart/form-data" },
      { status: 400 }
    );
  }

  const name = String(form.get("name") || "").trim();
  const file = form.get("file");
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "file is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (${file.size} bytes, max ${MAX_BYTES})` },
      { status: 413 }
    );
  }

  const { manifest, path: manifestPath } = (() => {
    try {
      return readManifest();
    } catch (err: any) {
      throw new Error(`Failed to read launcher manifest: ${err.message}`);
    }
  })();

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

  // Stream the upload to a temp file so we don't buffer it all in memory.
  const tempPath = join(tmpdir(), `wz-upload-${randomUUID()}.bin`);
  try {
    const readable = Readable.fromWeb(file.stream() as any);
    await pipeline(readable, createWriteStream(tempPath));

    const upload = await uploadFileToR2(name, tempPath);
    if (!upload.success) {
      return NextResponse.json(
        { error: `R2 upload failed: ${upload.error}` },
        { status: 502 }
      );
    }

    let newVersion: string | undefined;
    let serverRestart: { success: boolean; error?: string; machineId?: string } | undefined;

    if (isServerTarball) {
      // Mirror the items/publish flow: drop a version marker so the server's
      // entrypoint picks up the new tar, then restart.
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
      manifestEntry.hash = upload.hash;
      manifestEntry.size = upload.size;
      const parts = (manifest.version || "1.0.0").split(".");
      parts[2] = String(parseInt(parts[2] || "0") + 1);
      manifest.version = parts.join(".");
      manifest.updatedAt = new Date().toISOString();
      newVersion = manifest.version;

      const VOLUME_MANIFEST = join(
        process.env.COSMIC_ROOT || "/cosmic",
        "launcher-manifest.json"
      );
      mkdirSync(dirname(VOLUME_MANIFEST), { recursive: true });
      writeFileSync(VOLUME_MANIFEST, JSON.stringify(manifest, null, 2));

      // WZ → NX only for *.wz files; dlls / config / exe stay launcher-only.
      if (name.toLowerCase().endsWith(".wz")) {
        dispatchWzToNx([name]).catch(() => {});
      }
    }

    return NextResponse.json({
      ok: true,
      name,
      hash: upload.hash,
      size: upload.size,
      version: newVersion,
      manifestPath: manifestEntry ? manifestPath : null,
      serverRestart,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    try {
      rmSync(tempPath, { force: true });
    } catch {}
  }
}
