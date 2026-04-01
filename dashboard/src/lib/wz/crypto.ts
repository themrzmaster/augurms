import { createCipheriv } from "crypto";

// GMS (old) IV for v83 WZ files
export const GMS_IV = Buffer.from([0x4d, 0x23, 0xc7, 0x2b]);
export const ZERO_IV = Buffer.from([0x00, 0x00, 0x00, 0x00]);

// AES-256 key extracted from 128-byte UserKey (every 16th byte)
export const USER_KEY = Buffer.from([
  0x13, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
  0xb4, 0x00, 0x00, 0x00, 0x1b, 0x00, 0x00, 0x00, 0x0f, 0x00, 0x00, 0x00,
  0x33, 0x00, 0x00, 0x00, 0x52, 0x00, 0x00, 0x00,
]);

export const WZ_OFFSET_CONSTANT = 0x581c3f6d;

export function generateKeyStream(iv: Buffer, length: number): Buffer {
  if (length === 0 || iv.every((b) => b === 0)) return Buffer.alloc(length);

  const result = Buffer.alloc(length);
  // Create 16-byte block by repeating the 4-byte IV
  let block = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) block[i] = iv[i % 4];

  let pos = 0;
  while (pos < length) {
    const cipher = createCipheriv("aes-256-ecb", USER_KEY, null);
    cipher.setAutoPadding(false);
    block = Buffer.concat([cipher.update(block), cipher.final()]);
    const toCopy = Math.min(16, length - pos);
    block.copy(result, pos, 0, toCopy);
    pos += toCopy;
  }
  return result;
}

export function computeVersionHash(version: number): {
  hash: number;
  header: number;
} {
  const s = version.toString();
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 32 + s.charCodeAt(i) + 1) | 0;
  }
  const header =
    (~(((hash >> 24) & 0xff) ^
      ((hash >> 16) & 0xff) ^
      ((hash >> 8) & 0xff) ^
      (hash & 0xff)) &
      0xff) >>>
    0;
  return { hash: hash >>> 0, header };
}

export function rotateLeft32(val: number, shift: number): number {
  shift &= 0x1f;
  return (((val << shift) | (val >>> (32 - shift))) & 0xffffffff) >>> 0;
}
