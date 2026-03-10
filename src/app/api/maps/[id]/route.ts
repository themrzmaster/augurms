import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { PATHS } from "@/lib/cosmic";

function getMapFilePath(mapId: number): string {
  const mapArea = Math.floor(mapId / 100000000);
  const paddedId = mapId.toString().padStart(9, "0");
  return `${PATHS.mapWz}/Map/Map${mapArea}/${paddedId}.img.xml`;
}

/**
 * Extract the inner content of a named `<imgdir>` section, handling nesting.
 * Returns the text between the opening and closing tags, or null if not found.
 */
function extractSection(content: string, sectionName: string): string | null {
  const openTag = `<imgdir name="${sectionName}">`;
  const startIdx = content.indexOf(openTag);
  if (startIdx === -1) return null;

  const innerStart = startIdx + openTag.length;
  const remaining = content.slice(startIdx);
  const tagRegex = /<imgdir\b|<\/imgdir>/g;
  let depth = 0;
  let m;

  while ((m = tagRegex.exec(remaining)) !== null) {
    if (m[0] === "</imgdir>") {
      depth--;
      if (depth === 0) {
        // m.index is relative to 'remaining', which starts at startIdx
        return content.slice(innerStart, startIdx + m.index);
      }
    } else {
      depth++;
    }
  }

  return null;
}

function getMapName(mapId: number): { streetName: string; mapName: string } {
  try {
    const content = readFileSync(`${PATHS.stringWz}/Map.img.xml`, "utf-8");
    const regex = new RegExp(
      `<imgdir name="${mapId}">\\s*\\n?\\s*<string name="streetName" value="([^"]*)"\\s*/>\\s*\\n?\\s*<string name="mapName" value="([^"]*)"`,
    );
    const match = content.match(regex);
    if (match) {
      return { streetName: match[1], mapName: match[2] };
    }
  } catch {
    // fall through
  }
  return { streetName: "Unknown", mapName: "Unknown" };
}

interface LifeEntry {
  index: string;
  type: string;
  id: string;
  x: number;
  y: number;
  fh: number;
  cy: number;
  rx0: number;
  rx1: number;
  mobTime?: number;
  f?: number;
  hide?: number;
}

function parseLife(content: string): LifeEntry[] {
  const entries: LifeEntry[] = [];
  const lifeContent = extractSection(content, "life");
  if (!lifeContent) return entries;

  const entryRegex = /<imgdir name="(\d+)">([\s\S]*?)<\/imgdir>/g;
  let m;

  while ((m = entryRegex.exec(lifeContent)) !== null) {
    const index = m[1];
    const block = m[2];

    const entry: LifeEntry = {
      index,
      type: "",
      id: "",
      x: 0,
      y: 0,
      fh: 0,
      cy: 0,
      rx0: 0,
      rx1: 0,
    };

    // Parse string values
    const strRegex = /<string name="([^"]*)" value="([^"]*)"\s*\/>/g;
    let s;
    while ((s = strRegex.exec(block)) !== null) {
      if (s[1] === "type") entry.type = s[2];
      else if (s[1] === "id") entry.id = s[2];
    }

    // Parse int values
    const intRegex = /<int name="([^"]*)" value="([^"]*)"\s*\/>/g;
    while ((s = intRegex.exec(block)) !== null) {
      const key = s[1] as keyof LifeEntry;
      const val = parseInt(s[2]);
      if (key === "x") entry.x = val;
      else if (key === "y") entry.y = val;
      else if (key === "fh") entry.fh = val;
      else if (key === "cy") entry.cy = val;
      else if (key === "rx0") entry.rx0 = val;
      else if (key === "rx1") entry.rx1 = val;
      else if (key === "mobTime") entry.mobTime = val;
      else if (key === "f") entry.f = val;
      else if (key === "hide") entry.hide = val;
    }

    entries.push(entry);
  }

  return entries;
}

interface PortalEntry {
  index: string;
  pn: string;
  pt: number;
  x: number;
  y: number;
  tm: number;
  tn: string;
  image?: string;
}

function parsePortals(content: string): PortalEntry[] {
  const portals: PortalEntry[] = [];
  const portalContent = extractSection(content, "portal");
  if (!portalContent) return portals;

  const entryRegex = /<imgdir name="(\d+)">([\s\S]*?)<\/imgdir>/g;
  let m;

  while ((m = entryRegex.exec(portalContent)) !== null) {
    const index = m[1];
    const block = m[2];

    const entry: PortalEntry = {
      index,
      pn: "",
      pt: 0,
      x: 0,
      y: 0,
      tm: 999999999,
      tn: "",
    };

    const strRegex = /<string name="([^"]*)" value="([^"]*)"\s*\/>/g;
    let s;
    while ((s = strRegex.exec(block)) !== null) {
      if (s[1] === "pn") entry.pn = s[2];
      else if (s[1] === "tn") entry.tn = s[2];
      else if (s[1] === "image") entry.image = s[2];
    }

    const intRegex = /<int name="([^"]*)" value="([^"]*)"\s*\/>/g;
    while ((s = intRegex.exec(block)) !== null) {
      if (s[1] === "pt") entry.pt = parseInt(s[2]);
      else if (s[1] === "x") entry.x = parseInt(s[2]);
      else if (s[1] === "y") entry.y = parseInt(s[2]);
      else if (s[1] === "tm") entry.tm = parseInt(s[2]);
    }

    portals.push(entry);
  }

  return portals;
}

interface Foothold {
  layer: string;
  group: string;
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  prev: number;
  next: number;
}

function parseFootholds(content: string): Foothold[] {
  const footholds: Foothold[] = [];
  const fhContent = extractSection(content, "foothold");
  if (!fhContent) return footholds;
  parseFootholdContent(fhContent, footholds);
  return footholds;
}

/**
 * Extract all direct child <imgdir> sections from a parent content string.
 * Returns an array of { name, content } for each child.
 */
function extractChildSections(parentContent: string): { name: string; content: string }[] {
  const children: { name: string; content: string }[] = [];
  const openRegex = /<imgdir name="([^"]*)">/g;
  let m;

  while ((m = openRegex.exec(parentContent)) !== null) {
    const name = m[1];
    const innerStart = m.index + m[0].length;

    // Count nesting from this opening tag
    const remaining = parentContent.slice(m.index);
    const tagRegex = /<imgdir\b|<\/imgdir>/g;
    let depth = 0;
    let t;

    while ((t = tagRegex.exec(remaining)) !== null) {
      if (t[0] === "</imgdir>") {
        depth--;
        if (depth === 0) {
          const innerEnd = m.index + t.index;
          children.push({ name, content: parentContent.slice(innerStart, innerEnd) });
          // Move openRegex past this entire block
          openRegex.lastIndex = m.index + t.index + t[0].length;
          break;
        }
      } else {
        depth++;
      }
    }
  }

  return children;
}

function parseFootholdContent(fhContent: string, footholds: Foothold[]): void {
  // Structure: <imgdir name="layer"><imgdir name="group"><imgdir name="fhId">
  const layers = extractChildSections(fhContent);

  for (const layerSection of layers) {
    const layer = layerSection.name;
    const groups = extractChildSections(layerSection.content);

    for (const groupSection of groups) {
      const group = groupSection.name;

      const fhRegex = /<imgdir name="(\d+)">\s*<int name="x1" value="(-?\d+)"\/>\s*<int name="y1" value="(-?\d+)"\/>\s*<int name="x2" value="(-?\d+)"\/>\s*<int name="y2" value="(-?\d+)"\/>\s*<int name="prev" value="(-?\d+)"\/>\s*<int name="next" value="(-?\d+)"\/>/g;
      let fhMatch;

      while ((fhMatch = fhRegex.exec(groupSection.content)) !== null) {
        footholds.push({
          layer,
          group,
          id: fhMatch[1],
          x1: parseInt(fhMatch[2]),
          y1: parseInt(fhMatch[3]),
          x2: parseInt(fhMatch[4]),
          y2: parseInt(fhMatch[5]),
          prev: parseInt(fhMatch[6]),
          next: parseInt(fhMatch[7]),
        });
      }
    }
  }
}

interface LadderRopeEntry {
  id: string;
  x: number;
  y1: number;
  y2: number;
  l: number;
  uf: number;
  page: number;
}

function parseLadderRopes(content: string): LadderRopeEntry[] {
  const entries: LadderRopeEntry[] = [];
  const lrContent = extractSection(content, "ladderRope");
  if (!lrContent) return entries;

  const entryRegex = /<imgdir name="(\d+)">([\s\S]*?)<\/imgdir>/g;
  let m;

  while ((m = entryRegex.exec(lrContent)) !== null) {
    const id = m[1];
    const block = m[2];

    const entry: LadderRopeEntry = {
      id,
      x: 0,
      y1: 0,
      y2: 0,
      l: 0,
      uf: 0,
      page: 0,
    };

    const intRegex = /<int name="([^"]*)" value="([^"]*)"\s*\/>/g;
    let s;
    while ((s = intRegex.exec(block)) !== null) {
      if (s[1] === "x") entry.x = parseInt(s[2]);
      else if (s[1] === "y1") entry.y1 = parseInt(s[2]);
      else if (s[1] === "y2") entry.y2 = parseInt(s[2]);
      else if (s[1] === "l") entry.l = parseInt(s[2]);
      else if (s[1] === "uf") entry.uf = parseInt(s[2]);
      else if (s[1] === "page") entry.page = parseInt(s[2]);
    }

    entries.push(entry);
  }

  return entries;
}

interface SeatEntry {
  id: string;
  x: number;
  y: number;
}

function parseSeats(content: string): SeatEntry[] {
  const entries: SeatEntry[] = [];
  const seatContent = extractSection(content, "seat");
  if (!seatContent) return entries;

  const entryRegex = /<imgdir name="(\d+)">([\s\S]*?)<\/imgdir>/g;
  let m;

  while ((m = entryRegex.exec(seatContent)) !== null) {
    const id = m[1];
    const block = m[2];

    const entry: SeatEntry = {
      id,
      x: 0,
      y: 0,
    };

    const intRegex = /<int name="([^"]*)" value="([^"]*)"\s*\/>/g;
    let s;
    while ((s = intRegex.exec(block)) !== null) {
      if (s[1] === "x") entry.x = parseInt(s[2]);
      else if (s[1] === "y") entry.y = parseInt(s[2]);
    }

    entries.push(entry);
  }

  return entries;
}

function parseMapInfo(content: string): Record<string, string | number> {
  const info: Record<string, string | number> = {};
  const infoContent = extractSection(content, "info");
  if (!infoContent) return info;

  const intRegex = /<int name="([^"]*)" value="([^"]*)"\s*\/>/g;
  let m;
  while ((m = intRegex.exec(infoContent)) !== null) {
    info[m[1]] = parseInt(m[2]);
  }

  const strRegex = /<string name="([^"]*)" value="([^"]*)"\s*\/>/g;
  while ((m = strRegex.exec(infoContent)) !== null) {
    info[m[1]] = m[2];
  }

  const floatRegex = /<float name="([^"]*)" value="([^"]*)"\s*\/>/g;
  while ((m = floatRegex.exec(infoContent)) !== null) {
    info[m[1]] = parseFloat(m[2]);
  }

  return info;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const mapId = parseInt(idStr);

  if (isNaN(mapId)) {
    return NextResponse.json({ error: "Invalid map ID" }, { status: 400 });
  }

  try {
    const mapFile = getMapFilePath(mapId);
    if (!existsSync(mapFile)) {
      return NextResponse.json({ error: "Map file not found" }, { status: 404 });
    }

    const content = readFileSync(mapFile, "utf-8");
    const nameInfo = getMapName(mapId);
    const info = parseMapInfo(content);
    const life = parseLife(content);
    const portals = parsePortals(content);
    const footholds = parseFootholds(content);
    const ladderRopes = parseLadderRopes(content);
    const seats = parseSeats(content);

    return NextResponse.json({
      id: mapId,
      ...nameInfo,
      info,
      life,
      portals,
      footholds,
      ladderRopes,
      seats,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to load map", details: err.message }, { status: 500 });
  }
}

function replaceSectionBlock(content: string, sectionName: string, newXml: string): string {
  const openTag = `<imgdir name="${sectionName}">`;
  const startIdx = content.indexOf(openTag);
  if (startIdx === -1) return content;

  let depth = 0;

  // Scan forward from startIdx counting nesting depth
  const remaining = content.slice(startIdx);
  const tagRegex = /<imgdir\b|<\/imgdir>/g;
  let tagMatch;

  while ((tagMatch = tagRegex.exec(remaining)) !== null) {
    if (tagMatch[0] === "</imgdir>") {
      depth--;
      if (depth === 0) {
        const endIdx = startIdx + tagMatch.index + tagMatch[0].length;
        return content.slice(0, startIdx) + newXml + content.slice(endIdx);
      }
    } else {
      depth++;
    }
  }

  // If we couldn't find the matching close, return content unchanged
  return content;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const mapId = parseInt(idStr);

  if (isNaN(mapId)) {
    return NextResponse.json({ error: "Invalid map ID" }, { status: 400 });
  }

  try {
    const mapFile = getMapFilePath(mapId);
    if (!existsSync(mapFile)) {
      return NextResponse.json({ error: "Map file not found" }, { status: 404 });
    }

    const body = await request.json();
    let content = readFileSync(mapFile, "utf-8");

    // Handle section replacements
    if (body.sections && typeof body.sections === "object") {
      for (const [sectionName, newXml] of Object.entries(body.sections)) {
        content = replaceSectionBlock(content, sectionName, newXml as string);
      }

      writeFileSync(mapFile, content, "utf-8");
      return NextResponse.json({ success: true, message: "Map sections updated" });
    }

    // Handle individual info property updates (existing behavior)
    const changes = body as Record<string, string | number>;

    for (const [key, value] of Object.entries(changes)) {
      // Try to update int properties
      const intRegex = new RegExp(
        `(<imgdir name="info">[\\s\\S]*?<int name="${key}" value=")([^"]*)(")`,
      );
      if (intRegex.test(content)) {
        content = content.replace(intRegex, `$1${value}$3`);
        continue;
      }

      // Try to update string properties
      const strRegex = new RegExp(
        `(<imgdir name="info">[\\s\\S]*?<string name="${key}" value=")([^"]*)(")`,
      );
      if (strRegex.test(content)) {
        content = content.replace(strRegex, `$1${value}$3`);
        continue;
      }

      // Try to update float properties
      const floatRegex = new RegExp(
        `(<imgdir name="info">[\\s\\S]*?<float name="${key}" value=")([^"]*)(")`,
      );
      if (floatRegex.test(content)) {
        content = content.replace(floatRegex, `$1${value}$3`);
        continue;
      }
    }

    writeFileSync(mapFile, content, "utf-8");

    return NextResponse.json({ success: true, message: "Map properties updated" });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update map", details: err.message }, { status: 500 });
  }
}
