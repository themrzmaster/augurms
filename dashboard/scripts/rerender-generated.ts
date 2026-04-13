/**
 * Re-render sprites for an existing gm_generated_items row, using the current
 * headless renderer. Downloads the stored GLB, renders, and updates both the
 * test-output directory and the custom_items row so the admin UI reflects the
 * new frames.
 *
 * Usage:
 *   cd dashboard
 *   npx tsx scripts/rerender-generated.ts [generationId]      # default: latest
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { query } from "../src/lib/db";
import { renderWeaponGlb } from "../src/lib/wz/headless-renderer";

interface GenRow {
  id: number;
  item_id: number | null;
  name: string | null;
  weapon_type: string | null;
  glb_url: string | null;
}

async function main() {
  const arg = process.argv[2];
  let row: GenRow | undefined;
  if (arg) {
    [row] = await query<GenRow>(
      "SELECT id, item_id, name, weapon_type, glb_url FROM gm_generated_items WHERE id = ? LIMIT 1",
      [parseInt(arg)]
    );
  } else {
    [row] = await query<GenRow>(
      "SELECT id, item_id, name, weapon_type, glb_url FROM gm_generated_items WHERE glb_url IS NOT NULL ORDER BY id DESC LIMIT 1"
    );
  }
  if (!row) throw new Error(`generation ${arg ?? "(latest)"} not found`);
  if (!row.glb_url) throw new Error(`generation ${row.id} has no glb_url`);

  console.log(`Re-rendering generation #${row.id} (${row.name ?? "(unnamed)"}, item_id=${row.item_id ?? "none"})`);

  console.log("Downloading GLB...");
  const res = await fetch(row.glb_url);
  if (!res.ok) throw new Error(`GLB fetch failed: ${res.status} ${res.statusText}`);
  const glb = Buffer.from(await res.arrayBuffer());
  console.log(`  ${(glb.byteLength / 1024 / 1024).toFixed(2)} MB`);

  const t0 = Date.now();
  const out = await renderWeaponGlb({
    glb,
    onProgress: (msg, pct) =>
      process.stdout.write(`\r[${pct.toString().padStart(3)}%] ${msg.padEnd(40)}`),
  });
  process.stdout.write("\n");
  const ms = Date.now() - t0;
  console.log(`Rendered in ${ms}ms (${(ms / 1000).toFixed(1)}s)`);

  const outDir = join(process.cwd(), "test-output", `gen-${row.id}`);
  mkdirSync(outDir, { recursive: true });
  const decode = (url: string) =>
    Buffer.from(url.replace(/^data:image\/\w+;base64,/, ""), "base64");
  if (out.iconDataUrl) writeFileSync(join(outDir, "icon.png"), decode(out.iconDataUrl));
  for (const [anim, frames] of Object.entries(out.frames)) {
    const animDir = join(outDir, anim);
    mkdirSync(animDir, { recursive: true });
    frames.forEach((f, i) => writeFileSync(join(animDir, `${i}.png`), decode(f)));
  }
  writeFileSync(join(outDir, "origins.json"), JSON.stringify(out.origins, null, 2));
  console.log(`Wrote ${Object.values(out.frames).flat().length} frames + icon → ${outDir}`);

  if (row.item_id) {
    const [existing] = await query<{ stats: unknown }>(
      "SELECT stats FROM custom_items WHERE item_id = ? LIMIT 1",
      [row.item_id]
    );
    const stats =
      typeof existing?.stats === "string"
        ? JSON.parse(existing.stats)
        : (existing?.stats as Record<string, unknown> | null) ?? {};
    stats._weaponFrames = { origins: out.origins, frames: out.frames };

    await query("UPDATE custom_items SET icon_url = ?, stats = ? WHERE item_id = ?", [
      out.iconDataUrl,
      JSON.stringify(stats),
      row.item_id,
    ]);
    console.log(`Updated custom_items.item_id=${row.item_id} (icon + _weaponFrames)`);
  } else {
    console.log("No item_id on this generation — skipping DB update.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
