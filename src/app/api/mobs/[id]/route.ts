import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { PATHS, parseStringEntries } from "@/lib/cosmic";

const MOB_STATS = [
  "level", "maxHP", "maxMP", "exp", "PADamage", "MADamage",
  "PDDamage", "MDDamage", "acc", "eva", "boss", "undead",
  "speed", "bodyAttack", "pushed",
];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const mobId = parseInt(idStr);

  if (isNaN(mobId)) {
    return NextResponse.json({ error: "Invalid mob ID" }, { status: 400 });
  }

  try {
    // Get mob name from String.wz
    let name = "Unknown";
    try {
      const strContent = readFileSync(`${PATHS.stringWz}/Mob.img.xml`, "utf-8");
      const entries = parseStringEntries(strContent);
      const found = entries.find((e) => e.id === mobId);
      if (found) name = found.name;
    } catch {
      // name remains "Unknown"
    }

    // Get mob stats from Mob.wz
    const paddedId = mobId.toString().padStart(7, "0");
    const mobFile = `${PATHS.mobWz}/${paddedId}.img.xml`;
    const stats: Record<string, number> = {};

    if (existsSync(mobFile)) {
      const content = readFileSync(mobFile, "utf-8");

      // Extract the info section
      const infoMatch = content.match(/<imgdir name="info">([\s\S]*?)<\/imgdir>/);
      if (infoMatch) {
        const infoContent = infoMatch[1];
        const regex = /<int name="([^"]*)" value="([^"]*)"\s*\/>/g;
        let m;
        while ((m = regex.exec(infoContent)) !== null) {
          if (MOB_STATS.includes(m[1])) {
            stats[m[1]] = parseInt(m[2]);
          }
        }
      }
    }

    return NextResponse.json({
      id: mobId,
      name,
      stats,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to load mob", details: err.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const mobId = parseInt(idStr);

  if (isNaN(mobId)) {
    return NextResponse.json({ error: "Invalid mob ID" }, { status: 400 });
  }

  try {
    const paddedId = mobId.toString().padStart(7, "0");
    const mobFile = `${PATHS.mobWz}/${paddedId}.img.xml`;

    if (!existsSync(mobFile)) {
      return NextResponse.json({ error: "Mob file not found" }, { status: 404 });
    }

    const changes = await request.json() as Record<string, number>;
    let content = readFileSync(mobFile, "utf-8");

    for (const [key, value] of Object.entries(changes)) {
      const regex = new RegExp(
        `(<imgdir name="info">[\\s\\S]*?<int name="${key}" value=")([^"]*)(")`,
      );
      if (regex.test(content)) {
        content = content.replace(regex, `$1${value}$3`);
      }
    }

    writeFileSync(mobFile, content, "utf-8");

    return NextResponse.json({ success: true, message: "Mob stats updated" });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update mob", details: err.message }, { status: 500 });
  }
}
