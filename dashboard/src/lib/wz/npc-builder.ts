import { deflateSync } from "zlib";
import { PNG } from "pngjs";
import type { WzFileInfo } from "./patcher";

/**
 * NPC WZ Builder — generates server XML and client WZ binary
 * for custom NPCs with AI-generated sprites.
 *
 * Minimal NPC structure:
 *   info/speak/0 = "n0"
 *   stand/0 = canvas (origin center-bottom)
 */

// ---- PNG Processing ----

interface DecodedCanvas {
  width: number;
  height: number;
  pixels: Buffer; // BGRA4444
  originX: number;
  originY: number;
}

/**
 * Remove background from PNG. Handles:
 * - PNGs with existing semi-transparent backgrounds (AI generators often produce these)
 * - Fully opaque PNGs with solid color backgrounds (white or dark)
 * Thresholds alpha to binary (0 or 255) for clean pixel art.
 */
export function removeBackground(pngBuf: Buffer): Buffer {
  const png = PNG.sync.read(pngBuf);

  // Count how many pixels are already fully transparent
  let fullyTransparent = 0;
  let fullyOpaque = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] === 0) fullyTransparent++;
    else if (png.data[i] === 255) fullyOpaque++;
  }

  const total = png.width * png.height;
  const hasGoodAlpha = fullyTransparent > total * 0.1 && fullyOpaque > total * 0.1;

  if (hasGoodAlpha) {
    // PNG has meaningful alpha channel — just threshold it to clean binary
    const ALPHA_THRESHOLD = 128;
    for (let i = 3; i < png.data.length; i += 4) {
      png.data[i] = png.data[i] >= ALPHA_THRESHOLD ? 255 : 0;
    }
    return PNG.sync.write(png);
  }

  // Fully opaque PNG — detect background from corners and remove
  const corners = [
    { x: 0, y: 0 },
    { x: png.width - 1, y: 0 },
    { x: 0, y: png.height - 1 },
    { x: png.width - 1, y: png.height - 1 },
  ];

  let rSum = 0, gSum = 0, bSum = 0;
  for (const c of corners) {
    const i = (c.y * png.width + c.x) * 4;
    rSum += png.data[i];
    gSum += png.data[i + 1];
    bSum += png.data[i + 2];
  }
  const bgR = rSum / 4, bgG = gSum / 4, bgB = bSum / 4;
  const tolerance = 60;

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      const dr = Math.abs(r - bgR), dg = Math.abs(g - bgG), db = Math.abs(b - bgB);
      if (dr < tolerance && dg < tolerance && db < tolerance) {
        png.data[i + 3] = 0;
      }
    }
  }

  return PNG.sync.write(png);
}

/** Trim transparent borders from PNG */
function trimPng(pngBuf: Buffer): Buffer {
  const png = PNG.sync.read(pngBuf);
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

  if (maxX < minX) return pngBuf; // fully transparent

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((minY + y) * png.width + (minX + x)) * 4;
      const di = (y * w + x) * 4;
      png.data.copy(out.data, di, si, si + 4);
    }
  }
  return PNG.sync.write(out);
}

/** Scale PNG using nearest-neighbor (preserves pixel art) */
function scalePng(pngBuf: Buffer, maxHeight: number): Buffer {
  const png = PNG.sync.read(pngBuf);
  if (png.height <= maxHeight) return pngBuf;

  const scale = maxHeight / png.height;
  const newW = Math.max(1, Math.round(png.width * scale));
  const newH = Math.max(1, Math.round(png.height * scale));
  const out = new PNG({ width: newW, height: newH });

  for (let y = 0; y < newH; y++) {
    const srcY = Math.min(Math.floor(y / scale), png.height - 1);
    for (let x = 0; x < newW; x++) {
      const srcX = Math.min(Math.floor(x / scale), png.width - 1);
      const si = (srcY * png.width + srcX) * 4;
      const di = (y * newW + x) * 4;
      png.data.copy(out.data, di, si, si + 4);
    }
  }
  return PNG.sync.write(out);
}

/**
 * Process a raw NPC sprite PNG: remove background, trim, scale.
 * Returns a clean PNG buffer ready for WZ encoding.
 */
export function processNpcSprite(pngBuf: Buffer, maxHeight = 80): Buffer {
  let processed = removeBackground(pngBuf);
  processed = trimPng(processed);
  processed = scalePng(processed, maxHeight);
  return processed;
}

// ---- PNG → BGRA4444 ----

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
    return { width: 1, height: 1, pixels: Buffer.from([0x00, 0x00]), originX: 0, originY: 0 };
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
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

  // NPC origin: center-bottom (feet on foothold)
  return { width: w, height: h, pixels, originX: Math.floor(w / 2), originY: h };
}

// ---- ImgWriter (WZ binary writer) ----

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
  w.writeByte(9);
  const lenPos = w.pos;
  w.writeInt32(0);
  w.writeStringBlock("Shape2D#Vector2D", 0x73, 0x1b);
  w.writeCompressedInt(x);
  w.writeCompressedInt(y);
  w.patchInt32(lenPos, w.pos - lenPos - 4);
}

function writeCanvas(w: ImgWriter, name: string, canvas: DecodedCanvas, delay?: number) {
  w.writeStringBlock(name, 0x00, 0x01);
  w.writeByte(9);
  const canvasLenPos = w.pos;
  w.writeInt32(0);

  w.writeStringBlock("Canvas", 0x73, 0x1b);
  w.writeByte(0);
  w.writeByte(1); // HAS sub-properties

  const subCount = delay != null ? 3 : 2;
  w.writeUInt16(0);
  w.writeCompressedInt(subCount);

  writeVector(w, "origin", canvas.originX, canvas.originY);

  w.writeStringBlock("z", 0x00, 0x01);
  w.writeByte(3);
  w.writeCompressedInt(0);

  if (delay != null) {
    w.writeStringBlock("delay", 0x00, 0x01);
    w.writeByte(3);
    w.writeCompressedInt(delay);
  }

  w.writeCompressedInt(canvas.width);
  w.writeCompressedInt(canvas.height);
  w.writeCompressedInt(1); // BGRA4444
  w.writeCompressedInt(0);
  w.writeInt32(0);
  const compressed = deflateSync(canvas.pixels);
  w.writeInt32(compressed.length + 1);
  w.writeByte(0);
  w.writeBytes(compressed);

  w.patchInt32(canvasLenPos, w.pos - canvasLenPos - 4);
}

// ---- Main Exports ----

/**
 * Build an NPC .img binary blob for client-side Npc.wz.
 *
 * Structure:
 *   info/speak/0 = "n0"
 *   stand/0 = canvas with origin at center-bottom
 */
export function buildNpcImg(pngBuf: Buffer, ks: Buffer): Buffer {
  const canvas = decodePngToCanvas(pngBuf);
  const w = new ImgWriter(ks);

  // Root property: 2 children (info + stand)
  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0);
  w.writeCompressedInt(2);

  // --- info block ---
  w.writeStringBlock("info", 0x00, 0x01);
  w.writeByte(9);
  const infoLenPos = w.pos;
  w.writeInt32(0);
  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0);
  w.writeCompressedInt(1); // 1 child: speak

  // info/speak
  w.writeStringBlock("speak", 0x00, 0x01);
  w.writeByte(9);
  const speakLenPos = w.pos;
  w.writeInt32(0);
  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0);
  w.writeCompressedInt(1); // 1 child: "0"

  // info/speak/0 = "n0"
  w.writeStringBlock("0", 0x00, 0x01);
  w.writeByte(8); // string type
  w.writeStringBlock("n0", 0x00, 0x01);

  w.patchInt32(speakLenPos, w.pos - speakLenPos - 4);
  w.patchInt32(infoLenPos, w.pos - infoLenPos - 4);

  // --- stand block ---
  w.writeStringBlock("stand", 0x00, 0x01);
  w.writeByte(9);
  const standLenPos = w.pos;
  w.writeInt32(0);
  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0);
  w.writeCompressedInt(1); // 1 child: frame "0"

  writeCanvas(w, "0", canvas, 5000);

  w.patchInt32(standLenPos, w.pos - standLenPos - 4);

  return w.toBuffer();
}

function computeChecksum(data: Buffer): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) | 0;
  }
  return sum;
}

/** Add a custom NPC to a parsed Npc.wz */
export function addNpcToWz(wzInfo: WzFileInfo, npcId: number, pngBuf: Buffer): void {
  const imgName = `${String(npcId).padStart(7, "0")}.img`;
  const imgData = buildNpcImg(pngBuf, wzInfo.keyStream);
  const checksum = computeChecksum(imgData);

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

/** Generate server-side Npc.wz XML */
export function generateNpcXml(npcId: number, name: string, pngBuf: Buffer): string {
  const canvas = decodePngToCanvas(pngBuf);
  const padded = String(npcId).padStart(7, "0");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<imgdir name="${padded}.img">
  <imgdir name="info">
    <imgdir name="speak">
      <string name="0" value="n0"/>
    </imgdir>
  </imgdir>
  <imgdir name="stand">
    <canvas name="0" width="${canvas.width}" height="${canvas.height}">
      <vector name="origin" x="${canvas.originX}" y="${canvas.originY}"/>
      <int name="z" value="0"/>
      <int name="delay" value="5000"/>
    </canvas>
  </imgdir>
</imgdir>
`;
}
