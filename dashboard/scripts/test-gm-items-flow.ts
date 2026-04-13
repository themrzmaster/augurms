#!/usr/bin/env npx tsx
/**
 * Exercise the GM item-generation tool handlers directly — proves what happens
 * when the Augur cron calls generate_item / list_generated_items /
 * publish_generated_item / reject_generated_item.
 *
 * Usage:
 *   cd dashboard
 *   COSMIC_DASHBOARD_URL=http://localhost:3001 npx tsx scripts/test-gm-items-flow.ts
 *
 * Flags:
 *   --real     Also run a REAL generation (~$0.42, ~90s, counts toward daily cap).
 *              Without this, only validation + list are exercised.
 *   --publish  After --real generation succeeds, publish it (triggers server restart).
 *   --reject   After --real generation succeeds, reject it instead.
 *
 * Needs the dashboard dev server running (npm run dev) and MySQL reachable.
 */

import { toolHandlers } from "../src/lib/gamemaster/engine";

const args = process.argv.slice(2);
const REAL = args.includes("--real");
const PUBLISH = args.includes("--publish");
const REJECT = args.includes("--reject");

const OK = "\x1b[32m✓\x1b[0m";
const NO = "\x1b[31m✗\x1b[0m";
const DOT = "\x1b[36m·\x1b[0m";

let pass = 0, fail = 0;

function parse(s: string): any {
  try { return JSON.parse(s); } catch { return s; }
}

async function expect(label: string, handler: string, input: any, shouldFail: boolean, match?: (r: any) => string | null) {
  process.stdout.write(`${DOT} ${label} ... `);
  const fn = (toolHandlers as any)[handler];
  if (!fn) {
    console.log(`${NO} tool handler "${handler}" not registered`);
    fail++; return null;
  }
  try {
    const raw = await fn(input);
    const data = parse(raw);
    const errored = !!(data && typeof data === "object" && (data.error || data.errorMsg));
    if (shouldFail && !errored) {
      console.log(`${NO} expected error, got success: ${JSON.stringify(data).slice(0, 120)}`);
      fail++; return data;
    }
    if (!shouldFail && errored) {
      console.log(`${NO} expected success, got error: ${data.error ?? data.errorMsg}`);
      fail++; return data;
    }
    if (match) {
      const mismatch = match(data);
      if (mismatch) { console.log(`${NO} ${mismatch}`); fail++; return data; }
    }
    console.log(`${OK}${shouldFail ? ` (error: ${String(data.error).slice(0, 80)})` : ""}`);
    pass++; return data;
  } catch (e: any) {
    console.log(`${NO} threw: ${e.message}`);
    fail++; return null;
  }
}

async function main() {
  console.log(`\n=== GM item-generation tool smoke test ===`);
  console.log(`Base: ${process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000"}`);
  console.log(`Mode: ${REAL ? "REAL (will spend ~$0.42)" : "dry (validation + list only)"}\n`);

  // --- Validation: bad inputs should return clear errors ---
  await expect(
    "generate_item rejects unknown stats key",
    "generate_item",
    { description: "a test staff", weapon_type: "staff", stats: { incPAD: 50 } },
    true,
    (d) => String(d.error).includes("Unknown stats key") ? null : "error text didn't mention unknown key"
  );

  await expect(
    "generate_item rejects over-cap stat value",
    "generate_item",
    { description: "a test staff", weapon_type: "staff", stats: { watk: 9999 } },
    true,
    (d) => String(d.error).includes("exceeds cap") ? null : "error text didn't mention cap"
  );

  await expect(
    "generate_item rejects negative stat",
    "generate_item",
    { description: "a test staff", weapon_type: "staff", stats: { matk: -5 } },
    true,
    (d) => String(d.error).includes(">= 0") ? null : "error text didn't mention non-negative"
  );

  await expect(
    "generate_item rejects unknown weapon_type",
    "generate_item",
    { description: "a test thing", weapon_type: "lightsaber" },
    true,
    (d) => String(d.error).includes("Unknown weapon_type") ? null : "error text didn't list valid types"
  );

  await expect(
    "generate_item rejects unknown requirements key",
    "generate_item",
    { description: "a test staff", weapon_type: "staff", requirements: { reqLevel: 50 } },
    true,
    (d) => String(d.error).includes("Unknown requirements key") ? null : "error text didn't mention unknown req key"
  );

  await expect(
    "generate_item rejects too-short description",
    "generate_item",
    { description: "hi", weapon_type: "staff" },
    true
  );

  // --- list_generated_items — read-only, always safe ---
  const listed = await expect(
    "list_generated_items returns array",
    "list_generated_items",
    {},
    false,
    (d) => Array.isArray(d.items) ? null : `expected items[], got ${typeof d.items}`
  );
  if (listed && Array.isArray(listed.items)) {
    console.log(`    → ${listed.items.length} items in DB (${listed.items.filter((i: any) => i.status === "ready").length} ready)`);
  }

  await expect(
    "list_generated_items with status filter",
    "list_generated_items",
    { status: "ready" },
    false,
    (d) => Array.isArray(d.items) ? null : "items not an array"
  );

  // --- publish/reject error paths (without real gen) ---
  await expect(
    "publish_generated_item errors on missing id",
    "publish_generated_item",
    { id: 999999 },
    true
  );

  await expect(
    "reject_generated_item errors on missing id",
    "reject_generated_item",
    { id: 999999 },
    true
  );

  // --- Optional: real end-to-end ---
  if (REAL) {
    console.log(`\n${DOT} Running REAL generation (expect ~90s)...`);
    const gen = await expect(
      "generate_item produces a ready row (REAL — $)",
      "generate_item",
      {
        description: "a slim crystalline wand, frosted blue glass with silver filigree along the shaft, glowing pale-cyan tip",
        weapon_type: "wand",
        name: "GM Tool Test Wand",
        stats: { matk: 40, int: 5, mp: 120 },
        requirements: { level: 35, int: 80, job: 2 }, // magician only
      },
      false,
      (d) => d.status === "ready" ? null : `expected status=ready, got ${d.status} (error: ${d.error})`
    );

    if (gen?.generationId) {
      console.log(`    → gen #${gen.generationId}, item_id=${gen.itemId}, frames=${gen.frameCount}`);
      if (PUBLISH) {
        await expect("publish_generated_item on fresh row", "publish_generated_item", { id: gen.generationId }, false);
      } else if (REJECT) {
        await expect("reject_generated_item on fresh row", "reject_generated_item", { id: gen.generationId }, false);
      } else {
        console.log(`    → left in 'ready' state. Re-run with --publish or --reject to exercise those tools.`);
      }
    }
  }

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
