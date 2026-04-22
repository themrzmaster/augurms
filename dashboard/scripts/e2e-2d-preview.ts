/**
 * End-to-end 2D flow test: Flux concept (black bg prompt) → sprite-2d pipeline
 * → preview HTML with concept + icon + all animation frames for visual inspection.
 *
 * Calls the REAL Flux API via generateImage() to verify the prompt actually
 * produces usable black-bg concepts, then runs the production sprite-2d lib.
 *
 * Usage:
 *   cd dashboard
 *   npx tsx scripts/e2e-2d-preview.ts                      # defaults: spear + staff + claw
 *   npx tsx scripts/e2e-2d-preview.ts --weapons "sword,bow" --prompt "glowing runic"
 *
 * Output: test-output/e2e-2d/<weapon>/ per weapon + test-output/e2e-2d/index.html
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { config as dotenv } from "dotenv";
dotenv({ path: ".env.local" });

import { generateImage } from "../src/lib/openrouter/image";
import { renderWeaponFromConcept } from "../src/lib/wz/sprite-2d";
import { WEAPON_TYPES } from "../src/lib/wz";

function parseArgs(argv: string[]) {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[i + 1] ?? "";
  }
  return a;
}

function buildConceptPrompt(description: string, weaponType: string): string {
  const label = WEAPON_TYPES[weaponType]?.label ?? weaponType;
  return `Generate a single ${label} weapon concept sprite: ${description}.
Style: flat orthographic front elevation, dead-on side view of the weapon,
no perspective, no foreshortening, no rotation. Weapon fills the frame
vertically, pointing straight up, perfectly centered, mirror-symmetric
across the vertical axis, on a plain pure black (#000000) background.
No shadows, no props, no characters, no text or UI, no ground plane.
Vivid colors, crisp edges, high detail on the head of the weapon.
The weapon is the ONLY subject. No scene. No duplicates. No background gradient.`;
}

// Three distinct shapes so we see the pipeline hold up for tall/thin (spear),
// moderate (sword), compact (claw), and wide-head (bow) weapons.
const DEFAULT_WEAPONS = ["spear", "sword", "claw"];
const DEFAULT_PROMPTS: Record<string, string> = {
  spear: "obsidian dragonscale spear with a crimson crystal embedded in the guard",
  sword: "a radiant crystal longsword with glowing blue runes along the fuller",
  claw: "twin curved dragonfang claws with gold filigree and ruby accents",
  bow: "a silver moonlit longbow with engraved nocks",
  "1h-sword": "a brass-hilted one-handed sword with a teal gem pommel",
  staff: "a wizard staff topped with a floating violet orb",
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const weapons = (args.weapons || DEFAULT_WEAPONS.join(",")).split(",").map(s => s.trim());
  const customPrompt = args.prompt || "";
  const outRoot = join(process.cwd(), "test-output", "e2e-2d");
  mkdirSync(outRoot, { recursive: true });

  interface Result {
    weapon: string;
    conceptPath: string;
    iconPath: string;
    animations: Array<{ name: string; framePaths: string[] }>;
    frameCount: number;
    durationMs: number;
    error?: string;
  }
  const results: Result[] = [];

  for (const weapon of weapons) {
    if (!WEAPON_TYPES[weapon]) {
      console.warn(`Skip unknown weapon type: ${weapon}`);
      continue;
    }
    const desc = customPrompt || DEFAULT_PROMPTS[weapon] || `a legendary ${WEAPON_TYPES[weapon].label.toLowerCase()}`;
    const prompt = buildConceptPrompt(desc, weapon);
    const weaponDir = join(outRoot, weapon);
    mkdirSync(weaponDir, { recursive: true });
    console.log(`\n[${weapon}] ${desc}`);
    const t0 = Date.now();

    try {
      console.log("  Generating concept via Flux...");
      const conceptPng = await generateImage({ prompt });
      const conceptPath = join(weaponDir, "concept.png");
      writeFileSync(conceptPath, conceptPng);
      console.log(`  Concept: ${conceptPng.length} bytes → ${conceptPath}`);

      console.log("  Running 2D sprite pipeline...");
      const rendered = await renderWeaponFromConcept({
        conceptPng,
        onProgress: (m, p) => process.stdout.write(`\r    [${p.toString().padStart(3)}%] ${m.padEnd(36)}`),
      });
      process.stdout.write("\n");

      // Write icon + every frame
      if (rendered.iconDataUrl) {
        writeFileSync(join(weaponDir, "icon.png"),
          Buffer.from(rendered.iconDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
      }
      const animations: Result["animations"] = [];
      for (const [anim, fs] of Object.entries(rendered.frames)) {
        mkdirSync(join(weaponDir, anim), { recursive: true });
        const framePaths: string[] = [];
        for (let i = 0; i < fs.length; i++) {
          const p = join(weaponDir, anim, `${i}.png`);
          writeFileSync(p, Buffer.from(fs[i].replace(/^data:image\/png;base64,/, ""), "base64"));
          framePaths.push(`${weapon}/${anim}/${i}.png`);
        }
        animations.push({ name: anim, framePaths });
      }
      writeFileSync(join(weaponDir, "origins.json"), JSON.stringify(rendered.origins, null, 2));

      const frameCount = Object.values(rendered.frames).flat().length;
      const durationMs = Date.now() - t0;
      console.log(`  Done in ${(durationMs / 1000).toFixed(1)}s — ${frameCount} frames + icon`);

      results.push({
        weapon,
        conceptPath: `${weapon}/concept.png`,
        iconPath: `${weapon}/icon.png`,
        animations,
        frameCount,
        durationMs,
      });
    } catch (err: any) {
      console.error(`  ERROR: ${err.message}`);
      results.push({
        weapon, conceptPath: "", iconPath: "", animations: [],
        frameCount: 0, durationMs: Date.now() - t0, error: err.message,
      });
    }
  }

  // Build HTML report
  const html = buildHtml(results);
  const htmlPath = join(outRoot, "index.html");
  writeFileSync(htmlPath, html);
  console.log(`\n\nHTML preview: ${htmlPath}`);
  console.log(`Open with: open "${htmlPath}"`);
}

function buildHtml(results: Array<{
  weapon: string; conceptPath: string; iconPath: string;
  animations: Array<{ name: string; framePaths: string[] }>;
  frameCount: number; durationMs: number; error?: string;
}>): string {
  const sections = results.map(r => {
    if (r.error) {
      return `<section><h2>${r.weapon}</h2><div class="error">ERROR: ${r.error}</div></section>`;
    }
    const anims = r.animations.map(a => {
      const frames = a.framePaths.map((p, i) =>
        `<div class="frame"><img src="${p}" class="pix" /><div class="sub">${i}</div></div>`
      ).join("");
      return `<div class="anim-row"><div class="anim-label">${a.name}</div><div class="frames">${frames}</div></div>`;
    }).join("");
    return `<section>
      <h2>${r.weapon} <span class="meta">${r.frameCount} frames · ${(r.durationMs / 1000).toFixed(1)}s</span></h2>
      <div class="top">
        <div class="col"><img src="${r.conceptPath}" class="concept"/><div class="sub">concept (black bg)</div></div>
        <div class="col"><img src="${r.iconPath}" class="pix big"/><div class="sub">icon (32px)</div></div>
      </div>
      <div class="anims">${anims}</div>
    </section>`;
  }).join("\n");

  return `<!doctype html><html><head><meta charset="utf-8"><title>2D flow e2e preview</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #1a1a1a; color: #ddd; padding: 24px; margin: 0; }
  h1 { margin: 0 0 6px; font-size: 20px; }
  h2 { color: #9cf; font-size: 16px; margin-top: 32px; }
  .meta { font-weight: normal; color: #888; font-size: 12px; margin-left: 8px; }
  .intro { color: #888; font-size: 13px; margin-bottom: 24px; }
  section { border: 1px solid #333; padding: 16px; border-radius: 8px; background: #222; margin-bottom: 20px; }
  .top { display: flex; gap: 24px; align-items: flex-start; margin-bottom: 20px; }
  .col { text-align: center; }
  .concept { max-width: 320px; max-height: 320px; background: #000; border-radius: 4px; }
  .pix { image-rendering: pixelated; background: #333; }
  .pix.big { width: 128px; height: 128px; }
  .anim-row { display: flex; gap: 14px; align-items: center; margin-bottom: 10px; padding: 8px; background: #2a2a2a; border-radius: 4px; }
  .anim-label { width: 80px; font-family: monospace; color: #fc9; font-size: 12px; }
  .frames { display: flex; gap: 8px; flex-wrap: wrap; }
  .frame { text-align: center; }
  .frame .pix { width: 72px; }
  .sub { color: #888; font-size: 10px; margin-top: 2px; }
  .error { color: #f66; font-family: monospace; padding: 12px; background: #311; border-radius: 4px; }
</style></head><body>
  <h1>2D-only sprite pipeline — end-to-end preview</h1>
  <div class="intro">Flux concept (black background) → sprite-2d.renderWeaponFromConcept() → 37 animation frames + 1 icon. This is the exact production pipeline the GM's generate_item tool uses.</div>
  ${sections}
</body></html>`;
}

main().catch(e => { console.error(e); process.exit(1); });
