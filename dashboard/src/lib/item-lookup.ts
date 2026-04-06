import { readFileSync } from "fs";
import { PATHS, parseStringEntries, parseNestedStringEntries } from "@/lib/cosmic";
import { query } from "@/lib/db";

/**
 * Check if an item ID exists in WZ data or custom_items table.
 * Returns the item name if found, null if not.
 */
export function findItemName(itemId: number): string | null {
  const files: Array<{ file: string; nested: boolean }> = [
    { file: "Eqp.img.xml", nested: true },
    { file: "Consume.img.xml", nested: false },
    { file: "Etc.img.xml", nested: false },
    { file: "Cash.img.xml", nested: false },
  ];

  for (const f of files) {
    try {
      const content = readFileSync(`${PATHS.stringWz}/${f.file}`, "utf-8");
      const entries = f.nested
        ? parseNestedStringEntries(content)
        : parseStringEntries(content);
      const found = entries.find((e) => e.id === itemId);
      if (found) return found.name;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Validate an array of item IDs. Returns invalid IDs.
 */
export function validateItemIds(itemIds: number[]): number[] {
  return itemIds.filter((id) => !findItemName(id));
}

/**
 * Check if a reactor ID exists (vanilla WZ or custom_reactors table).
 */
export async function reactorExists(reactorId: number): Promise<boolean> {
  // Check vanilla WZ
  try {
    const { existsSync } = require("fs");
    const { join } = require("path");
    const xmlPath = join(
      PATHS.reactorWz,
      `${String(reactorId).padStart(7, "0")}.img.xml`
    );
    if (existsSync(xmlPath)) return true;
  } catch {}

  // Check custom_reactors table
  try {
    const rows = await query(
      "SELECT 1 FROM custom_reactors WHERE reactor_id = ? LIMIT 1",
      [reactorId]
    );
    if (rows.length > 0) return true;
  } catch {}

  return false;
}
