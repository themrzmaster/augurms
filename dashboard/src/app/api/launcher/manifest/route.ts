import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Read: check volume first (dynamic updates), then bundled copy
// Write: always write to volume so updates persist across deploys
const VOLUME_MANIFEST = "/cosmic/launcher-manifest.json";
const BUNDLED_MANIFEST = path.join(process.cwd(), "launcher-manifest.json");
const READ_PATH = fs.existsSync(VOLUME_MANIFEST) ? VOLUME_MANIFEST : BUNDLED_MANIFEST;
const WRITE_PATH = VOLUME_MANIFEST; // always write to volume
const MANIFEST_PATH = READ_PATH;

// Files the launcher tracks for updates
const TRACKED_FILES = [
  "AugurMS.exe",
  "Character.wz",
  "Etc.wz",
  "Item.wz",
  "List.wz",
  "Map.wz",
  "Mob.wz",
  "Npc.wz",
  "Quest.wz",
  "Reactor.wz",
  "Skill.wz",
  "String.wz",
  "UI.wz",
];

interface ManifestFile {
  name: string;
  hash: string;
  size: number;
  url: string;
}

interface Manifest {
  version: string;
  updatedAt: string;
  files: ManifestFile[];
  downloadBase: string;
}

export async function GET() {
  try {
    // Try to read existing manifest
    if (fs.existsSync(MANIFEST_PATH)) {
      const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
      return NextResponse.json(manifest, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // No manifest exists yet — return a default
    return NextResponse.json(
      {
        version: "1.0.0",
        updatedAt: new Date().toISOString(),
        files: [],
        downloadBase: "",
        message: "No manifest configured. Use POST to create one.",
      },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Update the manifest (called by GM AI or admin)
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Option 1: Full manifest replacement
    if (body.manifest) {
      fs.writeFileSync(WRITE_PATH, JSON.stringify(body.manifest, null, 2));
      return NextResponse.json({ success: true, manifest: body.manifest });
    }

    // Option 2: Generate manifest from a local directory of client files
    if (body.generateFrom) {
      const clientDir = body.generateFrom;
      if (!fs.existsSync(clientDir)) {
        return NextResponse.json({ error: "Directory not found" }, { status: 400 });
      }

      const files: ManifestFile[] = [];
      for (const name of TRACKED_FILES) {
        const filePath = path.join(clientDir, name);
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          const hash = crypto
            .createHash("sha256")
            .update(fs.readFileSync(filePath))
            .digest("hex");
          files.push({
            name,
            hash,
            size: stat.size,
            url: body.downloadBase ? `${body.downloadBase}/${name}` : "",
          });
        }
      }

      const manifest: Manifest = {
        version: body.version || "1.0.0",
        updatedAt: new Date().toISOString(),
        files,
        downloadBase: body.downloadBase || "",
      };

      fs.writeFileSync(WRITE_PATH, JSON.stringify(manifest, null, 2));
      return NextResponse.json({ success: true, manifest });
    }

    // Option 3: Update download URLs only (e.g., new Mega links)
    if (body.urls) {
      if (!fs.existsSync(MANIFEST_PATH)) {
        return NextResponse.json({ error: "No manifest exists" }, { status: 400 });
      }
      const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
      for (const file of manifest.files) {
        if (body.urls[file.name]) {
          file.url = body.urls[file.name];
        }
      }
      manifest.updatedAt = new Date().toISOString();
      if (body.version) manifest.version = body.version;
      fs.writeFileSync(WRITE_PATH, JSON.stringify(manifest, null, 2));
      return NextResponse.json({ success: true, manifest });
    }

    return NextResponse.json({ error: "Provide manifest, generateFrom, or urls" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
