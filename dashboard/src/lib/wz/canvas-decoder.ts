// Decode the rawBytes that ImgReader stores for "Canvas" / "Shape2D#Vector2D"
// extended properties. We can't reuse the main ImgReader directly because the
// rawBytes payload may contain offset string references (0x01 / 0x1b) that
// point into positions in the *original* .img buffer that are no longer
// addressable once the bytes are sliced out. So we walk the bytes manually
// and skip — rather than dereference — any offset string blocks.
//
// We only care about the canvas pixel data (width/height/format + zlib body)
// and the vector x/y; sub-property names like "origin" / "z" / "delay" are
// not surfaced in Phase 1.

import { PNG } from "pngjs";
import { inflateSync } from "zlib";

// ---- Manual byte-walker (no ImgReader dependency) ----

function readCompressedInt(buf: Buffer, pos: number): [number, number] {
  const sb = buf.readInt8(pos);
  pos++;
  if (sb === -128) return [buf.readInt32LE(pos), pos + 4];
  return [sb, pos];
}

/**
 * Skip past a WZ string block at `pos`, returning the new position. Doesn't
 * decode the string itself (caller doesn't care about the value, only the
 * byte length). Tolerates offset-mode string blocks (0x01 / 0x1b) by
 * consuming the 4-byte offset without seeking.
 */
function skipStringBlock(buf: Buffer, pos: number): number {
  const type = buf[pos++];
  if (type === 0x00 || type === 0x73) {
    // Inline encrypted string. Length byte is signed-int8.
    const smallLen = buf.readInt8(pos++);
    if (smallLen === 0) return pos;
    if (smallLen > 0) {
      // Wide-char: 2 bytes per char
      const len = smallLen === 127 ? buf.readInt32LE(pos) : smallLen;
      if (smallLen === 127) pos += 4;
      return pos + len * 2;
    } else {
      // Narrow-char: 1 byte per char
      const len = smallLen === -128 ? buf.readInt32LE(pos) : -smallLen;
      if (smallLen === -128) pos += 4;
      return pos + len;
    }
  }
  if (type === 0x01 || type === 0x1b) {
    // Offset reference. We don't follow it — just skip the 4-byte offset.
    return pos + 4;
  }
  // Unknown / null type (length 0)
  return pos;
}

/**
 * Skip past one property in a property list (used inside canvas sub-props).
 * Reads the prop name and value, returns the position after the value.
 */
function skipProperty(buf: Buffer, pos: number): number {
  pos = skipStringBlock(buf, pos); // prop name
  const type = buf[pos++];
  switch (type) {
    case 0: // Null
      return pos;
    case 2:
    case 11: // Short
      return pos + 2;
    case 3:
    case 19: {
      // CompressedInt
      const [, np] = readCompressedInt(buf, pos);
      return np;
    }
    case 4: {
      // Float (1 byte flag, possibly 4 bytes)
      const fb = buf.readInt8(pos++);
      return fb === -128 ? pos + 4 : pos;
    }
    case 5: // Double
      return pos + 8;
    case 8: // String
      return skipStringBlock(buf, pos);
    case 9: {
      // Extended block: 4-byte length, skip the body
      const blockLen = buf.readInt32LE(pos);
      return pos + 4 + blockLen;
    }
    case 20: {
      // Long
      const sb = buf.readInt8(pos++);
      return sb === -128 ? pos + 8 : pos;
    }
    default:
      throw new Error(
        `canvas-decoder: unknown property type ${type} at byte ${pos - 1}`
      );
  }
}

// ---- Pixel format conversion ----

function bgra4444ToRgba(pixels: Buffer, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  const expand = (v: number) => ((v & 0x0f) << 4) | (v & 0x0f);
  for (let i = 0; i < width * height; i++) {
    const lo = pixels[i * 2];
    const hi = pixels[i * 2 + 1];
    const dst = i * 4;
    out[dst + 0] = expand(hi & 0x0f); // R
    out[dst + 1] = expand(lo >> 4); // G
    out[dst + 2] = expand(lo & 0x0f); // B
    out[dst + 3] = expand(hi >> 4); // A
  }
  return out;
}

function bgra8888ToRgba(pixels: Buffer, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const src = i * 4;
    const dst = i * 4;
    out[dst + 0] = pixels[src + 2]; // R
    out[dst + 1] = pixels[src + 1]; // G
    out[dst + 2] = pixels[src + 0]; // B
    out[dst + 3] = pixels[src + 3]; // A
  }
  return out;
}

function bgr565ToRgba(pixels: Buffer, width: number, height: number): Buffer {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = pixels.readUInt16LE(i * 2);
    const r5 = (v >> 11) & 0x1f;
    const g6 = (v >> 5) & 0x3f;
    const b5 = v & 0x1f;
    const dst = i * 4;
    out[dst + 0] = (r5 << 3) | (r5 >> 2);
    out[dst + 1] = (g6 << 2) | (g6 >> 4);
    out[dst + 2] = (b5 << 3) | (b5 >> 2);
    out[dst + 3] = 255;
  }
  return out;
}

function placeholderRgba(width: number, height: number): Buffer {
  // Magenta-ish checker so unsupported formats are visually loud.
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const checker = ((x >> 2) ^ (y >> 2)) & 1;
    const dst = i * 4;
    out[dst + 0] = checker ? 255 : 80;
    out[dst + 1] = 0;
    out[dst + 2] = checker ? 255 : 80;
    out[dst + 3] = 200;
  }
  return out;
}

function pixelsToPng(
  pixels: Buffer,
  width: number,
  height: number,
  format: number
): Buffer {
  let rgba: Buffer;
  if (format === 1) rgba = bgra4444ToRgba(pixels, width, height);
  else if (format === 2) rgba = bgra8888ToRgba(pixels, width, height);
  else if (format === 513) rgba = bgr565ToRgba(pixels, width, height);
  else rgba = placeholderRgba(width, height);

  const png = new PNG({ width, height });
  rgba.copy(png.data);
  return PNG.sync.write(png);
}

// ---- Public decoders ----

export interface CanvasMetadata {
  width: number;
  height: number;
  format: number;
  formatSupported: boolean;
}

export interface CanvasDecoded extends CanvasMetadata {
  png: Buffer;
}

/** Walk past the type tag + sub-prop list and return the byte position
 *  of the canvas dimensions, plus the parsed dimensions/format. */
function readCanvasHeader(rawBytes: Buffer): {
  pos: number;
  width: number;
  height: number;
  format: number;
} {
  let pos = 0;
  // 1. Type tag (re-serialized inline as "Canvas")
  pos = skipStringBlock(rawBytes, pos);
  // 2. Two flag bytes
  pos++; // unknown (always 0)
  const hasSubProps = rawBytes[pos++] === 1;
  // 3. Sub-property list (skipped entirely)
  if (hasSubProps) {
    pos += 2; // reserved UInt16
    const [subCount, np] = readCompressedInt(rawBytes, pos);
    pos = np;
    for (let i = 0; i < subCount; i++) {
      pos = skipProperty(rawBytes, pos);
    }
  }
  // 4. Canvas dimensions / format
  const [width, p1] = readCompressedInt(rawBytes, pos);
  pos = p1;
  const [height, p2] = readCompressedInt(rawBytes, pos);
  pos = p2;
  const [format, p3] = readCompressedInt(rawBytes, pos);
  pos = p3;
  const [, p4] = readCompressedInt(rawBytes, pos);
  pos = p4;
  pos += 4; // reserved Int32(0)
  return { pos, width, height, format };
}

/** Cheap: peek width/height/format without inflating pixel data. */
export function peekCanvasMetadata(rawBytes: Buffer): CanvasMetadata {
  const { width, height, format } = readCanvasHeader(rawBytes);
  return {
    width,
    height,
    format,
    formatSupported: format === 1 || format === 2 || format === 513,
  };
}

/** Decode the rawBytes from a "Canvas" PropNode of type "other". */
export function decodeCanvasRawBytes(rawBytes: Buffer): CanvasDecoded {
  const header = readCanvasHeader(rawBytes);
  let pos = header.pos;
  const compressedLen = rawBytes.readInt32LE(pos) - 1;
  pos += 4;
  pos += 1; // reserved byte 0
  const compressedData = rawBytes.subarray(pos, pos + compressedLen);
  const decompressed = inflateSync(compressedData);

  const formatSupported =
    header.format === 1 || header.format === 2 || header.format === 513;
  const png = pixelsToPng(decompressed, header.width, header.height, header.format);
  return {
    width: header.width,
    height: header.height,
    format: header.format,
    formatSupported,
    png,
  };
}

export interface VectorDecoded {
  x: number;
  y: number;
}

/** Decode the rawBytes from a "Shape2D#Vector2D" PropNode of type "other". */
export function decodeVectorRawBytes(rawBytes: Buffer): VectorDecoded {
  let pos = 0;
  pos = skipStringBlock(rawBytes, pos); // type tag
  const [x, p1] = readCompressedInt(rawBytes, pos);
  pos = p1;
  const [y] = readCompressedInt(rawBytes, pos);
  return { x, y };
}

/** Best-effort: peek at the type tag bytes to identify what an "other" PropNode actually is. */
export function peekOtherTypeName(rawBytes: Buffer): string {
  // Same skipStringBlock walk, but return the inline string when we find one.
  let pos = 0;
  const type = rawBytes[pos++];
  if (type === 0x00 || type === 0x73) {
    const smallLen = rawBytes.readInt8(pos++);
    if (smallLen === 0) return "";
    if (smallLen > 0) {
      const len = smallLen === 127 ? rawBytes.readInt32LE(pos) : smallLen;
      if (smallLen === 127) pos += 4;
      // Wide-char string with WZ XOR encryption — but for type tags like
      // "Canvas" / "Shape2D#Vector2D" the unencrypted bytes are also ASCII;
      // attempt a fast inline decode by best-effort decryption.
      // We only actually need to recognize "Canvas" / "Shape2D#Vector2D",
      // both of which are <30 chars. Use a trial that tries the standard
      // wz wide-char decoding without keystream — close enough for ID.
      let mask = 0xaaaa;
      const codes: number[] = [];
      for (let i = 0; i < len; i++) {
        let ch = rawBytes.readUInt16LE(pos);
        pos += 2;
        ch ^= mask++;
        codes.push(ch);
      }
      return String.fromCharCode(...codes);
    } else {
      const len = smallLen === -128 ? rawBytes.readInt32LE(pos) : -smallLen;
      if (smallLen === -128) pos += 4;
      let mask = 0xaa;
      const out: number[] = [];
      for (let i = 0; i < len; i++) {
        let b = rawBytes[pos++];
        b ^= mask++ & 0xff;
        out.push(b);
      }
      return Buffer.from(out).toString("ascii");
    }
  }
  return "";
}
