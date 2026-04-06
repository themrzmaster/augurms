import { PNG } from "pngjs";

/**
 * Reactor Animator — generates animation frames from a single PNG sprite.
 *
 * Given an idle sprite PNG, produces frame sequences for reactor states:
 *   - idle: the original sprite
 *   - hit: shake/glow feedback frames (played on each hit)
 *   - break: destruction sequence (split, scatter, fade)
 *   - gone: 1x1 transparent (final state)
 *
 * All output is raw PNG buffers ready for WZ encoding.
 */

export type AnimationStyle = "breakable" | "collectible" | "pulsing";

export interface ReactorFrames {
  /** Idle state sprite (trimmed original) */
  idle: Buffer;
  /** Hit feedback frames (2-3 frames, short shake/flash) */
  hit: Buffer[];
  /** Break/collect animation frames (4-6 frames) */
  break: Buffer[];
  /** Width/height of the idle sprite after trimming */
  width: number;
  height: number;
}

/** Decode PNG buffer into RGBA pixel data */
function decodePng(buf: Buffer): PNG {
  return PNG.sync.read(buf);
}

/** Encode RGBA pixel data back to PNG buffer */
function encodePng(png: PNG): Buffer {
  return PNG.sync.write(png);
}

/** Create a new blank PNG canvas */
function createCanvas(w: number, h: number): PNG {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  return png;
}

/** Copy source PNG onto dest at offset, respecting alpha */
function blit(dest: PNG, src: PNG, offX: number, offY: number) {
  for (let y = 0; y < src.height; y++) {
    const dy = y + offY;
    if (dy < 0 || dy >= dest.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = x + offX;
      if (dx < 0 || dx >= dest.width) continue;
      const si = (y * src.width + x) * 4;
      const di = (dy * dest.width + dx) * 4;
      const sa = src.data[si + 3] / 255;
      if (sa === 0) continue;
      dest.data[di] = src.data[si];
      dest.data[di + 1] = src.data[si + 1];
      dest.data[di + 2] = src.data[si + 2];
      dest.data[di + 3] = Math.min(255, Math.round(dest.data[di + 3] + sa * (255 - dest.data[di + 3])));
    }
  }
}

/** Auto-trim transparent borders, returns trimmed PNG */
function trimSprite(png: PNG): PNG {
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
    // Fully transparent — return 1x1
    const out = createCanvas(1, 1);
    return out;
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = createCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((minY + y) * png.width + (minX + x)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  return out;
}

/** Scale a PNG to a new size using nearest-neighbor (pixel art friendly) */
function scaleNearest(src: PNG, newW: number, newH: number): PNG {
  const out = createCanvas(newW, newH);
  const xRatio = src.width / newW;
  const yRatio = src.height / newH;
  for (let y = 0; y < newH; y++) {
    const sy = Math.floor(y * yRatio);
    for (let x = 0; x < newW; x++) {
      const sx = Math.floor(x * xRatio);
      const si = (sy * src.width + sx) * 4;
      const di = (y * newW + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

/** Apply brightness/tint to all non-transparent pixels */
function tint(src: PNG, rMul: number, gMul: number, bMul: number, alphaMul = 1): PNG {
  const out = createCanvas(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    const a = src.data[i + 3];
    if (a === 0) continue;
    out.data[i] = Math.min(255, Math.round(src.data[i] * rMul));
    out.data[i + 1] = Math.min(255, Math.round(src.data[i + 1] * gMul));
    out.data[i + 2] = Math.min(255, Math.round(src.data[i + 2] * bMul));
    out.data[i + 3] = Math.min(255, Math.round(a * alphaMul));
  }
  return out;
}

/** Offset all pixels by dx, dy on a canvas of the same size */
function offset(src: PNG, dx: number, dy: number): PNG {
  const out = createCanvas(src.width, src.height);
  blit(out, src, dx, dy);
  return out;
}

/** Split sprite into top and bottom halves */
function splitHalves(src: PNG): { top: PNG; bottom: PNG } {
  const midY = Math.floor(src.height / 2);
  const top = createCanvas(src.width, midY);
  const bottom = createCanvas(src.width, src.height - midY);

  for (let y = 0; y < midY; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const di = (y * src.width + x) * 4;
      top.data.set(src.data.subarray(si, si + 4), di);
    }
  }
  for (let y = midY; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const di = ((y - midY) * src.width + x) * 4;
      bottom.data.set(src.data.subarray(si, si + 4), di);
    }
  }
  return { top, bottom };
}

// ---- Animation Generators ----

/** Breakable: shake on hit, explode/split on break */
function generateBreakable(idle: PNG): { hit: Buffer[]; breakFrames: Buffer[] } {
  const w = idle.width;
  const h = idle.height;

  // Hit frames: quick shake left-right + brighten
  const hit: Buffer[] = [
    encodePng(offset(tint(idle, 1.3, 1.3, 1.3), -2, 0)),   // bright + left
    encodePng(offset(tint(idle, 1.2, 1.2, 1.2), 2, 0)),    // bright + right
    encodePng(idle),                                          // back to normal
  ];

  // Break frames: scale up slightly, split halves, scatter, fade
  const { top, bottom } = splitHalves(idle);
  const padW = w + 20;
  const padH = h + 30;

  // Frame 1: slight scale-up (impact)
  const scaled = scaleNearest(idle, Math.round(w * 1.1), Math.round(h * 1.1));
  const f1 = createCanvas(padW, padH);
  blit(f1, scaled, Math.round((padW - scaled.width) / 2), Math.round((padH - scaled.height) / 2));

  // Frame 2: halves start separating
  const f2 = createCanvas(padW, padH);
  blit(f2, top, Math.round((padW - w) / 2), Math.round((padH - h) / 2) - 3);
  blit(f2, bottom, Math.round((padW - w) / 2), Math.round((padH - h) / 2) + top.height + 3);

  // Frame 3: halves further apart + fading
  const topFade = tint(top, 1, 1, 1, 0.7);
  const botFade = tint(bottom, 1, 1, 1, 0.7);
  const f3 = createCanvas(padW, padH);
  blit(f3, topFade, Math.round((padW - w) / 2) - 3, Math.round((padH - h) / 2) - 8);
  blit(f3, botFade, Math.round((padW - w) / 2) + 3, Math.round((padH - h) / 2) + top.height + 8);

  // Frame 4: almost gone
  const topGhost = tint(top, 1, 1, 1, 0.3);
  const botGhost = tint(bottom, 1, 1, 1, 0.3);
  const f4 = createCanvas(padW, padH);
  blit(f4, topGhost, Math.round((padW - w) / 2) - 6, Math.round((padH - h) / 2) - 14);
  blit(f4, botGhost, Math.round((padW - w) / 2) + 6, Math.round((padH - h) / 2) + top.height + 14);

  const breakFrames: Buffer[] = [
    encodePng(f1),
    encodePng(f2),
    encodePng(f3),
    encodePng(f4),
  ];

  return { hit, breakFrames };
}

/** Collectible: glow on hit, sparkle shrink on collect */
function generateCollectible(idle: PNG): { hit: Buffer[]; breakFrames: Buffer[] } {
  const w = idle.width;
  const h = idle.height;

  // Hit frames: golden glow pulse
  const hit: Buffer[] = [
    encodePng(tint(idle, 1.4, 1.3, 0.8)),    // warm glow
    encodePng(tint(idle, 1.2, 1.15, 0.9)),   // softer
    encodePng(idle),                           // normal
  ];

  // Collect frames: float up + shrink + fade
  const padH = h + 20;

  // Frame 1: slight float up + glow
  const f1 = createCanvas(w, padH);
  blit(f1, tint(idle, 1.3, 1.2, 0.9), 0, 8);

  // Frame 2: smaller + higher
  const small1 = scaleNearest(idle, Math.round(w * 0.8), Math.round(h * 0.8));
  const f2 = createCanvas(w, padH);
  blit(f2, tint(small1, 1.2, 1.15, 0.9, 0.8), Math.round((w - small1.width) / 2), 3);

  // Frame 3: even smaller + fading
  const small2 = scaleNearest(idle, Math.round(w * 0.5), Math.round(h * 0.5));
  const f3 = createCanvas(w, padH);
  blit(f3, tint(small2, 1.1, 1.1, 1, 0.5), Math.round((w - small2.width) / 2), 0);

  // Frame 4: tiny sparkle
  const small3 = scaleNearest(idle, Math.max(2, Math.round(w * 0.2)), Math.max(2, Math.round(h * 0.2)));
  const f4 = createCanvas(w, padH);
  blit(f4, tint(small3, 1.5, 1.5, 1.5, 0.3), Math.round((w - small3.width) / 2), 0);

  return { hit, breakFrames: [encodePng(f1), encodePng(f2), encodePng(f3), encodePng(f4)] };
}

/** Pulsing: gentle bounce idle, burst on break */
function generatePulsing(idle: PNG): { hit: Buffer[]; breakFrames: Buffer[] } {
  const w = idle.width;
  const h = idle.height;

  // Hit frames: quick bright flash
  const hit: Buffer[] = [
    encodePng(tint(idle, 1.5, 1.5, 1.5)),
    encodePng(tint(idle, 1.1, 1.1, 1.1)),
    encodePng(idle),
  ];

  // Break frames: expand outward + fade
  const padW = w + 30;
  const padH = h + 30;

  const s1 = scaleNearest(idle, Math.round(w * 1.15), Math.round(h * 1.15));
  const f1 = createCanvas(padW, padH);
  blit(f1, tint(s1, 1.3, 1.3, 1.3), Math.round((padW - s1.width) / 2), Math.round((padH - s1.height) / 2));

  const s2 = scaleNearest(idle, Math.round(w * 1.3), Math.round(h * 1.3));
  const f2 = createCanvas(padW, padH);
  blit(f2, tint(s2, 1.2, 1.2, 1.2, 0.7), Math.round((padW - s2.width) / 2), Math.round((padH - s2.height) / 2));

  const s3 = scaleNearest(idle, Math.round(w * 1.5), Math.round(h * 1.5));
  const f3 = createCanvas(padW, padH);
  blit(f3, tint(s3, 1.1, 1.1, 1.1, 0.4), Math.round((padW - s3.width) / 2), Math.round((padH - s3.height) / 2));

  const f4 = createCanvas(padW, padH);
  // empty — fully faded

  return { hit, breakFrames: [encodePng(f1), encodePng(f2), encodePng(f3), encodePng(f4)] };
}

// ---- Main Export ----

/**
 * Generate all reactor animation frames from a single PNG sprite.
 *
 * @param pngBuf  Raw PNG file buffer (the idle sprite)
 * @param style   Animation style: "breakable" (chest/box), "collectible" (pickup), "pulsing" (energy orb)
 * @returns       ReactorFrames with idle + hit + break sequences as PNG buffers
 */
/** Remove white/near-white background if image has no transparency */
function removeWhiteBackground(png: PNG): PNG {
  // Check if image has ANY transparent pixels — if so, assume background is already handled
  let hasTransparent = false;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] < 255) { hasTransparent = true; break; }
  }
  if (hasTransparent) return png;

  // Check top-left corner — if light/white, assume solid background (AI-generated images often
  // have shadows at edges, so only check one corner with a generous threshold)
  const tl = { r: png.data[0], g: png.data[1], b: png.data[2] };
  if (tl.r < 200 || tl.g < 200 || tl.b < 200) return png;

  // Flood-fill from corners to find background pixels, then make them transparent.
  // Use a luminance threshold: any pixel with R,G,B all > 180 and grayscale (low saturation) is background.
  const BG_LUMA = 180;
  const out = createCanvas(png.width, png.height);
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    const minC = Math.min(r, g, b), maxC = Math.max(r, g, b);
    const isGrayish = (maxC - minC) < 40; // low saturation
    if (isGrayish && minC >= BG_LUMA) {
      out.data[i + 3] = 0; // transparent
    } else {
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = 255;
    }
  }
  return out;
}

export function generateReactorFrames(pngBuf: Buffer, style: AnimationStyle = "breakable"): ReactorFrames {
  const raw = decodePng(pngBuf);
  const bgRemoved = removeWhiteBackground(raw);
  let trimmed = trimSprite(bgRemoved);

  // Auto-downscale oversized sprites (MapleStory reactors are typically 32-128px)
  const MAX_DIM = 80;
  if (trimmed.width > MAX_DIM || trimmed.height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(trimmed.width, trimmed.height);
    const newW = Math.max(1, Math.round(trimmed.width * scale));
    const newH = Math.max(1, Math.round(trimmed.height * scale));
    trimmed = scaleNearest(trimmed, newW, newH);
  }

  const idle = encodePng(trimmed);

  let hit: Buffer[];
  let breakFrames: Buffer[];

  switch (style) {
    case "collectible":
      ({ hit, breakFrames } = generateCollectible(trimmed));
      break;
    case "pulsing":
      ({ hit, breakFrames } = generatePulsing(trimmed));
      break;
    case "breakable":
    default:
      ({ hit, breakFrames } = generateBreakable(trimmed));
      break;
  }

  return {
    idle,
    hit,
    break: breakFrames,
    width: trimmed.width,
    height: trimmed.height,
  };
}
