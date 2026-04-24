import { NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { uploadFileToR2, isR2Configured } from "@/lib/r2";
import { dispatchWzToNx } from "@/lib/wz-to-nx";
import { restartGameServer } from "@/lib/fly-restart";
import { parseWzFile, saveWzFile, addImgToCharacterWz } from "@/lib/wz";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import {
  createWriteStream,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  statSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ||
  "https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev";

const STATUS_DIR = process.env.COSMIC_ROOT || "/cosmic";
const STATUS_FILE = join(STATUS_DIR, "assets-publish-status.json");

interface PublishStatus {
  id: string;
  status: "running" | "done" | "error";
  step: string;
  actions: string[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
  assets_published?: number;
  version?: string;
}

function writeStatus(s: PublishStatus) {
  try {
    writeFileSync(STATUS_FILE, JSON.stringify(s), "utf-8");
  } catch {}
}

function readStatus(): PublishStatus | null {
  try {
    if (!existsSync(STATUS_FILE)) return null;
    return JSON.parse(readFileSync(STATUS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

async function streamDownload(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} (${res.status})`);
  const body = res.body;
  if (!body) throw new Error(`No response body: ${url}`);
  const readable = Readable.fromWeb(body as any);
  await pipeline(readable, createWriteStream(outputPath));
}

interface AssetRow {
  id: number;
  asset_type: "hair" | "face";
  in_game_id: number;
  file_key: string;
  name: string | null;
}

async function runPublishJob(jobId: string) {
  const workDir = join(tmpdir(), `assets-publish-${jobId}`);
  const status: PublishStatus = {
    id: jobId,
    status: "running",
    step: "Starting...",
    actions: [],
    startedAt: new Date().toISOString(),
  };

  function update(step: string, action?: string) {
    status.step = step;
    if (action) status.actions.push(action);
    writeStatus(status);
  }

  try {
    update("Fetching ready assets from database...");
    const assets = (await query<AssetRow>(
      "SELECT id, asset_type, in_game_id, file_key, name FROM custom_assets WHERE status = 'ready' ORDER BY asset_type, in_game_id"
    )) as AssetRow[];

    if (assets.length === 0) {
      status.status = "error";
      status.error = "No ready assets to publish";
      status.finishedAt = new Date().toISOString();
      writeStatus(status);
      return;
    }
    update("Fetched assets", `Found ${assets.length} ready asset(s)`);

    mkdirSync(workDir, { recursive: true });

    update("Downloading Character.wz (~200MB)...");
    const charWzPath = join(workDir, "Character.wz");
    await streamDownload(`${R2_PUBLIC_URL}/Character.wz`, charWzPath);
    update(
      "Downloaded Character.wz",
      `Downloaded Character.wz (${(statSync(charWzPath).size / 1024 / 1024).toFixed(0)}MB)`
    );

    update("Parsing Character.wz...");
    const charWz = parseWzFile(charWzPath);

    for (const asset of assets) {
      update(`Fetching ${asset.asset_type} ${asset.in_game_id}...`);
      const res = await fetch(`${R2_PUBLIC_URL}/${asset.file_key}`);
      if (!res.ok) {
        throw new Error(
          `Failed to fetch ${asset.file_key} from R2 (${res.status})`
        );
      }
      const imgData = Buffer.from(await res.arrayBuffer());

      addImgToCharacterWz(charWz, {
        dirName: asset.asset_type === "hair" ? "Hair" : "Face",
        id: asset.in_game_id,
        imgData,
      });
      update(
        `Injected ${asset.asset_type} ${asset.in_game_id}`,
        `Added ${asset.asset_type === "hair" ? "Hair" : "Face"}/${String(
          asset.in_game_id
        ).padStart(8, "0")}.img${asset.name ? ` (${asset.name})` : ""} (${imgData.length} bytes)`
      );
    }

    update("Saving patched Character.wz...");
    const charWzOut = join(workDir, "Character-patched.wz");
    saveWzFile(charWz, charWzOut);

    update("Uploading Character.wz to R2 (streaming)...");
    const charUpload = await uploadFileToR2("Character.wz", charWzOut);
    if (!charUpload.success) {
      throw new Error(`Character.wz upload failed: ${charUpload.error}`);
    }
    update("Uploaded Character.wz", "Uploaded patched Character.wz to R2");

    // Trigger WZ→NX conversion for the browser client (fire-and-forget; coalesced upstream).
    update("Triggering WZ→NX conversion", "Dispatching wz-to-nx for: Character.wz");
    dispatchWzToNx(["Character.wz"]).catch(() => {});

    // Bump launcher manifest version + replace Character.wz hash/size.
    update("Updating launcher manifest...");
    let version = "?";
    try {
      const VOLUME_MANIFEST = join(
        process.env.COSMIC_ROOT || "/cosmic",
        "launcher-manifest.json"
      );
      const BUNDLED_MANIFEST = join(process.cwd(), "launcher-manifest.json");
      const manifestPath = existsSync(VOLUME_MANIFEST)
        ? VOLUME_MANIFEST
        : BUNDLED_MANIFEST;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

      for (const file of manifest.files || []) {
        if (file.name === "Character.wz") {
          file.hash = charUpload.hash;
          file.size = charUpload.size;
        }
      }

      const parts = (manifest.version || "1.0.0").split(".");
      parts[2] = String(parseInt(parts[2] || "0") + 1);
      manifest.version = parts.join(".");
      manifest.updatedAt = new Date().toISOString();
      version = manifest.version;

      writeFileSync(VOLUME_MANIFEST, JSON.stringify(manifest, null, 2));
      update("Manifest updated", `Updated launcher manifest to v${version}`);
    } catch (err: any) {
      update("Manifest warning", `Warning: manifest update failed: ${err.message}`);
    }

    update("Marking assets as published...");
    const ids = assets.map((a) => a.id);
    await execute(
      `UPDATE custom_assets SET status = 'published', published_at = NOW() WHERE id IN (${ids
        .map(() => "?")
        .join(",")})`,
      ids
    );

    update("Restarting game server...");
    try {
      const machineId = await restartGameServer();
      update("Server restarted", `Restarted game server (machine: ${machineId})`);
    } catch (err: any) {
      update(
        "Restart warning",
        `Warning: server restart failed: ${err.message}. Restart manually.`
      );
    }

    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {}

    status.status = "done";
    status.step = "Complete";
    status.finishedAt = new Date().toISOString();
    status.assets_published = assets.length;
    status.version = version;
    writeStatus(status);
  } catch (err: any) {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {}
    status.status = "error";
    status.error = err.message;
    status.step = "Failed";
    status.finishedAt = new Date().toISOString();
    writeStatus(status);
  }
}

export async function POST() {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 credentials not configured" },
      { status: 500 }
    );
  }

  const current = readStatus();
  if (current?.status === "running") {
    const elapsed = Date.now() - new Date(current.startedAt).getTime();
    if (elapsed < 10 * 60 * 1000) {
      return NextResponse.json(
        { error: "An assets publish job is already running", status: current },
        { status: 409 }
      );
    }
  }

  const jobId = randomUUID().slice(0, 8);
  runPublishJob(jobId).catch((err) => {
    console.error("Assets publish job crashed:", err);
  });

  return NextResponse.json({ started: true, id: jobId });
}

export async function GET() {
  const status = readStatus();
  if (!status) {
    return NextResponse.json({ status: "idle" });
  }
  return NextResponse.json(status);
}
