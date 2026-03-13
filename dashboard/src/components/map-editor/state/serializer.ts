// ========================
// Serializer: Editor State → API Save Format
// ========================

import type {
  EditorFoothold,
  EditorLife,
  EditorPortal,
  EditorLadderRope,
  EditorSeat,
} from "./types";

/**
 * Convert editor footholds → WZ XML imgdir block
 */
export function serializeFootholds(footholds: EditorFoothold[]): string {
  // Group by layer → group
  const layers = new Map<number, Map<number, EditorFoothold[]>>();

  for (const fh of footholds) {
    if (!layers.has(fh.layer)) layers.set(fh.layer, new Map());
    const groups = layers.get(fh.layer)!;
    if (!groups.has(fh.group)) groups.set(fh.group, []);
    groups.get(fh.group)!.push(fh);
  }

  let xml = `<imgdir name="foothold">`;

  const sortedLayers = [...layers.keys()].sort((a, b) => a - b);
  for (const layer of sortedLayers) {
    xml += `\n<imgdir name="${layer}">`;
    const groups = layers.get(layer)!;
    const sortedGroups = [...groups.keys()].sort((a, b) => a - b);

    for (const group of sortedGroups) {
      xml += `\n<imgdir name="${group}">`;
      const fhs = groups.get(group)!;

      for (const fh of fhs) {
        xml += `\n<imgdir name="${fh.id}">`;
        xml += `\n<int name="x1" value="${fh.x1}" />`;
        xml += `\n<int name="y1" value="${fh.y1}" />`;
        xml += `\n<int name="x2" value="${fh.x2}" />`;
        xml += `\n<int name="y2" value="${fh.y2}" />`;
        xml += `\n<int name="prev" value="${fh.prev}" />`;
        xml += `\n<int name="next" value="${fh.next}" />`;
        xml += `\n</imgdir>`;
      }

      xml += `\n</imgdir>`;
    }

    xml += `\n</imgdir>`;
  }

  xml += `\n</imgdir>`;
  return xml;
}

/**
 * Convert editor life → WZ XML imgdir block
 */
export function serializeLife(life: EditorLife[]): string {
  let xml = `<imgdir name="life">`;

  for (let i = 0; i < life.length; i++) {
    const l = life[i];
    xml += `\n<imgdir name="${i}">`;
    xml += `\n<string name="type" value="${l.type}" />`;
    xml += `\n<string name="id" value="${l.id}" />`;
    xml += `\n<int name="x" value="${l.x}" />`;
    xml += `\n<int name="y" value="${l.y}" />`;
    xml += `\n<int name="fh" value="${l.fh}" />`;
    xml += `\n<int name="cy" value="${l.cy}" />`;
    xml += `\n<int name="rx0" value="${l.rx0}" />`;
    xml += `\n<int name="rx1" value="${l.rx1}" />`;
    if (l.mobTime !== undefined) xml += `\n<int name="mobTime" value="${l.mobTime}" />`;
    if (l.f !== undefined) xml += `\n<int name="f" value="${l.f}" />`;
    if (l.hide !== undefined) xml += `\n<int name="hide" value="${l.hide}" />`;
    xml += `\n</imgdir>`;
  }

  xml += `\n</imgdir>`;
  return xml;
}

/**
 * Convert editor portals → WZ XML imgdir block
 */
export function serializePortals(portals: EditorPortal[]): string {
  let xml = `<imgdir name="portal">`;

  for (let i = 0; i < portals.length; i++) {
    const p = portals[i];
    xml += `\n<imgdir name="${i}">`;
    xml += `\n<string name="pn" value="${p.pn}" />`;
    xml += `\n<int name="pt" value="${p.pt}" />`;
    xml += `\n<int name="x" value="${p.x}" />`;
    xml += `\n<int name="y" value="${p.y}" />`;
    xml += `\n<int name="tm" value="${p.tm}" />`;
    xml += `\n<string name="tn" value="${p.tn}" />`;
    if (p.image) xml += `\n<string name="image" value="${p.image}" />`;
    xml += `\n</imgdir>`;
  }

  xml += `\n</imgdir>`;
  return xml;
}

/**
 * Convert editor ladder/ropes → WZ XML imgdir block
 */
export function serializeLadderRopes(ladderRopes: EditorLadderRope[]): string {
  let xml = `<imgdir name="ladderRope">`;

  for (const lr of ladderRopes) {
    xml += `\n<imgdir name="${lr.id}">`;
    xml += `\n<int name="x" value="${lr.x}" />`;
    xml += `\n<int name="y1" value="${lr.y1}" />`;
    xml += `\n<int name="y2" value="${lr.y2}" />`;
    xml += `\n<int name="l" value="${lr.l}" />`;
    xml += `\n<int name="uf" value="${lr.uf}" />`;
    xml += `\n<int name="page" value="${lr.page}" />`;
    xml += `\n</imgdir>`;
  }

  xml += `\n</imgdir>`;
  return xml;
}

/**
 * Convert editor seats → WZ XML imgdir block
 */
export function serializeSeats(seats: EditorSeat[]): string {
  let xml = `<imgdir name="seat">`;

  for (const s of seats) {
    xml += `\n<imgdir name="${s.id}">`;
    xml += `\n<int name="x" value="${s.x}" />`;
    xml += `\n<int name="y" value="${s.y}" />`;
    xml += `\n</imgdir>`;
  }

  xml += `\n</imgdir>`;
  return xml;
}

/**
 * Build the full save payload.
 */
export function buildSavePayload(
  footholds: EditorFoothold[],
  life: EditorLife[],
  portals: EditorPortal[],
  ladderRopes: EditorLadderRope[],
  seats: EditorSeat[],
) {
  return {
    sections: {
      foothold: serializeFootholds(footholds),
      life: serializeLife(life),
      portal: serializePortals(portals),
      ladderRope: serializeLadderRopes(ladderRopes),
      seat: serializeSeats(seats),
    },
  };
}
