import {
  openSync,
  readSync,
  writeSync,
  closeSync,
  fstatSync,
  unlinkSync,
} from "fs";
import { deflateSync } from "zlib";
import { PNG } from "pngjs";
import {
  GMS_IV,
  ZERO_IV,
  WZ_OFFSET_CONSTANT,
  generateKeyStream,
  computeVersionHash,
  rotateLeft32,
} from "./crypto";

// ---------- Types ----------

export interface WzHeader {
  ident: string;
  fsize: number;
  fstart: number;
  copyright: string;
}

export interface WzEntry {
  type: "dir" | "img";
  name: string;
  blockSize: number;
  checksum: number;
  offset: number;
  children?: WzEntry[];
  /** For existing images: offset in original file to byte-copy */
  originalOffset?: number;
  /** For new images: pre-serialized .img binary data */
  data?: Buffer;
}

export interface WzFileInfo {
  header: WzHeader;
  version: number;
  versionHash: number;
  keyStream: Buffer;
  iv: Buffer;
  root: WzEntry[];
  filePath: string;
}

// ---------- Binary Reader ----------

class WzReader {
  private buf: Buffer;
  public pos: number;
  private ks: Buffer;
  private hash: number;
  private fstart: number;
  /** Absolute file offset where this buffer starts */
  private fileBase: number;

  constructor(
    buf: Buffer,
    keyStream: Buffer,
    versionHash: number,
    fstart: number,
    startPos = 0,
    fileBaseOffset = 0
  ) {
    this.buf = buf;
    this.ks = keyStream;
    this.hash = versionHash;
    this.fstart = fstart;
    this.pos = startPos;
    this.fileBase = fileBaseOffset;
  }

  readByte(): number {
    return this.buf[this.pos++];
  }
  readInt8(): number {
    const v = this.buf.readInt8(this.pos);
    this.pos += 1;
    return v;
  }
  readInt16(): number {
    const v = this.buf.readInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  readInt32(): number {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  readUInt32(): number {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readCompressedInt(): number {
    const sb = this.readInt8();
    return sb === -128 ? this.readInt32() : sb;
  }

  readWzString(): string {
    const smallLen = this.readInt8();
    if (smallLen === 0) return "";

    if (smallLen > 0) {
      // Unicode
      const len = smallLen === 127 ? this.readInt32() : smallLen;
      let mask = 0xaaaa;
      const chars: number[] = [];
      for (let i = 0; i < len; i++) {
        let ch = this.buf.readUInt16LE(this.pos);
        this.pos += 2;
        ch ^=
          ((this.ks[i * 2 + 1] || 0) << 8) | (this.ks[i * 2] || 0);
        ch ^= mask++;
        chars.push(ch);
      }
      return String.fromCharCode(...chars);
    } else {
      // ASCII
      const len = smallLen === -128 ? this.readInt32() : -smallLen;
      let mask = 0xaa;
      const bytes: number[] = [];
      for (let i = 0; i < len; i++) {
        let b = this.buf[this.pos++];
        b ^= this.ks[i] || 0;
        b ^= mask++ & 0xff;
        bytes.push(b);
      }
      return Buffer.from(bytes).toString("ascii");
    }
  }

  readStringBlock(offset: number): string {
    const type = this.readByte();
    if (type === 0x00 || type === 0x73) {
      return this.readWzString();
    } else if (type === 0x01 || type === 0x1b) {
      const strOffset = this.readInt32();
      const saved = this.pos;
      this.pos = offset + strOffset;
      const str = this.readWzString();
      this.pos = saved;
      return str;
    }
    return "";
  }

  readOffset(): number {
    const absPos = this.fileBase + this.pos;
    let enc = ((absPos - this.fstart) ^ 0xffffffff) >>> 0;
    enc = Math.imul(enc, this.hash) >>> 0;
    enc = (enc - WZ_OFFSET_CONSTANT) >>> 0;
    enc = rotateLeft32(enc, enc & 0x1f);
    const raw = this.readUInt32();
    let off = (enc ^ raw) >>> 0;
    off = (off + this.fstart * 2) >>> 0;
    return off;
  }
}

// ---------- Binary Writer ----------

class WzWriter {
  private parts: Buffer[] = [];
  private currentBuf: Buffer;
  private currentPos: number;
  public pos: number;
  private ks: Buffer;
  private hash: number;
  private fstart: number;

  constructor(keyStream: Buffer, versionHash: number, fstart: number) {
    this.ks = keyStream;
    this.hash = versionHash;
    this.fstart = fstart;
    this.currentBuf = Buffer.alloc(65536);
    this.currentPos = 0;
    this.pos = 0;
  }

  private ensure(n: number) {
    if (this.currentPos + n > this.currentBuf.length) {
      this.parts.push(this.currentBuf.subarray(0, this.currentPos));
      const newSize = Math.max(65536, n);
      this.currentBuf = Buffer.alloc(newSize);
      this.currentPos = 0;
    }
  }

  writeByte(v: number) {
    this.ensure(1);
    this.currentBuf[this.currentPos++] = v & 0xff;
    this.pos++;
  }
  writeInt16(v: number) {
    this.ensure(2);
    this.currentBuf.writeInt16LE(v, this.currentPos);
    this.currentPos += 2;
    this.pos += 2;
  }
  writeUInt16(v: number) {
    this.ensure(2);
    this.currentBuf.writeUInt16LE(v, this.currentPos);
    this.currentPos += 2;
    this.pos += 2;
  }
  writeInt32(v: number) {
    this.ensure(4);
    this.currentBuf.writeInt32LE(v, this.currentPos);
    this.currentPos += 4;
    this.pos += 4;
  }
  writeUInt32(v: number) {
    this.ensure(4);
    this.currentBuf.writeUInt32LE(v, this.currentPos);
    this.currentPos += 4;
    this.pos += 4;
  }
  writeBytes(data: Buffer) {
    this.ensure(data.length);
    data.copy(this.currentBuf, this.currentPos);
    this.currentPos += data.length;
    this.pos += data.length;
  }

  writeCompressedInt(value: number) {
    if (value > 127 || value <= -128) {
      this.writeByte(0x80); // -128 as signed byte
      this.writeInt32(value);
    } else {
      this.writeByte(value & 0xff);
    }
  }

  writeWzString(s: string) {
    if (s.length === 0) {
      this.writeByte(0);
      return;
    }
    // Always write as ASCII (all WZ names/values we use are ASCII)
    const len = s.length;
    if (len > 127) {
      this.writeByte(0x80); // -128
      this.writeInt32(len);
    } else {
      this.writeByte((-len) & 0xff);
    }
    let mask = 0xaa;
    for (let i = 0; i < len; i++) {
      let b = s.charCodeAt(i) & 0xff;
      b ^= this.ks[i] || 0;
      b ^= mask++ & 0xff;
      this.writeByte(b);
    }
  }

  writeStringValue(s: string, withoutOffset: number, withOffset: number) {
    // No string caching for simplicity — always inline
    this.writeByte(withoutOffset);
    this.writeWzString(s);
  }

  writeObjectEntry(name: string, dirType: number) {
    // dirType: 3 = directory, 4 = image
    this.writeByte(dirType);
    this.writeWzString(name);
  }

  writeOffset(value: number) {
    // Absolute position in the final file = fstart + 2 (version header) + writer pos
    const absPos = this.fstart + 2 + this.pos;
    let enc = ((absPos - this.fstart) ^ 0xffffffff) >>> 0;
    enc = Math.imul(enc, this.hash) >>> 0;
    enc = (enc - WZ_OFFSET_CONSTANT) >>> 0;
    enc = rotateLeft32(enc, enc & 0x1f);
    const writeVal = (enc ^ ((value - this.fstart * 2) >>> 0)) >>> 0;
    this.writeUInt32(writeVal);
  }

  toBuffer(): Buffer {
    this.parts.push(this.currentBuf.subarray(0, this.currentPos));
    const result = Buffer.concat(this.parts);
    this.parts = [];
    this.currentBuf = Buffer.alloc(65536);
    this.currentPos = 0;
    return result;
  }
}

// ---------- Size Calculation (no string caching) ----------

function getCompressedIntLength(n: number): number {
  return n > 127 || n <= -128 ? 5 : 1;
}

function getWzStringLength(s: string): number {
  if (s.length === 0) return 1;
  // ASCII: 1 (length byte) + s.length
  return s.length > 127 ? 1 + 4 + s.length : 1 + s.length;
}

function getEntryMetaSize(entry: WzEntry): number {
  let size = 1; // type byte (3 or 4)
  size += getWzStringLength(entry.name);
  size += getCompressedIntLength(entry.blockSize);
  size += getCompressedIntLength(entry.checksum);
  size += 4; // offset (always 4 bytes)
  return size;
}

/** Compute bytes taken by this directory level's OWN entries (not children) */
function getDirectoryOwnSize(entries: WzEntry[]): number {
  let size = getCompressedIntLength(entries.length);
  for (const entry of entries) {
    size += getEntryMetaSize(entry);
  }
  return size;
}

/** Total bytes for all directory metadata (recursive, depth-first) */
function getTotalDirectorySize(entries: WzEntry[]): number {
  let total = getDirectoryOwnSize(entries);
  for (const entry of entries) {
    if (entry.type === "dir" && entry.children) {
      total += getTotalDirectorySize(entry.children);
    }
  }
  return total;
}

// ---------- Offset Assignment ----------

function assignDirectoryOffsets(
  entries: WzEntry[],
  curOffset: number
): number {
  // This dir's entries start at curOffset, advance past them
  curOffset += getDirectoryOwnSize(entries);
  // Subdirectories follow in depth-first order
  for (const entry of entries) {
    if (entry.type === "dir" && entry.children) {
      entry.offset = curOffset;
      curOffset = assignDirectoryOffsets(entry.children, curOffset);
    }
  }
  return curOffset;
}

function assignImageOffsets(entries: WzEntry[], curOffset: number): number {
  for (const entry of entries) {
    if (entry.type === "img") {
      entry.offset = curOffset;
      curOffset += entry.blockSize;
    }
  }
  for (const entry of entries) {
    if (entry.type === "dir" && entry.children) {
      curOffset = assignImageOffsets(entry.children, curOffset);
    }
  }
  return curOffset;
}

// ---------- WZ File Parsing ----------

function readFileChunk(
  fd: number,
  offset: number,
  length: number
): Buffer {
  const stat = fstatSync(fd);
  const safeLen = Math.min(length, Math.max(0, stat.size - offset));
  if (safeLen <= 0) return Buffer.alloc(0);
  const buf = Buffer.alloc(safeLen);
  readSync(fd, buf, 0, safeLen, offset);
  return buf;
}

export function parseWzFile(filePath: string): WzFileInfo {
  const fd = openSync(filePath, "r");
  try {
    const stat = fstatSync(fd);
    // Read header
    const headerBuf = readFileChunk(fd, 0, 64);
    const ident = headerBuf.toString("ascii", 0, 4);
    if (ident !== "PKG1") throw new Error("Not a WZ file");

    const fsize = Number(headerBuf.readBigUInt64LE(4));
    const fstart = headerBuf.readUInt32LE(12);
    let copyrightEnd = 16;
    while (copyrightEnd < headerBuf.length && headerBuf[copyrightEnd] !== 0)
      copyrightEnd++;
    const copyright = headerBuf.toString("ascii", 16, copyrightEnd);

    const header: WzHeader = { ident, fsize, fstart, copyright };

    // Read version header
    const versionBuf = readFileChunk(fd, fstart, 2);
    const versionHeader = versionBuf.readUInt16LE(0);

    // Try to detect version and IV
    const candidates: Array<{ version: number; iv: Buffer }> = [
      { version: 83, iv: GMS_IV },
      { version: 83, iv: ZERO_IV },
      { version: 40, iv: GMS_IV },
      { version: 176, iv: ZERO_IV },
    ];

    for (const c of candidates) {
      const { hash, header: vh } = computeVersionHash(c.version);
      if ((vh & 0xff) !== (versionHeader & 0xff)) continue;

      // Try to parse first directory entry with this IV
      const dirBuf = readFileChunk(
        fd,
        fstart + 2,
        Math.min(4096, stat.size - fstart - 2)
      );
      const ks = generateKeyStream(c.iv, 4096);
      const reader = new WzReader(dirBuf, ks, hash, fstart, 0);

      try {
        const entryCount = reader.readCompressedInt();
        if (entryCount < 0 || entryCount > 100000) continue;
        // Try reading first entry
        const type = reader.readByte();
        if (type !== 2 && type !== 3 && type !== 4) continue;

        // Looks valid — parse the full directory using fd-based reads
        const fullKs = generateKeyStream(c.iv, 65536);
        const root = parseDirFromFd(fd, fullKs, hash, fstart, fstart + 2);

        closeSync(fd);
        return {
          header,
          version: c.version,
          versionHash: hash,
          keyStream: fullKs,
          iv: c.iv,
          root,
          filePath,
        };
      } catch {
        continue;
      }
    }

    closeSync(fd);
    throw new Error("Could not detect WZ version/encryption");
  } catch (err) {
    try {
      closeSync(fd);
    } catch {}
    throw err;
  }
}

/** Parse a directory level from a file descriptor at a given file offset */
function parseDirFromFd(
  fd: number,
  ks: Buffer,
  hash: number,
  fstart: number,
  fileOffset: number
): WzEntry[] {
  // Read a chunk at this offset — 256KB is enough for any single directory level
  const chunkSize = 256 * 1024;
  const buf = readFileChunk(fd, fileOffset, chunkSize);
  const reader = new WzReader(buf, ks, hash, fstart, 0, fileOffset);

  const count = reader.readCompressedInt();
  const entries: WzEntry[] = [];

  for (let i = 0; i < count; i++) {
    const type = reader.readByte();
    let name: string;
    let entryType: "dir" | "img";

    if (type === 2) {
      // String at offset (relative to fstart)
      const strOffset = reader.readInt32();
      const strBuf = readFileChunk(fd, fstart + strOffset, 256);
      const strReader = new WzReader(strBuf, ks, hash, fstart, 0, fstart + strOffset);
      const nameType = strReader.readByte(); // 3 = dir, 4 = img
      name = strReader.readWzString();
      entryType = nameType === 3 ? "dir" : "img";
    } else if (type === 3 || type === 4) {
      name = reader.readWzString();
      entryType = type === 3 ? "dir" : "img";
    } else {
      // Type 1: legacy, skip
      reader.pos += 4 + 2 + 4;
      continue;
    }

    const blockSize = reader.readCompressedInt();
    const checksum = reader.readCompressedInt();
    const offset = reader.readOffset();

    entries.push({
      type: entryType,
      name,
      blockSize,
      checksum,
      offset,
      originalOffset: offset,
      children: entryType === "dir" ? [] : undefined,
    });
  }

  // Recurse into subdirectories — read from their offsets in the file
  for (const entry of entries) {
    if (entry.type === "dir" && entry.children) {
      entry.children = parseDirFromFd(fd, ks, hash, fstart, entry.offset);
    }
  }

  return entries;
}

// ---------- .img Building for Equip Items ----------

interface EquipData {
  itemId: number;
  subCategory: string;
  stats: Record<string, number>;
  requirements: Record<string, number>;
  flags: Record<string, boolean>;
  /** Raw PNG buffer for the item icon (optional — uses 1x1 placeholder if missing) */
  iconPng?: Buffer;
}

// --- PNG → BGRA4444 conversion ---

interface DecodedIcon {
  width: number;
  height: number;
  /** BGRA4444 pixel data (2 bytes per pixel) */
  pixels: Buffer;
}

function decodePngToIcon(pngBuf: Buffer): DecodedIcon {
  const png = PNG.sync.read(pngBuf);

  // Auto-trim transparent borders
  let minX = png.width, minY = png.height, maxX = 0, maxY = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If fully transparent, return 1x1
  if (maxX < minX || maxY < minY) {
    return { width: 1, height: 1, pixels: Buffer.from([0x00, 0x00]) };
  }

  const trimW = maxX - minX + 1;
  const trimH = maxY - minY + 1;

  // Convert RGBA8888 → BGRA4444 (2 bytes per pixel)
  // Low byte: (G4 << 4) | B4, High byte: (A4 << 4) | R4
  const pixels = Buffer.alloc(trimW * trimH * 2);
  for (let y = 0; y < trimH; y++) {
    for (let x = 0; x < trimW; x++) {
      const srcIdx = ((minY + y) * png.width + (minX + x)) * 4;
      const r = (png.data[srcIdx] >> 4) & 0x0f;
      const g = (png.data[srcIdx + 1] >> 4) & 0x0f;
      const b = (png.data[srcIdx + 2] >> 4) & 0x0f;
      const a = (png.data[srcIdx + 3] >> 4) & 0x0f;

      const dstIdx = (y * trimW + x) * 2;
      pixels[dstIdx] = (g << 4) | b;       // low byte
      pixels[dstIdx + 1] = (a << 4) | r;   // high byte
    }
  }

  return { width: trimW, height: trimH, pixels };
}

const SLOT_MAP: Record<string, string> = {
  Ring: "Ri",
  Pendant: "Pe",
  Face: "Af",
  Eye: "Ae",
  Earring: "Ae",
  Belt: "Be",
  Medal: "Me",
  Cap: "Cp",
  Coat: "Ma",
  Longcoat: "Ma",
  Pants: "Pn",
  Shoes: "So",
  Glove: "Gv",
  Shield: "Si",
  Cape: "Sr",
  Weapon: "Wp",
};

const STAT_FIELDS: Record<string, string> = {
  str: "incSTR",
  dex: "incDEX",
  int: "incINT",
  luk: "incLUK",
  hp: "incMHP",
  mp: "incMMP",
  watk: "incPAD",
  matk: "incMAD",
  wdef: "incPDD",
  mdef: "incMDD",
  acc: "incACC",
  avoid: "incEVA",
  speed: "incSpeed",
  jump: "incJump",
};

/** Build a complete .img binary blob for an equip item */
export function buildEquipImg(equip: EquipData, ks: Buffer): Buffer {
  const w = new ImgWriter(ks);
  const slot = SLOT_MAP[equip.subCategory] || "Ri";
  const stats = equip.stats || {};
  const reqs = equip.requirements || {};
  const flags = equip.flags || {};

  // Collect all info properties
  const props: Array<{ name: string; type: "int" | "string" | "canvas"; value: number | string }> = [];

  // Decode icon PNG if provided, otherwise 1x1 placeholder
  const icon: DecodedIcon = equip.iconPng
    ? decodePngToIcon(equip.iconPng)
    : { width: 1, height: 1, pixels: Buffer.from([0x00, 0x00]) };

  props.push({ name: "icon", type: "canvas", value: 0 });
  props.push({ name: "iconRaw", type: "canvas", value: 0 });

  // Slot
  props.push({ name: "islot", type: "string", value: slot });
  props.push({ name: "vslot", type: "string", value: slot });

  // Requirements
  props.push({ name: "reqJob", type: "int", value: reqs.job ?? 0 });
  props.push({ name: "reqLevel", type: "int", value: reqs.level ?? 0 });
  props.push({ name: "reqSTR", type: "int", value: reqs.str ?? 0 });
  props.push({ name: "reqDEX", type: "int", value: reqs.dex ?? 0 });
  props.push({ name: "reqINT", type: "int", value: reqs.int ?? 0 });
  props.push({ name: "reqLUK", type: "int", value: reqs.luk ?? 0 });

  // Flags and slots
  props.push({ name: "cash", type: "int", value: flags.cash ? 1 : 0 });
  props.push({ name: "slotMax", type: "int", value: stats.slots ?? 0 });
  if (stats.slots) props.push({ name: "tuc", type: "int", value: stats.slots });
  if (flags.tradeBlock)
    props.push({ name: "tradeBlock", type: "int", value: 1 });
  if (flags.only) props.push({ name: "only", type: "int", value: 1 });
  if (flags.notSale) props.push({ name: "notSale", type: "int", value: 1 });

  // Stats
  for (const [key, wzField] of Object.entries(STAT_FIELDS)) {
    if (stats[key] && stats[key] !== 0) {
      props.push({ name: wzField, type: "int", value: stats[key] });
    }
  }

  // Build the .img: root SubProperty → "info" SubProperty → properties
  // Root "Property"
  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0); // reserved
  w.writeCompressedInt(1); // 1 child: "info"

  // "info" property name
  w.writeStringBlock("info", 0x00, 0x01);
  w.writeByte(9); // extended type
  const infoLenPos = w.pos;
  w.writeInt32(0); // placeholder for block length

  // "info" SubProperty
  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0); // reserved
  w.writeCompressedInt(props.length);

  for (const prop of props) {
    w.writeStringBlock(prop.name, 0x00, 0x01);

    if (prop.type === "int") {
      w.writeByte(3); // WzIntProperty
      w.writeCompressedInt(prop.value as number);
    } else if (prop.type === "string") {
      w.writeByte(8); // WzStringProperty
      w.writeStringBlock(prop.value as string, 0x00, 0x01);
    } else if (prop.type === "canvas") {
      w.writeByte(9); // extended
      const canvasLenPos = w.pos;
      w.writeInt32(0); // placeholder

      w.writeStringBlock("Canvas", 0x73, 0x1b);
      w.writeByte(0); // unknown
      // Sub-properties: origin vector
      w.writeByte(1); // has properties
      w.writeUInt16(0); // reserved
      w.writeCompressedInt(1); // 1 property: origin

      // origin vector
      w.writeStringBlock("origin", 0x00, 0x01);
      w.writeByte(9); // extended
      const vecLenPos = w.pos;
      w.writeInt32(0);
      w.writeStringBlock("Shape2D#Vector2D", 0x73, 0x1b);
      w.writeCompressedInt(-4); // X
      w.writeCompressedInt(icon.height); // Y = height (bottom origin)
      w.patchInt32(vecLenPos, w.pos - vecLenPos - 4);

      // Canvas data (BGRA4444 = format 1)
      w.writeCompressedInt(icon.width);
      w.writeCompressedInt(icon.height);
      w.writeCompressedInt(1); // format1 (BGRA4444)
      w.writeCompressedInt(0); // format2
      w.writeInt32(0); // reserved
      const compressed = deflateSync(icon.pixels);
      w.writeInt32(compressed.length + 1); // +1 for header byte
      w.writeByte(0); // header byte
      w.writeBytes(compressed);

      w.patchInt32(canvasLenPos, w.pos - canvasLenPos - 4);
    }
  }

  // Patch info block length
  w.patchInt32(infoLenPos, w.pos - infoLenPos - 4);

  return w.toBuffer();
}

// ---------- Weapon .img Building ----------

export interface WeaponFrame {
  /** Raw PNG file buffer for this animation frame */
  pngBuf: Buffer;
  /** Origin X (anchor point in sprite, near top-left for weapons) */
  originX: number;
  /** Origin Y */
  originY: number;
  /** Attachment point X (hand grip or navel center) */
  attachX: number;
  /** Attachment point Y */
  attachY: number;
  /** Attachment type: "hand" for stand/walk, "navel" for attack animations */
  attachType: "hand" | "navel";
  /** Z-layer: "weapon" for stand/walk, "weaponBelowBody" for attacks */
  z: string;
}

export interface WeaponData {
  itemId: number;
  weaponType: string;
  attackSpeed: number;
  afterImage: string;
  sfx: string;
  stats: Record<string, number>;
  requirements: Record<string, number>;
  flags: Record<string, boolean>;
  /** Icon PNG buffer */
  iconPng?: Buffer;
  /** Animation name → array of frames */
  animations: Record<string, WeaponFrame[]>;
}

/** Weapon type metadata — afterImage/sfx/attack values derived from real v83 WZ data */
export const WEAPON_TYPES: Record<
  string,
  {
    label: string; prefix: number; afterImage: string; sfx: string;
    attack: number; walk: number; stand: number;
    animations: string[];
  }
> = {
  "1h-sword": { label: "One-Handed Sword", prefix: 1302, afterImage: "swordOL", sfx: "swordL",
    attack: 1, walk: 1, stand: 1,
    animations: ["walk1","stand1","alert","swingO1","swingO2","swingO3","swingOF","stabO1","stabO2","stabOF","proneStab","prone","heal","fly","jump"] },
  "1h-axe": { label: "One-Handed Axe", prefix: 1312, afterImage: "axe", sfx: "axe",
    attack: 1, walk: 1, stand: 1,
    animations: ["walk1","stand1","alert","swingO1","swingO2","swingO3","swingOF","stabO1","stabO2","stabOF","proneStab","prone","heal","fly","jump"] },
  "1h-mace": { label: "One-Handed Mace", prefix: 1322, afterImage: "mace", sfx: "mace",
    attack: 1, walk: 1, stand: 1,
    animations: ["walk1","stand1","alert","swingO1","swingO2","swingO3","swingOF","stabO1","stabO2","stabOF","proneStab","prone","heal","fly","jump"] },
  dagger: { label: "Dagger", prefix: 1332, afterImage: "swordOL", sfx: "swordL",
    attack: 1, walk: 1, stand: 1,
    animations: ["walk1","stand1","alert","swingO1","swingO2","swingO3","swingOF","stabO1","stabO2","stabOF","proneStab","prone","heal","fly","jump"] },
  wand: { label: "Wand", prefix: 1372, afterImage: "mace", sfx: "mace",
    attack: 6, walk: 1, stand: 1,
    animations: ["walk1","stand1","alert","swingO1","swingO2","swingO3","stabO1","shoot1","shootF","proneStab","prone","heal","fly","jump"] },
  staff: { label: "Staff", prefix: 1382, afterImage: "mace", sfx: "mace",
    attack: 6, walk: 1, stand: 1,
    animations: ["walk1","stand1","alert","swingO1","swingO2","swingO3","stabO1","shoot1","shootF","proneStab","prone","heal","fly","jump"] },
  "2h-sword": { label: "Two-Handed Sword", prefix: 1402, afterImage: "swordTL", sfx: "swordL",
    attack: 5, walk: 1, stand: 2,
    animations: ["walk1","stand2","alert","swingT1","swingT2","swingT3","swingTF","stabO1","stabO2","stabOF","proneStab","prone","heal","fly","jump"] },
  "2h-axe": { label: "Two-Handed Axe", prefix: 1412, afterImage: "axe", sfx: "axe",
    attack: 5, walk: 2, stand: 2,
    animations: ["walk2","stand2","alert","swingT1","swingT2","swingT3","swingTF","stabO1","stabO2","stabOF","proneStab","prone","heal","fly","jump"] },
  "2h-mace": { label: "Two-Handed Mace", prefix: 1422, afterImage: "mace", sfx: "mace",
    attack: 5, walk: 2, stand: 2,
    animations: ["walk2","stand2","alert","swingT1","swingT2","swingT3","swingTF","stabO1","stabO2","stabOF","proneStab","prone","heal","fly","jump"] },
  spear: { label: "Spear", prefix: 1432, afterImage: "spear", sfx: "spear",
    attack: 2, walk: 2, stand: 2,
    animations: ["walk2","stand2","alert","swingT2","swingP1","swingP2","swingPF","stabT1","stabT2","stabTF","proneStab","prone","fly","jump"] },
  polearm: { label: "Polearm", prefix: 1442, afterImage: "poleArm", sfx: "poleArm",
    attack: 2, walk: 2, stand: 2,
    animations: ["walk2","stand2","alert","swingT2","swingP1","swingP2","swingPF","stabT1","stabT2","stabTF","proneStab","prone","fly","jump"] },
  bow: { label: "Bow", prefix: 1452, afterImage: "bow", sfx: "bow",
    attack: 3, walk: 1, stand: 1,
    animations: ["walk1","stand1","alert","swingT1","swingT3","shoot1","shootF","proneStab","prone","fly","jump"] },
  crossbow: { label: "Crossbow", prefix: 1462, afterImage: "crossBow", sfx: "crossBow",
    attack: 4, walk: 2, stand: 2,
    animations: ["walk2","stand2","alert","swingT1","stabT1","shoot2","proneStab","prone","fly","jump"] },
  claw: { label: "Claw", prefix: 1472, afterImage: "swordOL", sfx: "swordL",
    attack: 7, walk: 1, stand: 1,
    animations: ["walk1","stand1","alert","swingO1","swingO2","swingO3","swingOF","stabO1","stabO2","stabOF","proneStab","prone","heal","fly","jump"] },
  knuckle: { label: "Knuckle", prefix: 1482, afterImage: "knuckle", sfx: "knuckle",
    attack: 8, walk: 1, stand: 1,
    animations: ["walk1","stand1","alert","swingO1","swingO2","swingO3","swingOF","stabO1","stabO2","stabOF","proneStab","prone","heal","fly","jump"] },
  gun: { label: "Gun", prefix: 1492, afterImage: "gun", sfx: "gun",
    attack: 9, walk: 1, stand: 1,
    animations: ["walk1","stand1","alert","swingO2","swingO3","swingOF","swingT1","swingT2","swingT3","swingTF","swingP1","swingP2","swingPF","stabT1","stabT2","stabTF","stabO1","stabO2","stabOF","shoot1","shoot2","shootF","proneStab","prone","heal","fly","jump"] },
};

/** Create a 1x1 transparent PNG buffer for placeholder animation frames */
function createPlaceholderPng(): Buffer {
  const png = new PNG({ width: 1, height: 1 });
  png.data[0] = 0; png.data[1] = 0; png.data[2] = 0; png.data[3] = 0;
  return PNG.sync.write(png);
}

/** Max pixel dimension for weapon sprites (real weapons are ≤69px) */
const MAX_WEAPON_DIM = 40;

/** Mirror a PNG horizontally and downscale if oversized.
 *  Weapon renders have tip pointing left; MapleStory needs tip pointing right. */
function processWeaponFrame(pngBuf: Buffer): { pngBuf: Buffer; scale: number; srcWidth: number } {
  const src = PNG.sync.read(pngBuf);
  const srcWidth = src.width;

  // Step 1: Mirror horizontally (flip left↔right so tip points right)
  const mirrored = new PNG({ width: src.width, height: src.height });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + (src.width - 1 - x)) * 4;
      const di = (y * src.width + x) * 4;
      mirrored.data[di] = src.data[si];
      mirrored.data[di + 1] = src.data[si + 1];
      mirrored.data[di + 2] = src.data[si + 2];
      mirrored.data[di + 3] = src.data[si + 3];
    }
  }

  // Step 2: Downscale if oversized
  const maxDim = Math.max(src.width, src.height);
  if (maxDim <= MAX_WEAPON_DIM) {
    return { pngBuf: PNG.sync.write(mirrored), scale: 1, srcWidth };
  }

  const scale = MAX_WEAPON_DIM / maxDim;
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const dst = new PNG({ width: dw, height: dh });

  for (let dy = 0; dy < dh; dy++) {
    const sy = Math.min(Math.floor(dy / scale), mirrored.height - 1);
    for (let dx = 0; dx < dw; dx++) {
      const sx = Math.min(Math.floor(dx / scale), mirrored.width - 1);
      const si = (sy * mirrored.width + sx) * 4;
      const di = (dy * dw + dx) * 4;
      dst.data[di] = mirrored.data[si];
      dst.data[di + 1] = mirrored.data[si + 1];
      dst.data[di + 2] = mirrored.data[si + 2];
      dst.data[di + 3] = mirrored.data[si + 3];
    }
  }
  return { pngBuf: PNG.sync.write(dst), scale, srcWidth };
}

/** Write a Vector2D extended property */
function writeVector(w: ImgWriter, name: string, x: number, y: number) {
  w.writeStringBlock(name, 0x00, 0x01);
  w.writeByte(9); // extended
  const lenPos = w.pos;
  w.writeInt32(0); // placeholder
  w.writeStringBlock("Shape2D#Vector2D", 0x73, 0x1b);
  w.writeCompressedInt(x);
  w.writeCompressedInt(y);
  w.patchInt32(lenPos, w.pos - lenPos - 4);
}

/** Write a canvas property with pixel data, sub-properties, and attachment point */
function writeWeaponCanvas(
  w: ImgWriter,
  name: string,
  icon: DecodedIcon,
  originX: number,
  originY: number,
  attachX: number,
  attachY: number,
  attachType: "hand" | "navel",
  zLayer: string
) {
  w.writeStringBlock(name, 0x00, 0x01);
  w.writeByte(9); // extended
  const canvasLenPos = w.pos;
  w.writeInt32(0); // placeholder

  w.writeStringBlock("Canvas", 0x73, 0x1b);
  w.writeByte(0); // unknown
  w.writeByte(1); // has sub-properties
  w.writeUInt16(0); // reserved
  w.writeCompressedInt(3); // 3 sub-props: origin, map, z

  // origin vector
  writeVector(w, "origin", originX, originY);

  // map sub-property containing attachment vector (hand or navel)
  w.writeStringBlock("map", 0x00, 0x01);
  w.writeByte(9); // extended
  const mapLenPos = w.pos;
  w.writeInt32(0); // placeholder
  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0); // reserved
  w.writeCompressedInt(1); // 1 child
  writeVector(w, attachType, attachX, attachY);
  w.patchInt32(mapLenPos, w.pos - mapLenPos - 4);

  // z string
  w.writeStringBlock("z", 0x00, 0x01);
  w.writeByte(8); // string type
  w.writeStringBlock(zLayer, 0x00, 0x01);

  // Canvas pixel data
  w.writeCompressedInt(icon.width);
  w.writeCompressedInt(icon.height);
  w.writeCompressedInt(1); // format1 (BGRA4444)
  w.writeCompressedInt(0); // format2
  w.writeInt32(0); // reserved
  const compressed = deflateSync(icon.pixels);
  w.writeInt32(compressed.length + 1);
  w.writeByte(0); // header
  w.writeBytes(compressed);

  w.patchInt32(canvasLenPos, w.pos - canvasLenPos - 4);
}

/** Write a simple icon canvas (origin only, no map/z) */
function writeIconCanvas(
  w: ImgWriter,
  name: string,
  icon: DecodedIcon,
  originX: number,
  originY: number
) {
  w.writeStringBlock(name, 0x00, 0x01);
  w.writeByte(9); // extended
  const canvasLenPos = w.pos;
  w.writeInt32(0); // placeholder

  w.writeStringBlock("Canvas", 0x73, 0x1b);
  w.writeByte(0); // unknown
  w.writeByte(1); // has sub-properties
  w.writeUInt16(0); // reserved
  w.writeCompressedInt(1); // 1 sub-prop: origin
  writeVector(w, "origin", originX, originY);

  w.writeCompressedInt(icon.width);
  w.writeCompressedInt(icon.height);
  w.writeCompressedInt(1); // BGRA4444
  w.writeCompressedInt(0);
  w.writeInt32(0);
  const compressed = deflateSync(icon.pixels);
  w.writeInt32(compressed.length + 1);
  w.writeByte(0);
  w.writeBytes(compressed);

  w.patchInt32(canvasLenPos, w.pos - canvasLenPos - 4);
}

/** Build a complete weapon .img binary blob with animation frames */
export function buildWeaponImg(weapon: WeaponData, ks: Buffer): Buffer {
  const w = new ImgWriter(ks);
  const stats = weapon.stats || {};
  const reqs = weapon.requirements || {};
  const flags = weapon.flags || {};

  // Decode icon
  const icon: DecodedIcon = weapon.iconPng
    ? decodePngToIcon(weapon.iconPng)
    : { width: 1, height: 1, pixels: Buffer.from([0x00, 0x00]) };

  // Build complete animation list: use required animations from WEAPON_TYPES,
  // filling missing ones by reusing frames from similar existing animations
  const wtMetaForAnims = WEAPON_TYPES[weapon.weaponType];
  const requiredAnims = wtMetaForAnims?.animations ?? Object.keys(weapon.animations);

  // Fallback mapping: missing anim → try these existing anims in order
  const ANIM_FALLBACKS: Record<string, string[]> = {
    alert:     ["stand1", "stand2"],
    prone:     ["proneStab", "stabO1", "stand1", "stand2"],
    heal:      ["alert", "stand1", "stand2"],
    fly:       ["stand1", "stand2", "alert"],
    jump:      ["stand1", "stand2", "alert"],
    swingO3:   ["swingO1", "swingO2", "swingOF"],
    swingOF:   ["swingO1", "swingO2", "swingO3"],
    stabO2:    ["stabO1", "stabOF"],
    stabOF:    ["stabO1", "stabO2"],
    shoot1:    ["stabO1", "alert", "stand1"],
    shootF:    ["shoot1", "stabO1", "alert", "stand1"],
    shoot2:    ["shoot1", "stabO1"],
    proneStab: ["stabO1", "stabO2"],
    swingT1:   ["swingO1", "swingO2"],
    swingT2:   ["swingO2", "swingO1"],
    swingT3:   ["swingO3", "swingO1"],
    swingTF:   ["swingOF", "swingO1"],
    swingP1:   ["swingO1", "swingT1"],
    swingP2:   ["swingO2", "swingT2"],
    swingPF:   ["swingOF", "swingTF"],
    stabT1:    ["stabO1"],
    stabT2:    ["stabO2", "stabO1"],
    stabTF:    ["stabOF", "stabO1"],
    walk2:     ["walk1"],
    stand2:    ["stand1"],
  };

  // Find first available fallback frames for a missing animation
  function findFallbackFrames(animName: string): WeaponFrame[] | null {
    const fallbacks = ANIM_FALLBACKS[animName] || [];
    for (const fb of fallbacks) {
      if (weapon.animations[fb]?.length > 0) {
        return weapon.animations[fb];
      }
    }
    // Last resort: use first frame from any available animation
    for (const frames of Object.values(weapon.animations)) {
      if (frames.length > 0) return [frames[0]];
    }
    return null;
  }

  // Merge: use provided frames where available, fallback for missing
  const allAnimations: Record<string, WeaponFrame[]> = {};
  for (const animName of requiredAnims) {
    if (weapon.animations[animName]?.length > 0) {
      allAnimations[animName] = weapon.animations[animName];
    } else {
      const fallback = findFallbackFrames(animName);
      if (fallback) {
        // Reuse fallback frames but adjust attachment type for this animation
        const isAttack = animName.startsWith("swing") || animName.startsWith("stab") ||
          animName.startsWith("shoot") || animName === "proneStab";
        allAnimations[animName] = fallback.map(f => ({
          ...f,
          attachType: isAttack ? "navel" as const : "hand" as const,
          z: isAttack ? "weaponBelowBody" : "weapon",
        }));
      } else {
        // Absolute fallback: 1x1 transparent (should never happen if any frames exist)
        const placeholderPng = createPlaceholderPng();
        allAnimations[animName] = [{
          pngBuf: placeholderPng,
          originX: 0, originY: 0,
          attachX: 0, attachY: 0,
          attachType: "hand",
          z: "weapon",
        }];
      }
    }
  }

  const animNames = Object.keys(allAnimations);

  // Root Property: info + each animation directory
  const rootChildCount = 1 + animNames.length;

  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0); // reserved
  w.writeCompressedInt(rootChildCount);

  // --- info sub-property ---
  // Look up weapon type metadata for correct attack/walk/stand values
  const wtMeta = WEAPON_TYPES[weapon.weaponType];
  const attackCode = wtMeta?.attack ?? 1;
  const walkVal = wtMeta?.walk ?? 1;
  const standVal = wtMeta?.stand ?? 1;

  const infoProps: Array<{
    name: string;
    type: "int" | "short" | "string" | "canvas";
    value: number | string;
  }> = [];

  infoProps.push({ name: "icon", type: "canvas", value: 0 });
  infoProps.push({ name: "iconRaw", type: "canvas", value: 0 });

  infoProps.push({ name: "islot", type: "string", value: "Wp" });
  infoProps.push({ name: "vslot", type: "string", value: "Wp" });
  infoProps.push({ name: "walk", type: "int", value: walkVal });
  infoProps.push({ name: "stand", type: "int", value: standVal });
  infoProps.push({ name: "attack", type: "short", value: attackCode });
  infoProps.push({ name: "attackSpeed", type: "int", value: weapon.attackSpeed });
  infoProps.push({ name: "afterImage", type: "string", value: weapon.afterImage });
  infoProps.push({ name: "sfx", type: "string", value: weapon.sfx });

  // Requirements
  infoProps.push({ name: "reqJob", type: "int", value: reqs.job ?? 0 });
  infoProps.push({ name: "reqLevel", type: "int", value: reqs.level ?? 0 });
  infoProps.push({ name: "reqSTR", type: "int", value: reqs.str ?? 0 });
  infoProps.push({ name: "reqDEX", type: "int", value: reqs.dex ?? 0 });
  infoProps.push({ name: "reqINT", type: "int", value: reqs.int ?? 0 });
  infoProps.push({ name: "reqLUK", type: "int", value: reqs.luk ?? 0 });

  infoProps.push({ name: "cash", type: "int", value: flags.cash ? 1 : 0 });
  infoProps.push({ name: "tuc", type: "int", value: stats.slots ?? 7 });
  if (flags.tradeBlock) infoProps.push({ name: "tradeBlock", type: "int", value: 1 });
  if (flags.only) infoProps.push({ name: "only", type: "int", value: 1 });
  if (flags.notSale) infoProps.push({ name: "notSale", type: "int", value: 1 });

  // Stats
  for (const [key, wzField] of Object.entries(STAT_FIELDS)) {
    if (stats[key] && stats[key] !== 0) {
      infoProps.push({ name: wzField, type: "int", value: stats[key] });
    }
  }

  // Write info
  w.writeStringBlock("info", 0x00, 0x01);
  w.writeByte(9); // extended
  const infoLenPos = w.pos;
  w.writeInt32(0); // placeholder

  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0);
  w.writeCompressedInt(infoProps.length);

  for (const prop of infoProps) {
    if (prop.type === "canvas") {
      // Center icon in the 32px inventory slot: originX = floor((width - 32) / 2).
      // Origin shifts the canvas anchor; canvas pixel 0 draws at slot x=-originX.
      // A 32-wide icon gives origin.x=0 (fills slot); wider icons hang by half
      // the excess on each side; narrower icons get slightly offset right.
      const iconOriginX = Math.floor((icon.width - 32) / 2);
      writeIconCanvas(w, prop.name, icon, iconOriginX, icon.height);
    } else if (prop.type === "short") {
      w.writeStringBlock(prop.name, 0x00, 0x01);
      w.writeByte(2); // WzShortProperty
      w.writeInt16(prop.value as number);
    } else if (prop.type === "int") {
      w.writeStringBlock(prop.name, 0x00, 0x01);
      w.writeByte(3);
      w.writeCompressedInt(prop.value as number);
    } else {
      w.writeStringBlock(prop.name, 0x00, 0x01);
      w.writeByte(8);
      w.writeStringBlock(prop.value as string, 0x00, 0x01);
    }
  }

  w.patchInt32(infoLenPos, w.pos - infoLenPos - 4);

  // --- Animation directories ---
  for (const animName of animNames) {
    const frames = allAnimations[animName];

    w.writeStringBlock(animName, 0x00, 0x01);
    w.writeByte(9); // extended
    const animLenPos = w.pos;
    w.writeInt32(0); // placeholder

    w.writeStringBlock("Property", 0x73, 0x1b);
    w.writeUInt16(0);
    w.writeCompressedInt(frames.length);

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      // Mirror horizontally (tip→right) and downscale oversized frames
      const processed = processWeaponFrame(frame.pngBuf);
      const frameIcon = decodePngToIcon(processed.pngBuf);
      // After horizontal flip, gripX mirrors: new = (srcWidth - 1 - old)
      const mirroredGripX = processed.srcWidth - 1 - frame.originX;
      const originX = Math.round(mirroredGripX * processed.scale);
      const originY = Math.round(frame.originY * processed.scale);
      const attachX = Math.round(frame.attachX * processed.scale);
      const attachY = Math.round(frame.attachY * processed.scale);

      // Frame sub-property "0", "1", "2", ...
      w.writeStringBlock(String(i), 0x00, 0x01);
      w.writeByte(9); // extended
      const frameLenPos = w.pos;
      w.writeInt32(0); // placeholder

      w.writeStringBlock("Property", 0x73, 0x1b);
      w.writeUInt16(0);
      w.writeCompressedInt(1); // 1 child: "weapon" canvas

      // Write the weapon canvas with origin, attachment, z
      writeWeaponCanvas(
        w,
        "weapon",
        frameIcon,
        originX,
        originY,
        attachX,
        attachY,
        frame.attachType,
        frame.z
      );

      w.patchInt32(frameLenPos, w.pos - frameLenPos - 4);
    }

    w.patchInt32(animLenPos, w.pos - animLenPos - 4);
  }

  return w.toBuffer();
}

/** Add a custom weapon to a parsed Character.wz */
export function addWeaponToCharacterWz(
  wzInfo: WzFileInfo,
  weapon: WeaponData
): void {
  const imgName = `${padItemId(weapon.itemId)}.img`;

  // Find or create the Weapon subdirectory
  let subDir = wzInfo.root.find(
    (e) => e.type === "dir" && e.name === "Weapon"
  );
  if (!subDir) {
    subDir = {
      type: "dir",
      name: "Weapon",
      blockSize: 0,
      checksum: 0,
      offset: 0,
      children: [],
    };
    wzInfo.root.push(subDir);
  }

  if (subDir.children?.some((e) => e.name === imgName)) return;

  const imgData = buildWeaponImg(weapon, wzInfo.keyStream);
  const checksum = computeChecksum(imgData);

  subDir.children!.push({
    type: "img",
    name: imgName,
    blockSize: imgData.length,
    checksum,
    offset: 0,
    data: imgData,
  });
}

/** Minimal writer for .img serialization (no offset encryption needed) */
class ImgWriter {
  private buf: Buffer;
  public pos: number;
  private ks: Buffer;
  /** String pool: string → position of WzString start (for reference-based caching) */
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

  writeByte(v: number) {
    this.ensure(1);
    this.buf[this.pos++] = v & 0xff;
  }
  writeInt16(v: number) {
    this.ensure(2);
    this.buf.writeInt16LE(v, this.pos);
    this.pos += 2;
  }
  writeUInt16(v: number) {
    this.ensure(2);
    this.buf.writeUInt16LE(v, this.pos);
    this.pos += 2;
  }
  writeInt32(v: number) {
    this.ensure(4);
    this.buf.writeInt32LE(v, this.pos);
    this.pos += 4;
  }
  writeBytes(data: Buffer) {
    this.ensure(data.length);
    data.copy(this.buf, this.pos);
    this.pos += data.length;
  }

  writeCompressedInt(value: number) {
    if (value > 127 || value <= -128) {
      this.writeByte(0x80);
      this.writeInt32(value);
    } else {
      this.writeByte(value & 0xff);
    }
  }

  writeWzString(s: string) {
    if (s.length === 0) {
      this.writeByte(0);
      return;
    }
    const len = s.length;
    if (len > 127) {
      this.writeByte(0x80);
      this.writeInt32(len);
    } else {
      this.writeByte((-len) & 0xff);
    }
    let mask = 0xaa;
    for (let i = 0; i < len; i++) {
      let b = s.charCodeAt(i) & 0xff;
      b ^= this.ks[i] || 0;
      b ^= mask++ & 0xff;
      this.writeByte(b);
    }
  }

  writeStringBlock(s: string, withoutOffset: number, withOffset: number) {
    // String pool: if string was seen before and length > 4, write reference
    if (s.length > 4 && this.stringPool.has(s)) {
      this.writeByte(withOffset);
      this.writeInt32(this.stringPool.get(s)!);
    } else {
      this.writeByte(withoutOffset);
      const strStart = this.pos; // position where WzString starts
      this.writeWzString(s);
      if (!this.stringPool.has(s)) {
        this.stringPool.set(s, strStart);
      }
    }
  }

  patchInt32(pos: number, value: number) {
    this.buf.writeInt32LE(value, pos);
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buf.subarray(0, this.pos));
  }
}

// ---------- String.wz Eqp.img Patching ----------

interface StringEntry {
  itemId: number;
  name: string;
  desc: string;
  sectionName: string; // "Ring", "Accessory", "Cap", etc.
}

const STRING_SECTIONS: Record<string, string> = {
  Ring: "Ring",
  Pendant: "Accessory",
  Face: "Accessory",
  Eye: "Accessory",
  Earring: "Accessory",
  Belt: "Accessory",
  Medal: "Accessory",
  Cap: "Cap",
  Coat: "Top",
  Longcoat: "Overall",
  Pants: "Bottom",
  Shoes: "Shoes",
  Glove: "Glove",
  Shield: "Shield",
  Cape: "Cape",
  Weapon: "Weapon",
};

export function getSectionName(subCategory: string): string {
  return STRING_SECTIONS[subCategory] || "Accessory";
}

/** Parse and modify Eqp.img binary data to add string entries */
export function patchEqpImg(
  imgData: Buffer,
  newEntries: StringEntry[],
  ks: Buffer
): Buffer {
  // Parse the property tree
  const reader = new ImgReader(imgData, ks);
  const tree = reader.parseRoot();

  // Add entries to the appropriate sections
  for (const entry of newEntries) {
    addStringToSection(tree, entry);
  }

  // Re-serialize
  const writer = new ImgWriter(ks);
  writePropertyTree(writer, tree);
  return writer.toBuffer();
}

// Simple property tree for String.wz parsing
interface PropNode {
  name: string;
  type: "sub" | "string" | "int" | "other";
  value?: string | number;
  children?: PropNode[];
  // For 'other' types, keep raw bytes
  rawBytes?: Buffer;
}

class ImgReader {
  private buf: Buffer;
  private pos: number;
  private ks: Buffer;

  constructor(buf: Buffer, ks: Buffer) {
    this.buf = buf;
    this.pos = 0;
    this.ks = ks;
  }

  readByte(): number {
    return this.buf[this.pos++];
  }
  readInt8(): number {
    return this.buf.readInt8(this.pos++ - 0);
  }
  readUInt16(): number {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  readInt32(): number {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  readFloat(): number {
    const v = this.buf.readFloatLE(this.pos);
    this.pos += 4;
    return v;
  }
  readDouble(): number {
    const v = this.buf.readDoubleLE(this.pos);
    this.pos += 8;
    return v;
  }

  readCompressedInt(): number {
    const sb = this.buf.readInt8(this.pos++);
    return sb === -128 ? this.readInt32() : sb;
  }

  readWzString(): string {
    const smallLen = this.buf.readInt8(this.pos++);
    if (smallLen === 0) return "";

    if (smallLen > 0) {
      const len = smallLen === 127 ? this.readInt32() : smallLen;
      let mask = 0xaaaa;
      const chars: number[] = [];
      for (let i = 0; i < len; i++) {
        let ch = this.buf.readUInt16LE(this.pos);
        this.pos += 2;
        ch ^= ((this.ks[i * 2 + 1] || 0) << 8) | (this.ks[i * 2] || 0);
        ch ^= mask++;
        chars.push(ch);
      }
      return String.fromCharCode(...chars);
    } else {
      const len = smallLen === -128 ? this.readInt32() : -smallLen;
      let mask = 0xaa;
      const bytes: number[] = [];
      for (let i = 0; i < len; i++) {
        let b = this.buf[this.pos++];
        b ^= this.ks[i] || 0;
        b ^= mask++ & 0xff;
        bytes.push(b);
      }
      return Buffer.from(bytes).toString("ascii");
    }
  }

  readStringBlock(): string {
    const type = this.readByte();
    if (type === 0x00 || type === 0x73) {
      return this.readWzString();
    } else if (type === 0x01 || type === 0x1b) {
      const offset = this.readInt32();
      const saved = this.pos;
      this.pos = offset;
      const str = this.readWzString();
      this.pos = saved;
      return str;
    }
    return "";
  }

  parseRoot(): PropNode {
    // Root is a SubProperty
    const typeName = this.readStringBlock(); // "Property"
    if (typeName !== "Property")
      throw new Error(`Expected 'Property', got '${typeName}'`);

    return {
      name: "",
      type: "sub",
      children: this.parsePropertyList(),
    };
  }

  parsePropertyList(): PropNode[] {
    this.readUInt16(); // reserved 2 bytes
    const count = this.readCompressedInt();
    const props: PropNode[] = [];

    for (let i = 0; i < count; i++) {
      const name = this.readStringBlock();
      const propType = this.readByte();

      switch (propType) {
        case 0: // Null
          props.push({ name, type: "other", value: 0 });
          break;
        case 2: // Short
        case 11: {
          const v = this.buf.readInt16LE(this.pos);
          this.pos += 2;
          props.push({ name, type: "int", value: v });
          break;
        }
        case 3:
        case 19: // CompressedInt
          props.push({
            name,
            type: "int",
            value: this.readCompressedInt(),
          });
          break;
        case 4: {
          // Float
          const fb = this.readByte();
          const fv = fb === 0x80 ? this.readFloat() : 0;
          props.push({ name, type: "int", value: fv });
          break;
        }
        case 5: // Double
          props.push({ name, type: "int", value: this.readDouble() });
          break;
        case 8: // String
          props.push({
            name,
            type: "string",
            value: this.readStringBlock(),
          });
          break;
        case 9: {
          // Extended (SubProperty, Canvas, Vector, UOL, Sound)
          const blockLen = this.readInt32();
          const blockEnd = this.pos + blockLen;
          const extTypeName = this.readStringBlock();

          if (extTypeName === "Property") {
            props.push({
              name,
              type: "sub",
              children: this.parsePropertyList(),
            });
          } else {
            // For other extended types, keep raw bytes
            const rawStart = this.pos;
            this.pos = blockEnd;
            props.push({
              name,
              type: "other",
              rawBytes: Buffer.concat([
                // Include the type name for re-serialization
                serializeStringBlock(extTypeName, this.ks),
                this.buf.subarray(rawStart, blockEnd),
              ]),
            });
          }
          break;
        }
        case 20: {
          // Long
          const longSb = this.buf.readInt8(this.pos++);
          const longVal =
            longSb === -128
              ? Number(this.buf.readBigInt64LE(this.pos))
              : longSb;
          if (longSb === -128) this.pos += 8;
          props.push({ name, type: "int", value: longVal });
          break;
        }
        default:
          throw new Error(
            `Unknown property type ${propType} at pos ${this.pos - 1}`
          );
      }
    }
    return props;
  }
}

/**
 * Public wrapper around ImgReader so tools outside this module (e.g. the
 * read-only WZ explorer) can parse .img bytes into a PropNode tree without
 * pulling the whole file's machinery in.
 */
export function parseImgBytes(imgData: Buffer, keyStream: Buffer): PropNode {
  const reader = new ImgReader(imgData, keyStream);
  return reader.parseRoot();
}

export type { PropNode };

function serializeStringBlock(s: string, ks: Buffer): Buffer {
  const w = new ImgWriter(ks);
  w.writeStringBlock(s, 0x73, 0x1b);
  return w.toBuffer();
}

/**
 * Set a string-typed child by name, replacing any existing child of any type
 * with the same name. Used by all three String.wz patchers so a republish
 * with an updated name actually overwrites the prior value instead of being
 * silently dropped.
 */
function upsertStringChild(parent: PropNode, name: string, value: string) {
  if (!parent.children) parent.children = [];
  const idx = parent.children.findIndex((c) => c.name === name);
  const node: PropNode = { name, type: "string", value };
  if (idx >= 0) parent.children[idx] = node;
  else parent.children.push(node);
}

function addStringToSection(tree: PropNode, entry: StringEntry) {
  // Navigate: root → "Eqp" → sectionName. Create either if missing — v83
  // String.wz has Eqp.img/Eqp/<EquipSection> for stock equip categories, but
  // not for cosmetic hair/face IDs we add ourselves. Creating the missing
  // node lets the client look up custom hair/face names by the same path.
  if (!tree.children) tree.children = [];
  let eqp = tree.children.find((c) => c.name === "Eqp");
  if (!eqp) {
    eqp = { name: "Eqp", type: "sub", children: [] };
    tree.children.push(eqp);
  }
  if (!eqp.children) eqp.children = [];

  let section = eqp.children.find((c) => c.name === entry.sectionName);
  if (!section) {
    section = { name: entry.sectionName, type: "sub", children: [] };
    eqp.children.push(section);
  }
  if (!section.children) section.children = [];

  let item = section.children.find((c) => c.name === String(entry.itemId));
  if (!item) {
    item = { name: String(entry.itemId), type: "sub", children: [] };
    section.children.push(item);
  }
  upsertStringChild(item, "name", entry.name);
  // Stock v83 hair/face entries have only `name`; equip entries have name+desc.
  // Skip the desc node entirely when empty so cosmetic injections don't
  // accumulate empty strings the server will never read.
  if (entry.desc) upsertStringChild(item, "desc", entry.desc);
}

function writePropertyTree(writer: ImgWriter, node: PropNode) {
  // Root level
  writer.writeStringBlock("Property", 0x73, 0x1b);
  writePropertyList(writer, node.children || []);
}

function writePropertyList(writer: ImgWriter, props: PropNode[]) {
  writer.writeUInt16(0); // reserved
  writer.writeCompressedInt(props.length);

  for (const prop of props) {
    writer.writeStringBlock(prop.name, 0x00, 0x01);

    switch (prop.type) {
      case "int":
        writer.writeByte(3);
        writer.writeCompressedInt(prop.value as number);
        break;
      case "string":
        writer.writeByte(8);
        writer.writeStringBlock(prop.value as string, 0x00, 0x01);
        break;
      case "sub": {
        writer.writeByte(9);
        const lenPos = writer.pos;
        writer.writeInt32(0); // placeholder
        writer.writeStringBlock("Property", 0x73, 0x1b);
        writePropertyList(writer, prop.children || []);
        writer.patchInt32(lenPos, writer.pos - lenPos - 4);
        break;
      }
      case "other": {
        if (prop.rawBytes) {
          writer.writeByte(9);
          const lenPos2 = writer.pos;
          writer.writeInt32(0);
          writer.writeBytes(prop.rawBytes);
          writer.patchInt32(lenPos2, writer.pos - lenPos2 - 4);
        } else {
          writer.writeByte(0); // null
        }
        break;
      }
    }
  }
}

// ---------- WZ File Saving ----------

export function saveWzFile(
  wzInfo: WzFileInfo,
  outputPath: string
): void {
  const { header, versionHash, keyStream: ks, iv } = wzInfo;
  const { header: versionHeaderByte } = computeVersionHash(wzInfo.version);
  const fstart = header.fstart;

  // 1. Calculate directory sizes and assign offsets
  const totalDirSize = getTotalDirectorySize(wzInfo.root);
  const imageStartOffset = fstart + 2 + totalDirSize;

  // Assign directory offsets (where child entries start)
  let dirOffset = fstart + 2; // root starts right after version
  assignDirectoryOffsets(wzInfo.root, dirOffset);

  // Assign image offsets (where .img data starts)
  assignImageOffsets(wzInfo.root, imageStartOffset);

  // 2. Build directory buffer
  const dirWriter = new WzWriter(ks, versionHash, fstart);
  writeDirEntries(dirWriter, wzInfo.root);
  const dirBuf = dirWriter.toBuffer();

  // 3. Write output file
  const fd = openSync(outputPath, "w");
  try {
    let writePos = 0;

    // Header
    const headerBuf = Buffer.alloc(fstart);
    headerBuf.write("PKG1", 0, 4, "ascii");
    // fsize will be patched later
    headerBuf.writeUInt32LE(fstart, 12);
    const copyrightBytes = Buffer.from(header.copyright + "\0", "ascii");
    copyrightBytes.copy(headerBuf, 16);
    writeSync(fd, headerBuf, 0, fstart, writePos);
    writePos += fstart;

    // Version header (2 bytes)
    const versionBuf = Buffer.alloc(2);
    versionBuf.writeUInt16LE(versionHeaderByte, 0);
    writeSync(fd, versionBuf, 0, 2, writePos);
    writePos += 2;

    // Directory
    writeSync(fd, dirBuf, 0, dirBuf.length, writePos);
    writePos += dirBuf.length;

    // Image data (in depth-first order matching assignImageOffsets)
    writePos = writeImageData(fd, wzInfo.root, writePos, wzInfo.filePath);

    // Patch file size in header
    const fsizeBuf = Buffer.alloc(8);
    fsizeBuf.writeBigUInt64LE(BigInt(writePos - fstart), 0);
    writeSync(fd, fsizeBuf, 0, 8, 4);

    closeSync(fd);
  } catch (err) {
    try {
      closeSync(fd);
    } catch {}
    try {
      unlinkSync(outputPath);
    } catch {}
    throw err;
  }
}

function writeDirEntries(writer: WzWriter, entries: WzEntry[]) {
  writer.writeCompressedInt(entries.length);

  for (const entry of entries) {
    writer.writeObjectEntry(
      entry.name,
      entry.type === "dir" ? 3 : 4
    );
    writer.writeCompressedInt(entry.blockSize);
    writer.writeCompressedInt(entry.checksum);
    writer.writeOffset(entry.offset);
  }

  // Recurse into subdirectories
  for (const entry of entries) {
    if (entry.type === "dir" && entry.children) {
      if (entry.children.length > 0) {
        writeDirEntries(writer, entry.children);
      } else {
        writer.writeByte(0); // empty dir
      }
    }
  }
}

function writeImageData(
  outputFd: number,
  entries: WzEntry[],
  writePos: number,
  originalPath: string
): number {
  const CHUNK = 65536;
  const chunkBuf = Buffer.alloc(CHUNK);

  for (const entry of entries) {
    if (entry.type === "img") {
      if (entry.data) {
        // New image: write from buffer
        writeSync(outputFd, entry.data, 0, entry.data.length, writePos);
        writePos += entry.data.length;
      } else if (entry.originalOffset !== undefined) {
        // Existing image: copy from original file
        const origFd = openSync(originalPath, "r");
        try {
          let remaining = entry.blockSize;
          let srcOffset = entry.originalOffset;
          while (remaining > 0) {
            const toRead = Math.min(CHUNK, remaining);
            readSync(origFd, chunkBuf, 0, toRead, srcOffset);
            writeSync(outputFd, chunkBuf, 0, toRead, writePos);
            srcOffset += toRead;
            writePos += toRead;
            remaining -= toRead;
          }
        } finally {
          closeSync(origFd);
        }
      }
    }
  }

  // Recurse into subdirectories
  for (const entry of entries) {
    if (entry.type === "dir" && entry.children) {
      writePos = writeImageData(
        outputFd,
        entry.children,
        writePos,
        originalPath
      );
    }
  }

  return writePos;
}

// ---------- High-Level Patch API ----------

function padItemId(id: number): string {
  return String(id).padStart(8, "0");
}

function computeChecksum(data: Buffer): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) | 0;
  }
  return sum;
}

const SUB_CATEGORY_DIRS: Record<string, string> = {
  Ring: "Ring",
  Pendant: "Accessory",
  Face: "Accessory",
  Eye: "Accessory",
  Earring: "Accessory",
  Belt: "Accessory",
  Medal: "Accessory",
  Cap: "Cap",
  Coat: "Coat",
  Longcoat: "Longcoat",
  Pants: "Pants",
  Shoes: "Shoes",
  Glove: "Glove",
  Shield: "Shield",
  Cape: "Cape",
  Weapon: "Weapon",
};

/** Add a custom equip item to a parsed Character.wz */
export function addEquipToCharacterWz(
  wzInfo: WzFileInfo,
  equip: EquipData
): void {
  const dirName = SUB_CATEGORY_DIRS[equip.subCategory] || "Ring";
  const imgName = `${padItemId(equip.itemId)}.img`;

  // Find or create the subdirectory
  let subDir = wzInfo.root.find(
    (e) => e.type === "dir" && e.name === dirName
  );
  if (!subDir) {
    subDir = {
      type: "dir",
      name: dirName,
      blockSize: 0,
      checksum: 0,
      offset: 0,
      children: [],
    };
    wzInfo.root.push(subDir);
  }

  // Check if image already exists
  if (subDir.children?.some((e) => e.name === imgName)) return;

  // Build the .img data
  const imgData = buildEquipImg(equip, wzInfo.keyStream);
  const checksum = computeChecksum(imgData);

  subDir.children!.push({
    type: "img",
    name: imgName,
    blockSize: imgData.length,
    checksum,
    offset: 0, // will be computed during save
    data: imgData,
  });
}

/**
 * Inject a pre-built .img blob into Character.wz at /Hair/<id>.img or /Face/<id>.img.
 *
 * The buffer must be the raw bytes of a standalone .img file extracted from a
 * GMS-encrypted WZ (same XOR keystream as v83). HaRepacker's "Save .img" output
 * works directly. If an .img with the same name is already present it is
 * replaced (so re-uploading a fixed asset overwrites the prior version).
 */
export function addImgToCharacterWz(
  wzInfo: WzFileInfo,
  opts: { dirName: "Hair" | "Face"; id: number; imgData: Buffer }
): void {
  const imgName = `${padItemId(opts.id)}.img`;

  let subDir = wzInfo.root.find(
    (e) => e.type === "dir" && e.name === opts.dirName
  );
  if (!subDir) {
    subDir = {
      type: "dir",
      name: opts.dirName,
      blockSize: 0,
      checksum: 0,
      offset: 0,
      children: [],
    };
    wzInfo.root.push(subDir);
  }

  const checksum = computeChecksum(opts.imgData);
  const newEntry: WzEntry = {
    type: "img",
    name: imgName,
    blockSize: opts.imgData.length,
    checksum,
    offset: 0,
    data: opts.imgData,
  };

  const existingIdx = subDir.children!.findIndex((e) => e.name === imgName);
  if (existingIdx >= 0) {
    subDir.children![existingIdx] = newEntry;
  } else {
    subDir.children!.push(newEntry);
  }
}

/** Modify Eqp.img in a parsed String.wz to add item names */
export function addStringsToStringWz(
  wzInfo: WzFileInfo,
  entries: StringEntry[]
): void {
  // Find Eqp.img in root directory
  const eqpEntry = wzInfo.root.find(
    (e) => e.type === "img" && e.name === "Eqp.img"
  );
  if (!eqpEntry)
    throw new Error("Eqp.img not found in String.wz");

  // Read the original .img data
  const origFd = openSync(wzInfo.filePath, "r");
  let imgData: Buffer;
  try {
    imgData = Buffer.alloc(eqpEntry.blockSize);
    readSync(
      origFd,
      imgData,
      0,
      eqpEntry.blockSize,
      eqpEntry.originalOffset!
    );
  } finally {
    closeSync(origFd);
  }

  // Parse, modify, and re-serialize
  const newImgData = patchEqpImg(imgData, entries, wzInfo.keyStream);
  const checksum = computeChecksum(newImgData);

  // Replace the entry
  eqpEntry.blockSize = newImgData.length;
  eqpEntry.checksum = checksum;
  eqpEntry.data = newImgData;
  eqpEntry.originalOffset = undefined; // use data instead of copying from original
}

// ---------- Item.wz Etc bucket building ----------
//
// Custom ETC items live in a brand-new 0409.img bucket (empty in v83 stock).
// We rebuild the entire bucket from scratch on every publish — that way the
// resulting file has self-contained string-pool offsets and we never risk
// relocating an existing canvas's offsets when reserializing.

interface EtcItemEntry {
  itemId: number;
  iconPng?: Buffer;
  slotMax?: number;
  price?: number;
  quest?: number;
}

/** Build a complete Item.wz/Etc/<bucket>.img blob from a list of ETC items. */
export function buildEtcBucketImg(items: EtcItemEntry[], ks: Buffer): Buffer {
  const w = new ImgWriter(ks);
  w.writeStringBlock("Property", 0x73, 0x1b);
  w.writeUInt16(0);
  w.writeCompressedInt(items.length);

  for (const item of items) {
    w.writeStringBlock(String(item.itemId), 0x00, 0x01);
    w.writeByte(9);
    const itemLenPos = w.pos;
    w.writeInt32(0);
    w.writeStringBlock("Property", 0x73, 0x1b);
    w.writeUInt16(0);
    w.writeCompressedInt(1); // 1 child: info

    w.writeStringBlock("info", 0x00, 0x01);
    w.writeByte(9);
    const infoLenPos = w.pos;
    w.writeInt32(0);
    w.writeStringBlock("Property", 0x73, 0x1b);
    w.writeUInt16(0);

    const slotMax = item.slotMax ?? 100;
    const price = item.price ?? 0;
    const quest = item.quest ?? 0;
    const childCount =
      (item.iconPng ? 1 : 0) + 2 + (quest ? 1 : 0); // icon? + slotMax + price + quest?
    w.writeCompressedInt(childCount);

    if (item.iconPng) {
      const icon = decodePngToIcon(item.iconPng);
      writeIconCanvas(w, "icon", icon, 0, icon.height);
    }
    w.writeStringBlock("slotMax", 0x00, 0x01);
    w.writeByte(3);
    w.writeCompressedInt(slotMax);
    w.writeStringBlock("price", 0x00, 0x01);
    w.writeByte(3);
    w.writeCompressedInt(price);
    if (quest) {
      w.writeStringBlock("quest", 0x00, 0x01);
      w.writeByte(3);
      w.writeCompressedInt(quest);
    }

    w.patchInt32(infoLenPos, w.pos - infoLenPos - 4);
    w.patchInt32(itemLenPos, w.pos - itemLenPos - 4);
  }

  return w.toBuffer();
}

/**
 * Inject (or replace) an ETC bucket .img into Item.wz under /Etc/<bucketName>.
 * The bucket is built from scratch each call so existing canvas offsets
 * inside the bucket are never relocated.
 */
export function addEtcBucketToItemWz(
  wzInfo: WzFileInfo,
  bucketName: string,
  items: EtcItemEntry[]
): void {
  const imgData = buildEtcBucketImg(items, wzInfo.keyStream);
  const checksum = computeChecksum(imgData);

  let etcDir = wzInfo.root.find((e) => e.type === "dir" && e.name === "Etc");
  if (!etcDir) {
    etcDir = {
      type: "dir",
      name: "Etc",
      blockSize: 0,
      checksum: 0,
      offset: 0,
      children: [],
    };
    wzInfo.root.push(etcDir);
  }
  if (!etcDir.children) etcDir.children = [];

  const newEntry: WzEntry = {
    type: "img",
    name: bucketName,
    blockSize: imgData.length,
    checksum,
    offset: 0,
    data: imgData,
  };

  const idx = etcDir.children.findIndex((e) => e.name === bucketName);
  if (idx >= 0) etcDir.children[idx] = newEntry;
  else etcDir.children.push(newEntry);
}

/** Patch String.wz/Etc.img to add ETC item names + descriptions. */
export function addEtcStringsToStringWz(
  wzInfo: WzFileInfo,
  entries: Array<{ itemId: number; name: string; desc: string }>
): void {
  const etcEntry = wzInfo.root.find(
    (e) => e.type === "img" && e.name === "Etc.img"
  );
  if (!etcEntry) throw new Error("Etc.img not found in String.wz");

  const origFd = openSync(wzInfo.filePath, "r");
  let imgData: Buffer;
  try {
    imgData = Buffer.alloc(etcEntry.blockSize);
    readSync(origFd, imgData, 0, etcEntry.blockSize, etcEntry.originalOffset!);
  } finally {
    closeSync(origFd);
  }

  const reader = new ImgReader(imgData, wzInfo.keyStream);
  const tree = reader.parseRoot();
  if (!tree.children) tree.children = [];
  let etcSection = tree.children.find((c) => c.name === "Etc");
  if (!etcSection) {
    etcSection = { name: "Etc", type: "sub", children: [] };
    tree.children.push(etcSection);
  }
  if (!etcSection.children) etcSection.children = [];

  for (const e of entries) {
    let item = etcSection.children.find((c) => c.name === String(e.itemId));
    if (!item) {
      item = { name: String(e.itemId), type: "sub", children: [] };
      etcSection.children.push(item);
    }
    upsertStringChild(item, "name", e.name);
    if (e.desc) upsertStringChild(item, "desc", e.desc);
  }

  const writer = new ImgWriter(wzInfo.keyStream);
  writePropertyTree(writer, tree);
  const newImgData = writer.toBuffer();
  const checksum = computeChecksum(newImgData);

  etcEntry.blockSize = newImgData.length;
  etcEntry.checksum = checksum;
  etcEntry.data = newImgData;
  etcEntry.originalOffset = undefined;
}

/** Add an NPC name entry to Npc.img in a parsed String.wz */
export function addNpcToStringWz(
  wzInfo: WzFileInfo,
  npcId: number,
  name: string,
  dialogue?: string,
): void {
  const npcEntry = wzInfo.root.find(
    (e) => e.type === "img" && e.name === "Npc.img"
  );
  if (!npcEntry)
    throw new Error("Npc.img not found in String.wz");

  const origFd = openSync(wzInfo.filePath, "r");
  let imgData: Buffer;
  try {
    imgData = Buffer.alloc(npcEntry.blockSize);
    readSync(origFd, imgData, 0, npcEntry.blockSize, npcEntry.originalOffset!);
  } finally {
    closeSync(origFd);
  }

  // Parse the property tree
  const reader = new ImgReader(imgData, wzInfo.keyStream);
  const tree = reader.parseRoot();

  // Npc.img is flat: root children keyed by NPC ID string.
  if (!tree.children) tree.children = [];
  const npcIdStr = String(npcId);
  let item = tree.children.find((c) => c.name === npcIdStr);
  if (!item) {
    item = { name: npcIdStr, type: "sub", children: [] };
    tree.children.push(item);
  }
  upsertStringChild(item, "name", name);
  if (dialogue) upsertStringChild(item, "n0", dialogue);

  // Re-serialize
  const writer = new ImgWriter(wzInfo.keyStream);
  writePropertyTree(writer, tree);
  const newImgData = writer.toBuffer();
  const checksum = computeChecksum(newImgData);

  npcEntry.blockSize = newImgData.length;
  npcEntry.checksum = checksum;
  npcEntry.data = newImgData;
  npcEntry.originalOffset = undefined;
}
