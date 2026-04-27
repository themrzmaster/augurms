import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

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

export async function GET() {
  const VOLUME_MANIFEST = join(
    process.env.COSMIC_ROOT || "/cosmic",
    "launcher-manifest.json"
  );
  const BUNDLED_MANIFEST = join(process.cwd(), "launcher-manifest.json");
  const manifestPath = existsSync(VOLUME_MANIFEST)
    ? VOLUME_MANIFEST
    : BUNDLED_MANIFEST;

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;
    return NextResponse.json({
      version: manifest.version,
      updatedAt: manifest.updatedAt,
      files: manifest.files || [],
      source: existsSync(VOLUME_MANIFEST) ? "volume" : "bundled",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to read manifest: ${err.message}` },
      { status: 500 }
    );
  }
}
