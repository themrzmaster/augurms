/**
 * Spot-check the headless weapon renderer.
 *
 * Usage:
 *   cd dashboard
 *   npx tsx scripts/test-headless-renderer.ts ../augurms-staff.glb
 *
 * Writes decoded PNGs to dashboard/test-output/headless/ for visual comparison
 * against the browser-rendered frames at /items/create.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { renderWeaponGlb } from "../src/lib/wz/headless-renderer";

async function main() {
  const glbPath = process.argv[2];
  if (!glbPath) {
    console.error("Usage: tsx scripts/test-headless-renderer.ts <path-to-glb>");
    process.exit(1);
  }

  const abs = resolve(process.cwd(), glbPath);
  console.log(`Loading: ${abs}`);
  const glb = readFileSync(abs);

  const outDir = join(process.cwd(), "test-output", "headless");
  mkdirSync(outDir, { recursive: true });

  const t0 = Date.now();
  const result = await renderWeaponGlb({
    glb,
    onProgress: (msg, pct) => process.stdout.write(`\r[${pct.toString().padStart(3)}%] ${msg.padEnd(40)}`),
  });
  process.stdout.write("\n");
  console.log(`Rendered in ${Date.now() - t0}ms`);

  const decode = (url: string) => Buffer.from(url.replace(/^data:image\/\w+;base64,/, ""), "base64");

  if (result.iconDataUrl) {
    writeFileSync(join(outDir, "icon.png"), decode(result.iconDataUrl));
  }
  for (const [anim, frames] of Object.entries(result.frames)) {
    const animDir = join(outDir, anim);
    mkdirSync(animDir, { recursive: true });
    frames.forEach((f, i) => writeFileSync(join(animDir, `${i}.png`), decode(f)));
  }
  writeFileSync(join(outDir, "origins.json"), JSON.stringify(result.origins, null, 2));

  console.log(`Wrote ${Object.values(result.frames).flat().length} frames + icon → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
