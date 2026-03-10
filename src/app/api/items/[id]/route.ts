import { NextRequest, NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { PATHS, parseStringEntries, parseNestedStringEntries, getItemCategory } from "@/lib/cosmic";

const EQUIP_SUBDIRS = [
  "Accessory", "Cap", "Cape", "Coat", "Dragon", "Face", "Glove",
  "Hair", "Longcoat", "Pants", "PetEquip", "Ring", "Shield", "Shoes",
  "TamingMob", "Weapon",
];

const ITEM_CATEGORY_DIRS: Record<string, string> = {
  consume: "Consume",
  etc: "Etc",
  setup: "Install",
  cash: "Cash",
};

function findItemName(itemId: number): { name: string; category: string } | null {
  const category = getItemCategory(itemId);

  const files: Array<{ file: string; nested: boolean; cat: string }> = [
    { file: "Eqp.img.xml", nested: true, cat: "equip" },
    { file: "Consume.img.xml", nested: false, cat: "consume" },
    { file: "Etc.img.xml", nested: false, cat: "etc" },
    { file: "Cash.img.xml", nested: false, cat: "cash" },
  ];

  for (const f of files) {
    try {
      const content = readFileSync(`${PATHS.stringWz}/${f.file}`, "utf-8");
      const entries = f.nested ? parseNestedStringEntries(content) : parseStringEntries(content);
      const found = entries.find((e) => e.id === itemId);
      if (found) return { name: found.name, category: f.cat };
    } catch {
      continue;
    }
  }
  return null;
}

function parseInfoSection(content: string): Record<string, string | number> {
  const props: Record<string, string | number> = {};

  // Extract the first <imgdir name="info"> section
  const infoMatch = content.match(/<imgdir name="info">([\s\S]*?)(?:<\/imgdir>)/);
  if (!infoMatch) return props;

  const infoContent = infoMatch[1];

  // Parse int/short values
  const intRegex = /<(?:int|short) name="([^"]*)" value="([^"]*)"\s*\/>/g;
  let m;
  while ((m = intRegex.exec(infoContent)) !== null) {
    props[m[1]] = parseInt(m[2]);
  }

  // Parse string values
  const strRegex = /<string name="([^"]*)" value="([^"]*)"\s*\/>/g;
  while ((m = strRegex.exec(infoContent)) !== null) {
    props[m[1]] = m[2];
  }

  // Parse float values
  const floatRegex = /<float name="([^"]*)" value="([^"]*)"\s*\/>/g;
  while ((m = floatRegex.exec(infoContent)) !== null) {
    props[m[1]] = parseFloat(m[2]);
  }

  return props;
}

function findEquipData(itemId: number): Record<string, string | number> | null {
  const paddedId = itemId.toString().padStart(8, "0");

  for (const subdir of EQUIP_SUBDIRS) {
    const filePath = resolve(PATHS.characterWz, subdir, `${paddedId}.img.xml`);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        return parseInfoSection(content);
      } catch {
        continue;
      }
    }
  }

  // Also check root Character.wz directory
  const rootPath = resolve(PATHS.characterWz, `${paddedId}.img.xml`);
  if (existsSync(rootPath)) {
    try {
      const content = readFileSync(rootPath, "utf-8");
      return parseInfoSection(content);
    } catch {
      return null;
    }
  }

  return null;
}

function findItemData(itemId: number): Record<string, string | number> | null {
  const category = getItemCategory(itemId);
  const dirName = ITEM_CATEGORY_DIRS[category];
  if (!dirName) return null;

  const paddedId = itemId.toString().padStart(8, "0");
  const prefix = paddedId.substring(0, 4);
  const filePath = resolve(PATHS.itemWz, dirName, `${prefix}.img.xml`);

  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, "utf-8");

    // Find the specific item entry
    const itemRegex = new RegExp(
      `<imgdir name="${paddedId}">([\\s\\S]*?)(?=<imgdir name="\\d{8}">|</imgdir>\\s*</imgdir>)`,
    );
    const itemMatch = content.match(itemRegex);
    if (!itemMatch) return null;

    const itemContent = itemMatch[1];
    const props: Record<string, string | number> = {};

    // Parse info section properties
    const intRegex = /<(?:int|short) name="([^"]*)" value="([^"]*)"\s*\/>/g;
    let m;
    while ((m = intRegex.exec(itemContent)) !== null) {
      props[m[1]] = parseInt(m[2]);
    }

    const strRegex = /<string name="([^"]*)" value="([^"]*)"\s*\/>/g;
    while ((m = strRegex.exec(itemContent)) !== null) {
      props[m[1]] = m[2];
    }

    // Parse spec section if present
    const specMatch = itemContent.match(/<imgdir name="spec">([\s\S]*?)<\/imgdir>/);
    if (specMatch) {
      const specRegex = /<(?:int|short) name="([^"]*)" value="([^"]*)"\s*\/>/g;
      while ((m = specRegex.exec(specMatch[1])) !== null) {
        props[`spec_${m[1]}`] = parseInt(m[2]);
      }
    }

    return props;
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const itemId = parseInt(idStr);

  if (isNaN(itemId)) {
    return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });
  }

  try {
    const nameInfo = findItemName(itemId);
    const category = getItemCategory(itemId);

    let stats: Record<string, string | number> | null = null;
    if (category === "equip") {
      stats = findEquipData(itemId);
    } else {
      stats = findItemData(itemId);
    }

    return NextResponse.json({
      id: itemId,
      name: nameInfo?.name || "Unknown",
      category: nameInfo?.category || category,
      stats: stats || {},
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to load item", details: err.message }, { status: 500 });
  }
}
