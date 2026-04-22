/**
 * 2D weapon sprite pipeline: concept image → rotated frames + icon.
 *
 * Replaces the 3D flow (concept → Tripo3D GLB → headless-gl render). For any
 * MapleStory-style concept (weapon pointing straight up, on a simple bg), we
 * rotate the bg-removed concept once per animation frame, downscale, outline,
 * and return the same shape as the old 3D pipeline.
 *
 * Same animation set as the 3D renderer — patcher.ts handles fallback to the
 * weapon-type-specific anim names (swingT2, swingP1, swingP2, stabT1, stabT2,
 * etc.) when we only provide the universal swingO-series / stabO-series set.
 */
import { PNG } from "pngjs";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createCanvas, createImageData } = require("canvas");

const ANIMATIONS: Record<string, { angle: number }[]> = {
  stand1: [{ angle: -45 }, { angle: -43 }, { angle: -45 }],
  walk1: [{ angle: -40 }, { angle: -45 }, { angle: -50 }, { angle: -45 }],
  alert: [{ angle: -60 }, { angle: -58 }, { angle: -60 }],
  swingO1: [{ angle: -120 }, { angle: -20 }, { angle: 40 }],
  swingO2: [{ angle: -70 }, { angle: 10 }, { angle: 80 }],
  swingO3: [{ angle: 80 }, { angle: -20 }, { angle: -70 }],
  swingOF: [{ angle: -100 }, { angle: 0 }, { angle: 70 }, { angle: -30 }],
  stabO1: [{ angle: -15 }, { angle: 5 }],
  stabO2: [{ angle: -10 }, { angle: 10 }],
  stabOF: [{ angle: -5 }, { angle: -10 }, { angle: 15 }],
  shoot1: [{ angle: 85 }, { angle: 88 }, { angle: 88 }],
  shootF: [{ angle: 80 }, { angle: 90 }, { angle: 90 }],
  proneStab: [{ angle: 5 }, { angle: 10 }],
};

const SPRITE_MAX_DIM = 34;
const ICON_MAX_DIM = 32;
const OUTLINE = [30, 30, 30, 255] as const;
// Pixels counted as "background" when flood-fill-sampled from an image corner.
// Accept near-pure white OR near-pure black (so both prompt variants work).
const BG_BRIGHT_THRESHOLD = 240;   // min channel for bright bg (white)
const BG_DARK_THRESHOLD = 18;      // max channel for dark bg (black)
const BG_CHROMA_TOLERANCE = 16;    // max spread between R/G/B for "neutral" bg

interface GripPoint { gripX: number; gripY: number }
export interface RenderOutput {
  origins: Record<string, GripPoint[]>;
  frames: Record<string, string[]>;
  iconDataUrl: string | null;
}

// ---------- png helpers ----------
function decodePng(buf: Buffer): { data: Uint8ClampedArray; w: number; h: number } {
  const png = PNG.sync.read(buf);
  return {
    data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength),
    w: png.width,
    h: png.height,
  };
}
function encodePngDataUrl(data: Uint8ClampedArray, w: number, h: number): string {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

// ---------- bg removal ----------
/**
 * Remove background via flood-fill from all four corners. The "bg predicate"
 * is auto-detected per-corner (white, black, or transparent) so the pipeline
 * works whether the model produces white, black, or transparent backgrounds.
 */
function removeBg(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data);

  // Detect bg character from each corner independently. A corner can tell us
  // "bg here is white" or "bg here is black" — we build a per-seed predicate.
  const cornerSeeds = [0, w - 1, (h - 1) * w, h * w - 1];
  type Predicate = (r: number, g: number, b: number, a: number) => boolean;
  const predicateForCorner = (idx: number): Predicate | null => {
    const i = idx * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 20) return (_r, _g, _b, aa) => aa < 20;
    const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
    const chromaFlat = maxC - minC < BG_CHROMA_TOLERANCE;
    if (chromaFlat && minC >= BG_BRIGHT_THRESHOLD) {
      return (rr, gg, bb) => Math.min(rr, gg, bb) >= BG_BRIGHT_THRESHOLD &&
        (Math.max(rr, gg, bb) - Math.min(rr, gg, bb)) < BG_CHROMA_TOLERANCE;
    }
    if (chromaFlat && maxC <= BG_DARK_THRESHOLD) {
      return (rr, gg, bb, aa) => aa > 20 && Math.max(rr, gg, bb) <= BG_DARK_THRESHOLD;
    }
    return null; // corner isn't on a neutral bg; skip
  };

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const s of cornerSeeds) {
    const pred = predicateForCorner(s);
    if (!pred) continue;
    const i = s * 4;
    if (!pred(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
    if (visited[s]) continue;
    visited[s] = 1;
    stack.push(s);
    // Carry the predicate through the flood-fill via closure by tagging it on
    // a per-seed stack segment. Cheap approach: process each seed fully before
    // moving to the next.
    while (stack.length) {
      const p = stack.pop()!;
      out[p * 4 + 3] = 0;
      const x = p % w, y = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        if (visited[np]) continue;
        const ni = np * 4;
        if (!pred(data[ni], data[ni + 1], data[ni + 2], data[ni + 3])) continue;
        visited[np] = 1;
        stack.push(np);
      }
    }
  }
  return out;
}

// ---------- bbox ----------
function opaqueBbox(data: Uint8ClampedArray, w: number, h: number) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY, valid: maxX >= minX };
}

// ---------- alpha-weighted area downscale ----------
function downscale(src: Uint8ClampedArray, sw: number, sh: number, tw: number, th: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const sy0 = Math.floor((y * sh) / th);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * sh) / th));
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor((x * sw) / tw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * sw) / tw));
      let rA = 0, gA = 0, bA = 0, aSum = 0, count = 0;
      for (let py = sy0; py < sy1 && py < sh; py++) {
        for (let px = sx0; px < sx1 && px < sw; px++) {
          const si = (py * sw + px) * 4;
          const a = src[si + 3];
          rA += src[si] * a; gA += src[si + 1] * a; bA += src[si + 2] * a;
          aSum += a; count++;
        }
      }
      const di = (y * tw + x) * 4;
      if (aSum > 0) {
        out[di] = Math.round(rA / aSum);
        out[di + 1] = Math.round(gA / aSum);
        out[di + 2] = Math.round(bA / aSum);
      }
      out[di + 3] = count > 0 ? Math.round(aSum / count) : 0;
    }
  }
  return out;
}

// ---------- 1px outline ----------
function addOutline(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 4;
      if (src[di + 3] >= 25) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const ny = y + dy, nx = x + dx;
        if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
        if (src[(ny * w + nx) * 4 + 3] > 127) {
          out[di] = OUTLINE[0]; out[di + 1] = OUTLINE[1]; out[di + 2] = OUTLINE[2]; out[di + 3] = OUTLINE[3];
          break;
        }
      }
    }
  }
  return out;
}

// ---------- 2D rotate around grip pivot ----------
function rotateAroundGrip(
  src: Uint8ClampedArray, sw: number, sh: number,
  gripSrcX: number, gripSrcY: number,
  angleDeg: number
): { data: Uint8ClampedArray; w: number; h: number; gripX: number; gripY: number } {
  const side = Math.ceil(Math.max(sw, sh) * 1.5);
  const canvas = createCanvas(side, side);
  const ctx = canvas.getContext("2d");
  const srcCanvas = createCanvas(sw, sh);
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.putImageData(createImageData(new Uint8ClampedArray(src), sw, sh), 0, 0);

  const cx = side / 2, cy = side / 2;
  ctx.translate(cx, cy);
  // Canvas rotate() is CW-positive in screen space; Three.js Z-axis rotation
  // is CCW-positive. Negate so the 2D pipeline matches the 3D pipeline's
  // visual direction of rotation per animation angle.
  ctx.rotate(-angleDeg * Math.PI / 180);
  ctx.translate(-gripSrcX, -gripSrcY);
  ctx.drawImage(srcCanvas, 0, 0);
  ctx.resetTransform();

  const rgba = ctx.getImageData(0, 0, side, side);
  return { data: new Uint8ClampedArray(rgba.data), w: side, h: side, gripX: cx, gripY: cy };
}

// ---------- per-frame pipeline ----------
interface ProcessedFrame { data: Uint8ClampedArray; w: number; h: number; gripX: number; gripY: number }
function processRotatedFrame(
  srcData: Uint8ClampedArray, sw: number, sh: number,
  gripSrcX: number, gripSrcY: number,
  angleDeg: number, targetMax: number
): ProcessedFrame {
  const rot = rotateAroundGrip(srcData, sw, sh, gripSrcX, gripSrcY, angleDeg);
  const bb = opaqueBbox(rot.data, rot.w, rot.h);
  if (!bb.valid) return { data: new Uint8ClampedArray(4), w: 1, h: 1, gripX: 0, gripY: 0 };

  const cw = bb.maxX - bb.minX + 1;
  const ch = bb.maxY - bb.minY + 1;
  const cropped = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const sOff = ((bb.minY + y) * rot.w + bb.minX) * 4;
    cropped.set(rot.data.subarray(sOff, sOff + cw * 4), y * cw * 4);
  }

  const aspect = cw / ch;
  let tw: number, th: number;
  if (cw >= ch) { tw = targetMax; th = Math.max(1, Math.round(tw / aspect)); }
  else { th = targetMax; tw = Math.max(1, Math.round(th * aspect)); }
  const scaled = downscale(cropped, cw, ch, tw, th);

  // 1px padding for outline to draw into
  const pw = tw + 2, ph = th + 2;
  const padded = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < th; y++) {
    padded.set(scaled.subarray(y * tw * 4, (y + 1) * tw * 4), ((y + 1) * pw + 1) * 4);
  }
  const outlined = addOutline(padded, pw, ph);

  // Grip stays at rot.gripX/gripY in the rotated canvas; map through crop+scale+pad.
  const gripInCropX = rot.gripX - bb.minX;
  const gripInCropY = rot.gripY - bb.minY;
  const finalGripX = Math.round((gripInCropX * tw) / cw) + 1;
  const finalGripY = Math.round((gripInCropY * th) / ch) + 1;

  return { data: outlined, w: pw, h: ph, gripX: finalGripX, gripY: finalGripY };
}

// ---------- entry point ----------
export interface RenderWeaponFromConceptOpts {
  conceptPng: Buffer;
  /**
   * Vertical grip position as a fraction from the bottom of the weapon's
   * silhouette. Default 0.15 (15% up from the butt) matches MapleStory's
   * typical pole/sword grip. Pass 0.5 for center-balanced weapons like bows.
   */
  gripFromBottom?: number;
  onProgress?: (msg: string, pct: number) => void;
}

export async function renderWeaponFromConcept(opts: RenderWeaponFromConceptOpts): Promise<RenderOutput> {
  const { conceptPng, gripFromBottom = 0.15, onProgress } = opts;

  onProgress?.("Decoding concept", 2);
  const { data, w, h } = decodePng(conceptPng);
  const cleaned = removeBg(data, w, h);
  const bb = opaqueBbox(cleaned, w, h);
  if (!bb.valid) throw new Error("concept is fully transparent after background removal");

  // Grip: horizontally centered on the silhouette, gripFromBottom up from the
  // silhouette's butt. Works for symmetric vertical weapons (most MS).
  const gripX = (bb.minX + bb.maxX) / 2;
  const gripY = bb.maxY - gripFromBottom * (bb.maxY - bb.minY);

  const total = Object.values(ANIMATIONS).reduce((s, f) => s + f.length, 0) + 1;
  let done = 0;
  const origins: Record<string, GripPoint[]> = {};
  const frames: Record<string, string[]> = {};

  for (const [anim, fs] of Object.entries(ANIMATIONS)) {
    origins[anim] = [];
    frames[anim] = [];
    for (const f of fs) {
      const fr = processRotatedFrame(cleaned, w, h, gripX, gripY, f.angle, SPRITE_MAX_DIM);
      origins[anim].push({ gripX: fr.gripX, gripY: fr.gripY });
      frames[anim].push(encodePngDataUrl(fr.data, fr.w, fr.h));
      done++;
      onProgress?.(`Rendering ${anim}`, Math.round(((done / total) * 96) + 2));
    }
  }

  const iconFrame = processRotatedFrame(cleaned, w, h, gripX, gripY, -45, ICON_MAX_DIM);
  const iconDataUrl = encodePngDataUrl(iconFrame.data, iconFrame.w, iconFrame.h);
  onProgress?.("Done", 100);

  return { origins, frames, iconDataUrl };
}
