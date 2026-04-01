import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const WZ_ROOT = process.env.WZ_ROOT || "/app/wz";

// Map sub_category to WZ directory path
const SUB_CATEGORY_DIRS: Record<string, string> = {
  Ring: "Character.wz/Ring",
  Pendant: "Character.wz/Accessory",
  Face: "Character.wz/Accessory",
  Eye: "Character.wz/Accessory",
  Earring: "Character.wz/Accessory",
  Belt: "Character.wz/Accessory",
  Medal: "Character.wz/Accessory",
  Cap: "Character.wz/Cap",
  Coat: "Character.wz/Coat",
  Longcoat: "Character.wz/Longcoat",
  Pants: "Character.wz/Pants",
  Shoes: "Character.wz/Shoes",
  Glove: "Character.wz/Glove",
  Shield: "Character.wz/Shield",
  Cape: "Character.wz/Cape",
  Weapon: "Character.wz/Weapon",
};

// Map stat keys to WZ XML field names
const STAT_FIELDS: Record<string, string> = {
  str: "incSTR", dex: "incDEX", int: "incINT", luk: "incLUK",
  hp: "incMHP", mp: "incMMP",
  watk: "incPAD", matk: "incMAD", wdef: "incPDD", mdef: "incMDD",
  acc: "incACC", avoid: "incEVA",
  speed: "incSpeed", jump: "incJump",
  slots: "tuc",
};

function padItemId(id: number): string {
  return String(id).padStart(8, "0");
}

function generateEquipXml(item: {
  item_id: number;
  sub_category: string;
  stats: Record<string, number>;
  requirements: Record<string, number>;
  flags: Record<string, boolean>;
  base_item_id?: number;
}): string {
  const padded = padItemId(item.item_id);
  const stats = item.stats || {};
  const reqs = item.requirements || {};
  const flags = item.flags || {};

  // Determine slot type from sub_category
  const slotMap: Record<string, string> = {
    Ring: "Ri", Pendant: "Pe", Face: "Af", Eye: "Ae", Earring: "Ae",
    Belt: "Be", Medal: "Me", Cap: "Cp", Coat: "Ma", Longcoat: "Ma",
    Pants: "Pn", Shoes: "So", Glove: "Gv", Shield: "Si", Cape: "Sr",
    Weapon: "Wp",
  };
  const slot = slotMap[item.sub_category] || "Ri";

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  xml += `<imgdir name="${padded}.img">\n`;
  xml += `  <imgdir name="info">\n`;
  xml += `    <canvas name="icon" width="26" height="28">\n`;
  xml += `      <vector name="origin" x="-4" y="28"/>\n`;
  xml += `    </canvas>\n`;
  xml += `    <canvas name="iconRaw" width="24" height="26">\n`;
  xml += `      <vector name="origin" x="-4" y="28"/>\n`;
  xml += `    </canvas>\n`;
  xml += `    <string name="islot" value="${slot}"/>\n`;
  xml += `    <string name="vslot" value="${slot}"/>\n`;
  xml += `    <int name="reqJob" value="${reqs.job ?? 0}"/>\n`;
  xml += `    <int name="reqLevel" value="${reqs.level ?? 0}"/>\n`;
  xml += `    <int name="reqSTR" value="${reqs.str ?? 0}"/>\n`;
  xml += `    <int name="reqDEX" value="${reqs.dex ?? 0}"/>\n`;
  xml += `    <int name="reqINT" value="${reqs.int ?? 0}"/>\n`;
  xml += `    <int name="reqLUK" value="${reqs.luk ?? 0}"/>\n`;
  xml += `    <int name="cash" value="${flags.cash ? 1 : 0}"/>\n`;

  if (flags.tradeBlock) xml += `    <int name="tradeBlock" value="1"/>\n`;
  if (flags.only) xml += `    <int name="only" value="1"/>\n`;
  if (flags.notSale) xml += `    <int name="notSale" value="1"/>\n`;

  // Stats
  for (const [key, wzField] of Object.entries(STAT_FIELDS)) {
    if (stats[key] && stats[key] !== 0) {
      xml += `    <int name="${wzField}" value="${stats[key]}"/>\n`;
    }
  }

  xml += `  </imgdir>\n`;
  xml += `</imgdir>\n`;
  return xml;
}

function writeEquipWzXml(item: {
  item_id: number;
  sub_category: string;
  stats: Record<string, number>;
  requirements: Record<string, number>;
  flags: Record<string, boolean>;
  base_item_id?: number;
}): { success: boolean; path?: string; error?: string } {
  try {
    const dir = SUB_CATEGORY_DIRS[item.sub_category] || "Character.wz/Ring";
    const fullDir = join(WZ_ROOT, dir);
    if (!existsSync(fullDir)) mkdirSync(fullDir, { recursive: true });

    const filename = `${padItemId(item.item_id)}.img.xml`;
    const filePath = join(fullDir, filename);
    const xml = generateEquipXml(item);
    writeFileSync(filePath, xml, "utf-8");
    return { success: true, path: filePath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function addToStringWz(itemId: number, name: string, desc: string, subCategory: string): { success: boolean; error?: string } {
  try {
    const stringPath = join(WZ_ROOT, "String.wz", "Eqp.img.xml");
    if (!existsSync(stringPath)) return { success: false, error: "String.wz/Eqp.img.xml not found" };

    let content = readFileSync(stringPath, "utf-8");

    // Check if entry already exists
    if (content.includes(`<imgdir name="${itemId}">`)) {
      return { success: true }; // Already exists
    }

    // Build the new entry
    const entry = `      <imgdir name="${itemId}">\n        <string name="name" value="${escapeXml(name)}"/>\n        <string name="desc" value="${escapeXml(desc)}"/>\n      </imgdir>`;

    // Find the Accessory section opening tag and insert before its closing </imgdir>
    // Strategy: find `<imgdir name="Accessory">`, then find the FIRST `    </imgdir>`
    // that closes it (4-space indent = section-level closing tag)
    const sectionOpen = content.indexOf('<imgdir name="Accessory">');
    if (sectionOpen === -1) {
      return { success: false, error: 'Accessory section not found in Eqp.img.xml' };
    }

    // Find the section-level closing tag (4-space indented) after the section opens
    const sectionCloseRegex = /\n    <\/imgdir>/g;
    sectionCloseRegex.lastIndex = sectionOpen;
    const closeMatch = sectionCloseRegex.exec(content);
    if (!closeMatch) {
      return { success: false, error: 'Could not find closing tag for Accessory section' };
    }

    // Insert the new entry just before the closing tag
    const insertPos = closeMatch.index;
    content = content.slice(0, insertPos) + "\n" + entry + content.slice(insertPos);
    writeFileSync(stringPath, content, "utf-8");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// GET: List all custom items
export async function GET() {
  try {
    const items = await query(
      "SELECT * FROM custom_items ORDER BY created_at DESC"
    );
    return NextResponse.json(items);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Create a custom item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      item_id, name, description, category, sub_category,
      base_item_id, icon_url, stats, requirements, flags,
    } = body;

    if (!item_id || !name || !category) {
      return NextResponse.json(
        { error: "item_id, name, and category are required" },
        { status: 400 }
      );
    }

    // Check for ID conflict with existing WZ items
    try {
      const existing = await fetch(
        `${process.env.COSMIC_DASHBOARD_URL || "http://localhost:3000"}/api/items/${item_id}`
      );
      const data = await existing.json();
      if (data?.name && !data.error) {
        return NextResponse.json(
          { error: `Item ID ${item_id} already exists in WZ data: "${data.name}"` },
          { status: 409 }
        );
      }
    } catch { /* item doesn't exist in WZ, which is what we want */ }

    // Check for ID conflict in custom_items
    const [existingCustom] = await query(
      "SELECT id FROM custom_items WHERE item_id = ?", [item_id]
    );
    if (existingCustom) {
      return NextResponse.json(
        { error: `Custom item with ID ${item_id} already exists` },
        { status: 409 }
      );
    }

    // Save to DB
    const result = await execute(
      `INSERT INTO custom_items (item_id, name, description, category, sub_category, base_item_id, icon_url, stats, requirements, flags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item_id, name, description || "", category,
        sub_category || "Ring", base_item_id || null, icon_url || null,
        JSON.stringify(stats || {}),
        JSON.stringify(requirements || {}),
        JSON.stringify(flags || {}),
      ]
    );

    // Generate server WZ XML for equip items
    const actions: string[] = [];
    if (category === "equip") {
      const wzResult = writeEquipWzXml({
        item_id, sub_category: sub_category || "Ring",
        stats: stats || {}, requirements: requirements || {},
        flags: flags || {}, base_item_id,
      });
      if (wzResult.success) {
        actions.push(`Generated WZ XML: ${wzResult.path}`);
      } else {
        actions.push(`WZ XML generation failed: ${wzResult.error}`);
      }

      // Add to String.wz
      const stringResult = addToStringWz(item_id, name, description || "", sub_category || "Accessory");
      if (stringResult.success) {
        actions.push("Added name/description to String.wz/Eqp.img.xml");
      } else {
        actions.push(`String.wz update failed: ${stringResult.error}`);
      }
    }

    return NextResponse.json({
      success: true,
      id: result.insertId,
      item_id,
      name,
      actions,
      note: "Item saved to DB. Server WZ XML generated (takes effect after WZ repack + server restart). Client will show base_item_id sprite until client WZ is patched.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Remove a custom item
export async function DELETE(request: NextRequest) {
  try {
    const { item_id } = await request.json();
    if (!item_id) {
      return NextResponse.json({ error: "item_id is required" }, { status: 400 });
    }

    const result = await execute(
      "DELETE FROM custom_items WHERE item_id = ?", [item_id]
    );

    return NextResponse.json({
      success: true,
      deleted: result.affectedRows > 0,
      note: "Item removed from DB. WZ files not cleaned up (manual removal needed).",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
