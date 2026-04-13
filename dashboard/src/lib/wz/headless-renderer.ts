/**
 * Headless port of src/components/WeaponRenderer.tsx — renders a weapon GLB
 * into MapleStory-compatible frame PNGs entirely on the Node.js server.
 *
 * Same output shape as the browser version (RenderOutput) so callers can feed
 * straight into POST /api/admin/items/render-weapon.
 *
 * Requires native deps:
 *   npm i gl canvas
 * Fly deploy: Debian-based image with libgl1, libxi6, libxext6, libcairo2,
 * libpango-1.0-0, libjpeg62-turbo, libgif7, librsvg2-2 (plus matching -dev
 * packages at build time). See Dockerfile.
 * NOTE: three is pinned to ^0.162 — the last WebGL1-compatible release.
 * r163+ dropped WebGL1 and the `gl` (headless-gl) package only implements WebGL1.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PNG } from "pngjs";

// Must match ANIMATIONS in src/components/WeaponRenderer.tsx — keep in sync.
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

// Supersample: headless `gl` has no MSAA, so we render 4× and box-filter down
// to simulate antialiasing. This matches the browser WeaponRenderer's visual
// quality without MSAA hardware support.
const RENDER_SIZE = 1024;
const SPRITE_MAX_DIM = 34;
const ICON_HEIGHT = 28;
const OUTLINE_COLOR = [30, 30, 30, 255] as const;

interface GripPoint {
  gripX: number;
  gripY: number;
}

export interface RenderOutput {
  origins: Record<string, GripPoint[]>;
  frames: Record<string, string[]>; // animName → base64 PNG data URLs
  iconDataUrl: string | null;
}

/**
 * DOM/URL shims live only for the duration of a single render call so we
 * don't pollute globals that Next.js SSR and React server rendering rely on
 * (notably: a bare `document` object makes downstream code assume browser
 * context and then crash when methods we didn't shim are called).
 */
function withRenderShims<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as any;
  const had = {
    Image: "Image" in g,
    document: "document" in g,
    self: "self" in g,
    requestAnimationFrame: "requestAnimationFrame" in g,
    cancelAnimationFrame: "cancelAnimationFrame" in g,
  };
  const prev = {
    Image: g.Image,
    document: g.document,
    self: g.self,
    requestAnimationFrame: g.requestAnimationFrame,
    cancelAnimationFrame: g.cancelAnimationFrame,
  };

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Image: NodeImage, createCanvas } = require("canvas");

  // node-canvas Image exposes onload/onerror but NOT addEventListener. Three.js's
  // ImageLoader attaches listeners via addEventListener — without this shim the
  // load callback never fires and every embedded texture gets dropped, so the
  // GLB renders with fallback materials (flat gray).
  function makeImage() {
    const img = new NodeImage();
    const listeners: Record<string, Array<(e: any) => void>> = { load: [], error: [] };
    let firedState: "load" | "error" | null = null;
    let firedPayload: any = null;
    img.onload = function () {
      firedState = "load";
      firedPayload = { target: img };
      // Three.js's ImageLoader does `onLoad(this)` inside its load listener,
      // so the handler's `this` MUST be the image itself. Call with img as
      // receiver; without this, GLTFLoader assigns the wrong reference to
      // texture.image and materials render without textures.
      for (const h of listeners.load) h.call(img, firedPayload);
    };
    img.onerror = function (err: any) {
      firedState = "error";
      firedPayload = { target: img, error: err };
      for (const h of listeners.error) h.call(img, firedPayload);
    };
    img.addEventListener = (type: string, handler: (e: any) => void) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
      if (firedState === type) handler.call(img, firedPayload);
    };
    img.removeEventListener = (type: string, handler: (e: any) => void) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((h) => h !== handler);
    };
    return img;
  }

  g.Image = function ShimmedImage() {
    return makeImage();
  } as unknown as typeof Image;
  // Three.js's ImageLoader calls `document.createElementNS`, not `new Image()`.
  // Three.js uploads texture images to GL by drawing them onto a 2D canvas and
  // calling getImageData — so we need a REAL node-canvas Canvas here, not a
  // stub. Without this, headless-gl receives no pixel data and the GLB renders
  // with fallback (flat gray) colors.
  g.document = {
    createElementNS: (_ns: string, tag: string) => {
      if (tag === "img") return makeImage();
      if (tag === "canvas") return createCanvas(1, 1);
      return {};
    },
    createElement: (tag: string) => {
      if (tag === "img") return makeImage();
      if (tag === "canvas") return createCanvas(1, 1);
      return { style: {} };
    },
  };
  g.self = g;
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => {};

  const restore = () => {
    for (const k of Object.keys(had) as Array<keyof typeof had>) {
      if (had[k]) g[k] = prev[k];
      else delete g[k];
    }
  };

  return fn().finally(restore);
}

function installBlobUrlShim() {
  // GLTFLoader decodes embedded textures by wrapping the raw buffer in a Blob
  // and calling URL.createObjectURL — which in Node produces `blob:nodedata:...`
  // URLs that node-canvas Image can't resolve. Capture blob bytes synchronously
  // at construction and swap URL.createObjectURL to return a data: URI.
  const g = globalThis as any;
  if (g.__augurBlobShimInstalled) return;
  g.__augurBlobShimInstalled = true;

  const blobData = new WeakMap<Blob, { buffer: Buffer; type: string }>();
  const OrigBlob = g.Blob as typeof Blob;
  g.Blob = class PatchedBlob extends OrigBlob {
    constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      const buffers: Buffer[] = [];
      for (const p of parts ?? []) {
        if (p instanceof Uint8Array) buffers.push(Buffer.from(p.buffer, p.byteOffset, p.byteLength));
        else if (p instanceof ArrayBuffer) buffers.push(Buffer.from(p));
        else if (typeof p === "string") buffers.push(Buffer.from(p));
      }
      blobData.set(this, { buffer: Buffer.concat(buffers), type: options?.type ?? "" });
    }
  };

  const origCreate = g.URL.createObjectURL?.bind(g.URL);
  g.URL.createObjectURL = (blob: Blob) => {
    const data = blobData.get(blob);
    if (data) return `data:${data.type || "application/octet-stream"};base64,${data.buffer.toString("base64")}`;
    return origCreate ? origCreate(blob) : "";
  };
}

function createHeadlessRenderer(width: number, height: number): {
  renderer: THREE.WebGLRenderer;
  dispose: () => void;
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const createGL = require("gl") as (
    w: number,
    h: number,
    opts?: { preserveDrawingBuffer?: boolean }
  ) => WebGLRenderingContext;
  const glCtx = createGL(width, height, { preserveDrawingBuffer: true });
  if (!glCtx) throw new Error("headless-gl failed to create a WebGL context");

  const fakeCanvas = {
    width,
    height,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: () => glCtx,
  } as unknown as HTMLCanvasElement;

  const renderer = new THREE.WebGLRenderer({
    canvas: fakeCanvas,
    context: glCtx as unknown as WebGLRenderingContext,
    antialias: false, // gl doesn't support MSAA; we downscale anyway
    alpha: true,
  });
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  return {
    renderer,
    dispose: () => {
      renderer.dispose();
      const ext = glCtx.getExtension("STACKGL_destroy_context");
      ext?.destroy();
    },
  };
}

function getOpaqueBBox(data: Uint8ClampedArray, w: number, h: number) {
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 2) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY, valid: maxX >= minX && maxY >= minY };
}

function readRendererPixels(renderer: THREE.WebGLRenderer): Uint8ClampedArray {
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  // WebGL gives bottom-up rows; flip to top-down.
  const flipped = new Uint8ClampedArray(w * h * 4);
  const rowSize = w * 4;
  for (let y = 0; y < h; y++) {
    flipped.set(buf.subarray((h - 1 - y) * rowSize, (h - y) * rowSize), y * rowSize);
  }
  return flipped;
}

function rgbaToDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string {
  const png = new PNG({ width, height });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  const pngBuf = PNG.sync.write(png);
  return `data:image/png;base64,${pngBuf.toString("base64")}`;
}

function processFrame(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  targetMaxDim: number,
  gripRenderX?: number,
  gripRenderY?: number
): { dataUrl: string; width: number; height: number; gripX: number; gripY: number } {
  const bbox = getOpaqueBBox(pixels, w, h);
  if (!bbox.valid) {
    const empty = new Uint8ClampedArray(4); // 1×1 transparent
    return { dataUrl: rgbaToDataUrl(empty, 1, 1), width: 1, height: 1, gripX: 0, gripY: 0 };
  }

  const cw = bbox.maxX - bbox.minX + 1;
  const ch = bbox.maxY - bbox.minY + 1;

  const cropped = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcOff = ((bbox.minY + y) * w + bbox.minX) * 4;
    cropped.set(pixels.subarray(srcOff, srcOff + cw * 4), y * cw * 4);
  }

  const aspect = cw / ch;
  let tw: number, th: number;
  if (cw >= ch) {
    tw = targetMaxDim;
    th = Math.max(1, Math.round(tw / aspect));
  } else {
    th = targetMaxDim;
    tw = Math.max(1, Math.round(th * aspect));
  }

  // Alpha-weighted box filter downscale. Each output pixel averages all source
  // pixels in its coverage box; RGB is weighted by source alpha (so transparent
  // pixels don't drag visible colors toward black), alpha is a straight mean.
  const scaled = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const sy0 = Math.floor((y * ch) / th);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * ch) / th));
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor((x * cw) / tw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * cw) / tw));
      let rA = 0, gA = 0, bA = 0, aSum = 0, count = 0;
      for (let py = sy0; py < sy1 && py < ch; py++) {
        for (let px = sx0; px < sx1 && px < cw; px++) {
          const si = (py * cw + px) * 4;
          const a = cropped[si + 3];
          rA += cropped[si] * a;
          gA += cropped[si + 1] * a;
          bA += cropped[si + 2] * a;
          aSum += a;
          count++;
        }
      }
      const di = (y * tw + x) * 4;
      if (aSum > 0) {
        scaled[di] = Math.round(rA / aSum);
        scaled[di + 1] = Math.round(gA / aSum);
        scaled[di + 2] = Math.round(bA / aSum);
      }
      scaled[di + 3] = count > 0 ? Math.round(aSum / count) : 0;
    }
  }

  const outlined = new Uint8ClampedArray(scaled);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const di = (y * tw + x) * 4;
      if (scaled[di + 3] < 25) {
        for (const [dy, dx] of [
          [-1, 0], [1, 0], [0, -1], [0, 1],
        ]) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < th && nx >= 0 && nx < tw) {
            const ni = (ny * tw + nx) * 4;
            if (scaled[ni + 3] > 127) {
              outlined[di] = OUTLINE_COLOR[0];
              outlined[di + 1] = OUTLINE_COLOR[1];
              outlined[di + 2] = OUTLINE_COLOR[2];
              outlined[di + 3] = OUTLINE_COLOR[3];
              break;
            }
          }
        }
      }
    }
  }

  let gripX = Math.round(tw / 2);
  let gripY = Math.round(th / 2);
  if (gripRenderX !== undefined && gripRenderY !== undefined) {
    const gcx = gripRenderX - bbox.minX;
    const gcy = gripRenderY - bbox.minY;
    gripX = Math.max(0, Math.min(tw - 1, Math.round((gcx * tw) / cw)));
    gripY = Math.max(0, Math.min(th - 1, Math.round((gcy * th) / ch)));
  }

  return { dataUrl: rgbaToDataUrl(outlined, tw, th), width: tw, height: th, gripX, gripY };
}

export interface RenderWeaponOptions {
  glb: Buffer;
  onProgress?: (message: string, pct: number) => void;
}

export async function renderWeaponGlb(opts: RenderWeaponOptions): Promise<RenderOutput> {
  installBlobUrlShim(); // idempotent, patches Blob/URL — safe to leave in place
  return withRenderShims(() => renderWeaponGlbImpl(opts));
}

async function renderWeaponGlbImpl({ glb, onProgress }: RenderWeaponOptions): Promise<RenderOutput> {
  const { renderer, dispose } = createHeadlessRenderer(RENDER_SIZE, RENDER_SIZE);

  try {
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 3.0));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(2, 5, -2);
    scene.add(sun);

    const camera = new THREE.OrthographicCamera(-1.25, 1.25, 1.25, -1.25, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    onProgress?.("Loading model...", 0);
    const loader = new GLTFLoader();
    // GLTFLoader.parse expects an ArrayBuffer; Node's Buffer has one underneath.
    const arrayBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
    const gltf = await new Promise<any>((resolve, reject) => {
      loader.parse(arrayBuffer as ArrayBuffer, "", resolve, reject);
    });

    // Pre-decode texture pixels: headless-gl can't sample node-canvas Images
    // directly, so we draw each texture onto a 2D canvas, pull raw RGBA bytes,
    // and swap the material's texture for a DataTexture holding those bytes.
    // This is the only reliable way to get GLTF embedded textures onto a GPU
    // in pure Node — without it, every material falls back to flat gray.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createCanvas } = require("canvas");
    const TEXTURE_KEYS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"];
    const decodedTextures = new Map<any, THREE.DataTexture>();
    const decodeTexture = (tex: any): THREE.DataTexture | null => {
      if (!tex?.image) return null;
      if (decodedTextures.has(tex)) return decodedTextures.get(tex)!;
      const img = tex.image;
      const w = img.width, h = img.height;
      if (!w || !h) return null;
      const c = createCanvas(w, h);
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const raw = ctx.getImageData(0, 0, w, h).data;
      const pixels = new Uint8Array(raw.length);
      pixels.set(raw);
      const dt = new THREE.DataTexture(pixels, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
      dt.colorSpace = tex.colorSpace ?? THREE.NoColorSpace;
      // GLTF textures default to LinearMipmapLinearFilter, which requires mip
      // levels DataTexture doesn't auto-generate. Without these overrides, the
      // sampler returns black.
      dt.magFilter = THREE.LinearFilter;
      dt.minFilter = THREE.LinearFilter;
      dt.wrapS = THREE.ClampToEdgeWrapping;
      dt.wrapT = THREE.ClampToEdgeWrapping;
      dt.generateMipmaps = false;
      dt.flipY = false;
      dt.needsUpdate = true;
      decodedTextures.set(tex, dt);
      return dt;
    };

    // Convert PBR materials to MeshBasicMaterial driven by the base color
    // texture. MapleStory sprites are intentionally flat (no lighting), and
    // headless-gl can't do IBL, so a metalness=1 PBR material would render
    // near-black. Basic material just samples the diffuse texture — perfect
    // for 2D sprite extraction.
    const weaponGroup = new THREE.Group();
    gltf.scene.traverse((child: any) => {
      if (child.isMesh) {
        const mats = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
        const cloned = child.clone();
        const newMats = mats.map((mat: any) => {
          const baseColor = mat.map ? decodeTexture(mat.map) : null;
          const basic = new THREE.MeshBasicMaterial({
            map: baseColor,
            color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
            transparent: mat.transparent,
            opacity: mat.opacity ?? 1,
            side: mat.side ?? THREE.FrontSide,
          });
          basic.needsUpdate = true;
          return basic;
        });
        cloned.material = Array.isArray(child.material) ? newMats : newMats[0];
        weaponGroup.add(cloned);
      }
    });

    const box = new THREE.Box3().setFromObject(weaponGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    weaponGroup.position.sub(center);

    const weaponParent = new THREE.Group();
    weaponParent.add(weaponGroup);
    const scale = 1.5 / maxDim;
    weaponParent.scale.set(scale, scale, scale);
    scene.add(weaponParent);

    weaponParent.updateMatrixWorld(true);
    const scaledBox = new THREE.Box3().setFromObject(weaponParent);
    const yMin = scaledBox.min.y;
    const yMax = scaledBox.max.y;
    const gripY3D = yMin + 0.15 * (yMax - yMin);
    const grip3D = new THREE.Vector3(0, gripY3D, 0);

    const fitCamera = () => {
      weaponParent.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(weaponParent);
      const s = b.getSize(new THREE.Vector3());
      const span = Math.max(s.x, s.y, 0.3);
      const halfSpan = (span * 1.4) / 2;
      camera.left = -halfSpan;
      camera.right = halfSpan;
      camera.top = halfSpan;
      camera.bottom = -halfSpan;
      camera.updateProjectionMatrix();
      return span * 1.4;
    };

    const projectGrip = (angleDeg: number, orthoScale: number) => {
      const rad = (angleDeg * Math.PI) / 180;
      const rotated = grip3D.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), rad);
      const px = (rotated.x / orthoScale + 0.5) * RENDER_SIZE;
      const py = (0.5 - rotated.y / orthoScale) * RENDER_SIZE;
      return { x: px, y: py };
    };

    const totalFrames = Object.values(ANIMATIONS).reduce((sum, f) => sum + f.length, 0) + 1;
    let frameCount = 0;
    const allOrigins: Record<string, GripPoint[]> = {};
    const allFrames: Record<string, string[]> = {};

    for (const [animName, frames] of Object.entries(ANIMATIONS)) {
      allOrigins[animName] = [];
      allFrames[animName] = [];
      for (let i = 0; i < frames.length; i++) {
        frameCount++;
        const pct = Math.round((frameCount / totalFrames) * 100);
        onProgress?.(`Rendering ${animName} ${i + 1}/${frames.length}`, pct);

        const angleDeg = frames[i].angle;
        weaponParent.rotation.set(0, 0, (angleDeg * Math.PI) / 180);
        const orthoScale = fitCamera();
        renderer.render(scene, camera);
        const grip2D = projectGrip(angleDeg, orthoScale);
        const pixels = readRendererPixels(renderer);
        const result = processFrame(pixels, RENDER_SIZE, RENDER_SIZE, SPRITE_MAX_DIM, grip2D.x, grip2D.y);
        allOrigins[animName].push({ gripX: result.gripX, gripY: result.gripY });
        allFrames[animName].push(result.dataUrl);
      }
    }

    onProgress?.("Rendering icon...", 98);
    weaponParent.rotation.set(0, 0, (-45 * Math.PI) / 180);
    fitCamera();
    renderer.render(scene, camera);
    const iconPixels = readRendererPixels(renderer);
    const iconResult = processFrame(iconPixels, RENDER_SIZE, RENDER_SIZE, ICON_HEIGHT);

    scene.traverse((obj: any) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
        else obj.material.dispose();
      }
    });

    onProgress?.("Done", 100);
    return {
      origins: allOrigins,
      frames: allFrames,
      iconDataUrl: iconResult.dataUrl,
    };
  } finally {
    dispose();
  }
}
