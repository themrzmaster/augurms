import { deflateSync } from "zlib";
import { PNG } from "pngjs";
import type { WzFileInfo } from "./patcher";

/**
 * Reactor WZ Builder — generates server XML, client WZ binary, and reactor scripts
 * for custom reactors created from the dashboard.
 */

export interface ReactorDefinition {
  /** Reactor template ID (e.g. 9000000) */
  reactorId: number;
  /** Human-readable name */
  name: string;
  /** Event type: 0=click/hit, 100=item-triggered, 101=timed */
  eventType: number;
  /** Number of hits to break (1-5). Each hit advances one state. */
  hitsToBreak: number;
  /** Idle state sprite PNG buffer */
  idlePng: Buffer;
  /** Hit feedback animation frames (PNG buffers) */
  hitFrames: Buffer[];
  /** Break/destroy animation frames (PNG buffers) */
  breakFrames: Buffer[];
  /** Frame delay in ms for hit animation */
  hitDelay?: number;
  /** Frame delay in ms for break animation */
  breakDelay?: number;
  /** For item-triggered reactors: item ID required */
  triggerItemId?: number;
  /** For item-triggered reactors: quantity required */
  triggerItemQty?: number;
  /** For timed reactors: timeout in ms before auto-advance */
  timeout?: number;
  /** Script action name (used in action field) */
  action?: string;
}

// ---- PNG → BGRA4444 ----

interface DecodedCanvas {
  width: number;
  height: number;
  /** BGRA4444 pixel data */
  pixels: Buffer;
  /** Origin X (center-bottom by default) */
  originX: number;
  /** Origin Y */
  originY: number;
}

function decodePngToCanvas(pngBuf: Buffer): DecodedCanvas {
  const png = PNG.sync.read(pngBuf);

  // Auto-trim transparent borders
  let minX = png.width, minY = png.height, maxX = -1, maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) {
    return {
      width: 1, height: 1,
      pixels: Buffer.from([0x00, 0x00]),
      originX: 0, originY: 0,
    };
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;

  // RGBA8888 → BGRA4444
  const pixels = Buffer.alloc(w * h * 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((minY + y) * png.width + (minX + x)) * 4;
      const r = (png.data[si] >> 4) & 0x0f;
      const g = (png.data[si + 1] >> 4) & 0x0f;
      const b = (png.data[si + 2] >> 4) & 0x0f;
      const a = (png.data[si + 3] >> 4) & 0x0f;
      const di = (y * w + x) * 2;
      pixels[di] = (g << 4) | b;
      pixels[di + 1] = (a << 4) | r;
    }
  }

  // Origin at center (WASM client's Reactor::draw shifts by height/2, expects center origin)
  return {
    width: w, height: h, pixels,
    originX: Math.floor(w / 2),
    originY: Math.floor(h / 2),
  };
}

// ---- ImgWriter (minimal, self-contained for reactor .img files) ----

class ImgWriter {
  private buf: Buffer;
  public pos: number;
  private ks: Buffer;
  private stringPool: Map<string, number> = new Map();

  constructor(ks: Buffer) {
    this.buf = Buffer.alloc(4096);
    this.pos = 0;
    this.ks = ks;
  }

  private ensure(n: number) {
    if (this.pos + n > this.buf.length) {
      const newBuf = Buffer.alloc(this.buf.length * 2 + n);
      this.buf.copy(newBuf);
      this.buf = newBuf;
    }
  }

  writeByte(v: number) { this.ensure(1); this.buf[this.pos++] = v & 0xff; }
  writeInt16(v: number) { this.ensure(2); this.buf.writeInt16LE(v, this.pos); this.pos += 2; }
  writeUInt16(v: number) { this.ensure(2); this.buf.writeUInt16LE(v, this.pos); this.pos += 2; }
  writeInt32(v: number) { this.ensure(4); this.buf.writeInt32LE(v, this.pos); this.pos += 4; }
  writeBytes(data: Buffer) { this.ensure(data.length); data.copy(this.buf, this.pos); this.pos += data.length; }

  writeCompressedInt(value: number) {
    if (value > 127 || value <= -128) { this.writeByte(0x80); this.writeInt32(value); }
    else { this.writeByte(value & 0xff); }
  }

  writeWzString(s: string) {
    if (s.length === 0) { this.writeByte(0); return; }
    const len = s.length;
    if (len > 127) { this.writeByte(0x80); this.writeInt32(len); }
    else { this.writeByte((-len) & 0xff); }
    let mask = 0xaa;
    for (let i = 0; i < len; i++) {
      let b = s.charCodeAt(i) & 0xff;
      b ^= this.ks[i] || 0;
      b ^= mask++ & 0xff;
      this.writeByte(b);
    }
  }

  writeStringBlock(s: string, withoutOffset: number, withOffset: number) {
    if (s.length > 4 && this.stringPool.has(s)) {
      this.writeByte(withOffset);
      this.writeInt32(this.stringPool.get(s)!);
    } else {
      this.writeByte(withoutOffset);
      const strStart = this.pos;
      this.writeWzString(s);
      if (!this.stringPool.has(s)) this.stringPool.set(s, strStart);
    }
  }

  patchInt32(pos: number, value: number) { this.buf.writeInt32LE(value, pos); }
  toBuffer(): Buffer { return Buffer.from(this.buf.subarray(0, this.pos)); }
}

// ---- WZ Binary Helpers ----

function writeVector(w: ImgWriter, name: string, x: number, y: number) {
  w.writeStringBlock(name, 0x00, 0x01);
  w.writeByte(9); // extended
  const lenPos = w.pos;
  w.writeInt32(0);
  w.writeStringBlock("Shape2D#Vector2D", 0x73, 0x1b);
  w.writeCompressedInt(x);
  w.writeCompressedInt(y);
  w.patchInt32(lenPos, w.pos - lenPos - 4);
}

function writeCanvas(w: ImgWriter, name: string, canvas: DecodedCanvas, delay?: number) {
  w.writeStringBlock(name, 0x00, 0x01);
  w.writeByte(9); // extended
  const canvasLenPos = w.pos;
  w.writeInt32(0);

  w.writeStringBlock("Canvas", 0x73, 0x1b);
  w.writeByte(0); // unknown
  w.writeByte(1); // HAS sub-properties

  // Sub-properties: origin + z (+ optional delay) — matches vanilla format
  const subCount = delay != null ? 3 : 2;
  w.writeUInt16(0); // 2-byte padding before sub-property count
  w.writeCompressedInt(subCount);

  // origin vector
  writeVector(w, "origin", canvas.originX, canvas.originY);

  // z int
  w.writeStringBlock("z", 0x00, 0x01);
  w.writeByte(3); // compressed int type
  w.writeCompressedInt(0);

  // delay int (for animation frames)
  if (delay != null) {
    w.writeStringBlock("delay", 0x00, 0x01);
    w.writeByte(3);
    w.writeCompressedInt(delay);
  }

  // Pixel data
  w.writeCompressedInt(canvas.width);
  w.writeCompressedInt(canvas.height);
  w.writeCompressedInt(1); // BGRA4444
  w.writeCompressedInt(0);
  w.writeInt32(0); // reserved
  const compressed = deflateSync(canvas.pixels);
  w.writeInt32(compressed.length + 1); // +1 for header byte
  w.writeByte(0); // header byte
  w.writeBytes(compressed);

  w.patchInt32(canvasLenPos, w.pos - canvasLenPos - 4);
}

function writeUOL(w: ImgWriter, name: string, path: string) {
  w.writeStringBlock(name, 0x00, 0x01);
  w.writeByte(9); // extended
  const lenPos = w.pos;
  w.writeInt32(0);
  w.writeStringBlock("UOL", 0x73, 0x1b);
  w.writeByte(0); // unknown
  w.writeStringBlock(path, 0x00, 0x01);
  w.patchInt32(lenPos, w.pos - lenPos - 4);
}

// ---- State Building ----

function writeEventBlock(w: ImgWriter, eventType: number, nextState: number, def: ReactorDefinition) {
  w.writeStringBlock("event", 0x00, 0x01);
  w.writeByte(9);
  const eventLenPos = w.pos;
  w.writeInt32(0);

  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0);

  if (eventType === 100 && def.triggerItemId) {
    // Item-triggered: event has child "0" with type, state, plus "0" (itemId) and "1" (qty) fields
    w.writeCompressedInt(1); // 1 child: "0"
    w.writeStringBlock("0", 0x00, 0x01);
    w.writeByte(9);
    const eLenPos = w.pos;
    w.writeInt32(0);
    w.writeStringBlock("Property", 0x73, 0x1b);
    w.writeUInt16(0);
    w.writeCompressedInt(4); // type, state, 0 (itemId), 1 (qty)
    // type
    w.writeStringBlock("type", 0x00, 0x01);
    w.writeByte(3); w.writeCompressedInt(eventType);
    // state
    w.writeStringBlock("state", 0x00, 0x01);
    w.writeByte(3); w.writeCompressedInt(nextState);
    // item id
    w.writeStringBlock("0", 0x00, 0x01);
    w.writeByte(3); w.writeCompressedInt(def.triggerItemId);
    // quantity
    w.writeStringBlock("1", 0x00, 0x01);
    w.writeByte(3); w.writeCompressedInt(def.triggerItemQty ?? 1);
    w.patchInt32(eLenPos, w.pos - eLenPos - 4);
  } else {
    // Standard event block
    const hasTimeout = eventType === 101 && def.timeout;
    w.writeCompressedInt(hasTimeout ? 2 : 1); // children: "0" event + optional timeOut

    // Event "0"
    w.writeStringBlock("0", 0x00, 0x01);
    w.writeByte(9);
    const eLenPos = w.pos;
    w.writeInt32(0);
    w.writeStringBlock("Property", 0x73, 0x1b);
    w.writeUInt16(0);
    w.writeCompressedInt(2); // type + state
    w.writeStringBlock("type", 0x00, 0x01);
    w.writeByte(3); w.writeCompressedInt(eventType);
    w.writeStringBlock("state", 0x00, 0x01);
    w.writeByte(3); w.writeCompressedInt(nextState);
    w.patchInt32(eLenPos, w.pos - eLenPos - 4);

    // Optional timeout
    if (hasTimeout) {
      w.writeStringBlock("timeOut", 0x00, 0x01);
      w.writeByte(3);
      w.writeCompressedInt(def.timeout!);
    }
  }

  w.patchInt32(eventLenPos, w.pos - eventLenPos - 4);
}

function writeHitBlock(w: ImgWriter, frames: DecodedCanvas[], delay: number) {
  w.writeStringBlock("hit", 0x00, 0x01);
  w.writeByte(9);
  const hitLenPos = w.pos;
  w.writeInt32(0);

  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0);
  w.writeCompressedInt(frames.length);

  for (let i = 0; i < frames.length; i++) {
    writeCanvas(w, String(i), frames[i], delay);
  }

  w.patchInt32(hitLenPos, w.pos - hitLenPos - 4);
}

// ---- Main Exports ----

/**
 * Build a reactor .img binary blob for client-side Reactor.wz
 *
 * Structure mirrors vanilla reactors like 1302000 (Ereve chest):
 *   State 0: idle canvas + event + hit animation
 *   States 1..N-1: UOL to state 0 display + event + UOL to state 0 hit
 *   State N (pre-final): idle canvas + event → final state, break hit animation
 *   State N+1 (final): 1x1 empty canvas
 *   action: script action name
 */
export function buildReactorImg(def: ReactorDefinition, ks: Buffer): Buffer {
  const w = new ImgWriter(ks);
  const hits = Math.max(1, Math.min(def.hitsToBreak, 5));
  const totalStates = hits + 1; // hit states + final empty state
  const hitDelay = def.hitDelay ?? 120;
  const breakDelay = def.breakDelay ?? 150;

  // Decode all canvases
  // idlePng may be the raw upload (large) — check if hitFrames exist, which are already
  // downscaled by the animator. The last hit frame is the "back to normal" sprite.
  const idleCanvas = decodePngToCanvas(def.idlePng);
  const hitCanvases = def.hitFrames.map(decodePngToCanvas);
  const breakCanvases = def.breakFrames.map(decodePngToCanvas);
  const emptyCanvas: DecodedCanvas = {
    width: 1, height: 1,
    pixels: Buffer.from([0x00, 0x00]),
    originX: 0, originY: 0,
  };

  // Count root children: info + states + action
  const rootChildCount = 1 + totalStates + 1; // info + states + action

  // Root property header
  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0);
  w.writeCompressedInt(rootChildCount);

  // --- info block ---
  w.writeStringBlock("info", 0x00, 0x01);
  w.writeByte(9);
  const infoLenPos = w.pos;
  w.writeInt32(0);
  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0);
  w.writeCompressedInt(1); // 1 child: "info" string
  w.writeStringBlock("info", 0x00, 0x01);
  w.writeByte(8); // string
  w.writeStringBlock(def.name, 0x00, 0x01);
  w.patchInt32(infoLenPos, w.pos - infoLenPos - 4);

  // --- State 0: idle + event + hit ---
  {
    const childCount = 1 + 1 + (hitCanvases.length > 0 ? 1 : 0); // canvas + event + optional hit
    w.writeStringBlock("0", 0x00, 0x01);
    w.writeByte(9);
    const stateLenPos = w.pos;
    w.writeInt32(0);
    w.writeStringBlock("Property", 0x73, 0x1b);
    w.writeUInt16(0);
    w.writeCompressedInt(childCount);

    // Idle canvas
    writeCanvas(w, "0", idleCanvas);

    // Event → state 1
    writeEventBlock(w, def.eventType, 1, def);

    // Hit animation (optional)
    if (hitCanvases.length > 0) {
      writeHitBlock(w, hitCanvases, hitDelay);
    }

    w.patchInt32(stateLenPos, w.pos - stateLenPos - 4);
  }

  // --- States 1..hits-1: UOL to state 0 + event → next state ---
  for (let s = 1; s < hits; s++) {
    const isLastHitState = s === hits - 1;
    const hasHit = hitCanvases.length > 0;
    // Last hit state before final uses break animation
    const useBreakHit = isLastHitState && breakCanvases.length > 0;
    const childCount = 1 + 1 + (hasHit || useBreakHit ? 1 : 0); // canvas + event + hit

    w.writeStringBlock(String(s), 0x00, 0x01);
    w.writeByte(9);
    const stateLenPos = w.pos;
    w.writeInt32(0);
    w.writeStringBlock("Property", 0x73, 0x1b);
    w.writeUInt16(0);
    w.writeCompressedInt(childCount);

    // UOL to state 0 canvas
    writeUOL(w, "0", "../0/0");

    // Event → next state
    writeEventBlock(w, def.eventType, s + 1, def);

    // Hit animation
    if (useBreakHit) {
      writeHitBlock(w, breakCanvases, breakDelay);
    } else if (hasHit) {
      writeUOL(w, "hit", "../0/hit");
    }

    w.patchInt32(stateLenPos, w.pos - stateLenPos - 4);
  }

  // --- Final state: 1x1 empty ---
  {
    w.writeStringBlock(String(hits), 0x00, 0x01);
    w.writeByte(9);
    const stateLenPos = w.pos;
    w.writeInt32(0);
    w.writeStringBlock("Property", 0x73, 0x1b);
    w.writeUInt16(0);
    w.writeCompressedInt(1); // just the empty canvas
    writeCanvas(w, "0", emptyCanvas);
    w.patchInt32(stateLenPos, w.pos - stateLenPos - 4);
  }

  // --- action string ---
  w.writeStringBlock("action", 0x00, 0x01);
  w.writeByte(8); // string
  w.writeStringBlock(def.action || `customReactor${def.reactorId}`, 0x00, 0x01);

  return w.toBuffer();
}

/** Pad reactor ID to 7-digit zero-padded string */
function padReactorId(id: number): string {
  return String(id).padStart(7, "0");
}

function computeChecksum(data: Buffer): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) | 0;
  }
  return sum;
}

/** Add a custom reactor to a parsed Reactor.wz */
export function addReactorToWz(wzInfo: WzFileInfo, def: ReactorDefinition): void {
  const imgName = `${padReactorId(def.reactorId)}.img`;

  const imgData = buildReactorImg(def, wzInfo.keyStream);
  const checksum = computeChecksum(imgData);

  // Replace if exists, otherwise add
  const existingIdx = wzInfo.root.findIndex((e) => e.name === imgName);
  const entry = {
    type: "img" as const,
    name: imgName,
    blockSize: imgData.length,
    checksum,
    offset: 0,
    data: imgData,
    originalOffset: undefined,
  };

  if (existingIdx >= 0) {
    wzInfo.root[existingIdx] = entry;
  } else {
    wzInfo.root.push(entry);
  }
}

// ---- Server-side XML Generation ----

/**
 * Generate server-side Reactor.wz XML for a custom reactor.
 * The server only needs state structure + canvas dimensions (no actual pixel data).
 */
export function generateReactorXml(def: ReactorDefinition): string {
  const hits = Math.max(1, Math.min(def.hitsToBreak, 5));
  const hitDelay = def.hitDelay ?? 120;
  const breakDelay = def.breakDelay ?? 150;
  const idleCanvas = decodePngToCanvas(def.idlePng);
  const hitCanvases = def.hitFrames.map(decodePngToCanvas);
  const breakCanvases = def.breakFrames.map(decodePngToCanvas);
  const action = def.action || `customReactor${def.reactorId}`;

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
  lines.push(`<imgdir name="${padReactorId(def.reactorId)}.img">`);

  // info
  lines.push(`  <imgdir name="info">`);
  lines.push(`    <string name="info" value="${escapeXml(def.name)}"/>`);
  lines.push(`  </imgdir>`);

  // State 0: idle + event + hit
  lines.push(`  <imgdir name="0">`);
  lines.push(`    <canvas name="0" width="${idleCanvas.width}" height="${idleCanvas.height}">`);
  lines.push(`      <vector name="origin" x="${idleCanvas.originX}" y="${idleCanvas.originY}"/>`);
  lines.push(`      <int name="z" value="0"/>`);
  lines.push(`    </canvas>`);
  lines.push(`    <imgdir name="event">`);
  lines.push(`      <imgdir name="0">`);
  lines.push(`        <int name="type" value="${def.eventType}"/>`);
  lines.push(`        <int name="state" value="1"/>`);
  if (def.eventType === 100 && def.triggerItemId) {
    lines.push(`        <int name="0" value="${def.triggerItemId}"/>`);
    lines.push(`        <int name="1" value="${def.triggerItemQty ?? 1}"/>`);
  }
  lines.push(`      </imgdir>`);
  if (def.eventType === 101 && def.timeout) {
    lines.push(`      <int name="timeOut" value="${def.timeout}"/>`);
  }
  lines.push(`    </imgdir>`);
  if (hitCanvases.length > 0) {
    lines.push(`    <imgdir name="hit">`);
    for (let i = 0; i < hitCanvases.length; i++) {
      const hc = hitCanvases[i];
      lines.push(`      <canvas name="${i}" width="${hc.width}" height="${hc.height}">`);
      lines.push(`        <vector name="origin" x="${hc.originX}" y="${hc.originY}"/>`);
      lines.push(`        <int name="z" value="0"/>`);
      lines.push(`        <int name="delay" value="${hitDelay}"/>`);
      lines.push(`      </canvas>`);
    }
    lines.push(`    </imgdir>`);
  }
  lines.push(`  </imgdir>`);

  // States 1..hits-1: UOL to state 0
  for (let s = 1; s < hits; s++) {
    const isLastHitState = s === hits - 1;
    lines.push(`  <imgdir name="${s}">`);
    lines.push(`    <uol name="0" value="../0/0"/>`);
    lines.push(`    <imgdir name="event">`);
    lines.push(`      <imgdir name="0">`);
    lines.push(`        <int name="type" value="${def.eventType}"/>`);
    lines.push(`        <int name="state" value="${s + 1}"/>`);
    if (def.eventType === 100 && def.triggerItemId) {
      lines.push(`        <int name="0" value="${def.triggerItemId}"/>`);
      lines.push(`        <int name="1" value="${def.triggerItemQty ?? 1}"/>`);
    }
    lines.push(`      </imgdir>`);
    if (def.eventType === 101 && def.timeout) {
      lines.push(`      <int name="timeOut" value="${def.timeout}"/>`);
    }
    lines.push(`    </imgdir>`);

    if (isLastHitState && breakCanvases.length > 0) {
      lines.push(`    <imgdir name="hit">`);
      for (let i = 0; i < breakCanvases.length; i++) {
        const bc = breakCanvases[i];
        lines.push(`      <canvas name="${i}" width="${bc.width}" height="${bc.height}">`);
        lines.push(`        <vector name="origin" x="${bc.originX}" y="${bc.originY}"/>`);
        lines.push(`        <int name="z" value="0"/>`);
        lines.push(`        <int name="delay" value="${breakDelay}"/>`);
        lines.push(`      </canvas>`);
      }
      lines.push(`    </imgdir>`);
    } else if (hitCanvases.length > 0) {
      lines.push(`    <uol name="hit" value="../0/hit"/>`);
    }

    lines.push(`  </imgdir>`);
  }

  // Final state: 1x1 empty
  lines.push(`  <imgdir name="${hits}">`);
  lines.push(`    <canvas name="0" width="1" height="1">`);
  lines.push(`      <vector name="origin" x="0" y="0"/>`);
  lines.push(`    </canvas>`);
  lines.push(`  </imgdir>`);

  // action
  lines.push(`  <string name="action" value="${escapeXml(action)}"/>`);
  lines.push(`</imgdir>`);

  return lines.join("\n");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---- Reactor Script Generation ----

export type ScriptTemplate = "drop_items" | "drop_items_meso" | "spawn_monster" | "custom";

/**
 * Generate a reactor script JS file.
 */
export function generateReactorScript(
  template: ScriptTemplate,
  options?: {
    /** For spawn_monster: mob ID */
    mobId?: number;
    /** For spawn_monster: count */
    mobCount?: number;
    /** Custom script body */
    customScript?: string;
  }
): string {
  switch (template) {
    case "drop_items":
      return `/*\n * Custom reactor — drops items from reactordrops table\n */\n\nfunction act() {\n    rm.dropItems(true, 2, 8, 12, 2);\n}\n`;

    case "drop_items_meso":
      return `/*\n * Custom reactor — drops items + meso\n */\n\nfunction act() {\n    rm.dropItems(true, 2, 60, 80);\n}\n`;

    case "spawn_monster":
      return `/*\n * Custom reactor — spawns monster on break\n */\n\nfunction act() {\n    rm.spawnMonster(${options?.mobId ?? 100100}, ${options?.mobCount ?? 1});\n}\n`;

    case "custom":
      return options?.customScript || `function act() {\n    rm.dropItems();\n}\n`;
  }
}
