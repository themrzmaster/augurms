"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// --- Animation frame definitions (ported from Blender script) ---
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

const RENDER_SIZE = 512;
const SPRITE_MAX_DIM = 50;
const ICON_HEIGHT = 28;
const OUTLINE_COLOR = [30, 30, 30, 255] as const;

interface GripPoint {
  gripX: number;
  gripY: number;
}

export interface RenderOutput {
  origins: Record<string, GripPoint[]>;
  /** animName → base64 PNG data URLs */
  frames: Record<string, string[]>;
  iconDataUrl: string | null;
}

interface WeaponRendererProps {
  glbFile: File | null;
  onRenderComplete: (result: RenderOutput) => void;
  onProgress?: (message: string, pct: number) => void;
  onError?: (message: string) => void;
  triggerRender: number; // increment to trigger a new render
}

/** Compute bounding box of opaque pixels in RGBA ImageData */
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

/** Read pixels from a WebGL renderer into a top-down RGBA Uint8Array */
function readRendererPixels(renderer: THREE.WebGLRenderer): Uint8ClampedArray {
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  // WebGL readPixels gives bottom-up rows — flip to top-down
  const flipped = new Uint8ClampedArray(w * h * 4);
  const rowSize = w * 4;
  for (let y = 0; y < h; y++) {
    flipped.set(buf.subarray((h - 1 - y) * rowSize, (h - y) * rowSize), y * rowSize);
  }
  return flipped;
}

/** Crop, downscale (nearest-neighbor), add outline, compute grip. Returns data URL. */
function processFrame(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  targetMaxDim: number,
  gripRenderX?: number,
  gripRenderY?: number
): { dataUrl: string; width: number; height: number; gripX: number; gripY: number } {
  // Find opaque bounding box (crop)
  const bbox = getOpaqueBBox(pixels, w, h);
  if (!bbox.valid) {
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    return { dataUrl: c.toDataURL("image/png"), width: 1, height: 1, gripX: 0, gripY: 0 };
  }

  const cw = bbox.maxX - bbox.minX + 1;
  const ch = bbox.maxY - bbox.minY + 1;

  // Crop
  const cropped = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcOff = ((bbox.minY + y) * w + bbox.minX) * 4;
    cropped.set(pixels.subarray(srcOff, srcOff + cw * 4), y * cw * 4);
  }

  // Downscale to fit within targetMaxDim (nearest neighbor)
  const aspect = cw / ch;
  let tw: number, th: number;
  if (cw >= ch) {
    tw = targetMaxDim;
    th = Math.max(1, Math.round(tw / aspect));
  } else {
    th = targetMaxDim;
    tw = Math.max(1, Math.round(th * aspect));
  }

  const scaled = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const sy = Math.min(Math.floor(y * ch / th), ch - 1);
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(Math.floor(x * cw / tw), cw - 1);
      const si = (sy * cw + sx) * 4;
      const di = (y * tw + x) * 4;
      scaled[di] = cropped[si];
      scaled[di + 1] = cropped[si + 1];
      scaled[di + 2] = cropped[si + 2];
      scaled[di + 3] = cropped[si + 3];
    }
  }

  // Add 1px dark outline
  const outlined = new Uint8ClampedArray(scaled);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const di = (y * tw + x) * 4;
      if (scaled[di + 3] < 25) {
        for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
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

  // Write to output canvas
  const outCanvas = document.createElement("canvas");
  outCanvas.width = tw;
  outCanvas.height = th;
  const outCtx = outCanvas.getContext("2d")!;
  outCtx.putImageData(new ImageData(outlined, tw, th), 0, 0);

  // Compute grip point: map from render space through crop+scale
  let gripX = Math.round(tw / 2);
  let gripY = Math.round(th / 2);
  if (gripRenderX !== undefined && gripRenderY !== undefined) {
    const gcx = gripRenderX - bbox.minX;
    const gcy = gripRenderY - bbox.minY;
    gripX = Math.max(0, Math.min(tw - 1, Math.round(gcx * tw / cw)));
    gripY = Math.max(0, Math.min(th - 1, Math.round(gcy * th / ch)));
  }

  return { dataUrl: outCanvas.toDataURL("image/png"), width: tw, height: th, gripX, gripY };
}

export default function WeaponRenderer({
  glbFile,
  onRenderComplete,
  onProgress,
  onError,
  triggerRender,
}: WeaponRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(false);
  const lastTrigger = useRef(0);

  const renderWeapon = useCallback(async () => {
    if (!glbFile || !canvasRef.current) return;
    setRendering(true);

    try {
      // Set up Three.js scene
      const renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        alpha: true,
        antialias: true,
      });
      renderer.setSize(RENDER_SIZE, RENDER_SIZE);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();

      // Lighting: match Blender script (bright ambient + sun)
      const ambient = new THREE.AmbientLight(0xffffff, 3.0);
      scene.add(ambient);
      const sun = new THREE.DirectionalLight(0xffffff, 2.5);
      sun.position.set(2, 5, -2); // Blender: (2, -2, 5), but Y/Z swapped
      scene.add(sun);

      // Orthographic camera looking along +Y (Blender convention: -Y in Three.js Z)
      // Blender camera at (0, -10, 0) looking +Y → Three.js camera at (0, 0, -10) looking +Z
      // Actually, Blender's coordinate system: +Y = into screen, +Z = up
      // Three.js: +Y = up, -Z = into screen
      // So Blender camera at (0, -10, 0) with rotation 90° X → Three.js camera at (0, 0, 10) looking -Z
      const camera = new THREE.OrthographicCamera(-1.25, 1.25, 1.25, -1.25, 0.1, 100);
      camera.position.set(0, 0, 10);
      camera.lookAt(0, 0, 0);

      // Load GLB
      onProgress?.("Loading model...", 0);
      const loader = new GLTFLoader();
      const arrayBuffer = await glbFile.arrayBuffer();
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.parse(arrayBuffer, "", resolve, reject);
      });

      // Merge all meshes into one group, center and normalize
      const weaponGroup = new THREE.Group();
      gltf.scene.traverse((child: any) => {
        if (child.isMesh) {
          // Ensure materials work with our lighting
          if (child.material) {
            const mat = child.material;
            if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
              mat.needsUpdate = true;
            }
          }
          weaponGroup.add(child.clone());
        }
      });

      // Compute bounding box and normalize size
      const box = new THREE.Box3().setFromObject(weaponGroup);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      // Center the model
      weaponGroup.position.sub(center);

      // Wrap in a parent for scaling
      const weaponParent = new THREE.Group();
      weaponParent.add(weaponGroup);

      // Scale to 1.5 units (same as Blender script)
      const scale = 1.5 / maxDim;
      weaponParent.scale.set(scale, scale, scale);

      scene.add(weaponParent);

      // Compute grip point: 15% from Y-min (Y = up in Three.js, Z = up in Blender)
      // After centering + scaling, recompute bounds
      weaponParent.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3().setFromObject(weaponParent);
      const yMin = scaledBox.min.y;
      const yMax = scaledBox.max.y;
      const gripY3D = yMin + 0.15 * (yMax - yMin);
      const grip3D = new THREE.Vector3(0, gripY3D, 0);

      // Rendering helper: rotate, fit camera, render, get grip 2D
      const fitCamera = () => {
        weaponParent.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(weaponParent);
        const s = b.getSize(new THREE.Vector3());
        // Camera sees X (horizontal) and Y (vertical)
        const span = Math.max(s.x, s.y, 0.3);
        const halfSpan = (span * 1.4) / 2;
        camera.left = -halfSpan;
        camera.right = halfSpan;
        camera.top = halfSpan;
        camera.bottom = -halfSpan;
        camera.updateProjectionMatrix();
        return span * 1.4; // ortho scale
      };

      const projectGrip = (angleDeg: number, orthoScale: number): { x: number; y: number } => {
        // Rotate grip point by angle around Y axis (Blender Y = Three.js Y for rotation)
        // Wait - in Blender, rotation is around Y axis in Blender coords.
        // Blender: X=right, Y=into screen, Z=up. Rotation around Y rotates in XZ plane.
        // Three.js: X=right, Y=up, Z=out of screen.
        // Blender's Y rotation = rotation in XZ plane = Three.js Y rotation
        // But Blender's screen plane is XZ, and Three.js screen plane is XY.
        //
        // In Blender: camera looks along +Y. Screen coords: X = world X, Y = world Z.
        // In Three.js: camera looks along -Z. Screen coords: X = world X, Y = world Y.
        //
        // Blender rotates around Y (its Y), which moves weapon in XZ plane (visible).
        // We need to rotate around Z in Three.js (to rotate in XY plane, which is the screen).
        //
        // Actually let me reconsider. The weapon's "up" in Blender is Z.
        // We mapped that to Y in Three.js. The rotation axis in Blender is Y (depth axis).
        // In Three.js, the depth axis is Z. So we rotate around Z.
        //
        // For grip projection: after rotating grip3D around Z by angle,
        // project X → screen X, Y → screen Y.
        const rad = angleDeg * Math.PI / 180;
        const rotated = grip3D.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), rad);
        // Ortho projection: screen pixel = (worldCoord / orthoScale + 0.5) * RENDER_SIZE
        const px = (rotated.x / orthoScale + 0.5) * RENDER_SIZE;
        // Three.js canvas: y=0 at top, y increases downward
        // World Y+ = screen up, so higher Y = lower pixel Y
        const py = (0.5 - rotated.y / orthoScale) * RENDER_SIZE;
        return { x: px, y: py };
      };

      // Render all animation frames
      const totalFrames = Object.values(ANIMATIONS).reduce((sum, f) => sum + f.length, 0) + 1; // +1 for icon
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
          // Rotate: set weaponGroup rotation around Z axis
          // (Blender Y rotation in XZ = Three.js Z rotation in XY)
          weaponParent.rotation.set(0, 0, angleDeg * Math.PI / 180);

          const orthoScale = fitCamera();
          renderer.render(scene, camera);

          const grip2D = projectGrip(angleDeg, orthoScale);
          const pixels = readRendererPixels(renderer);
          const result = processFrame(pixels, RENDER_SIZE, RENDER_SIZE, SPRITE_MAX_DIM, grip2D.x, grip2D.y);

          allOrigins[animName].push({ gripX: result.gripX, gripY: result.gripY });
          allFrames[animName].push(result.dataUrl);
        }
      }

      // Render icon
      onProgress?.("Rendering icon...", 98);
      weaponParent.rotation.set(0, 0, -45 * Math.PI / 180);
      fitCamera();
      renderer.render(scene, camera);
      const iconPixels = readRendererPixels(renderer);
      const iconResult = processFrame(iconPixels, RENDER_SIZE, RENDER_SIZE, ICON_HEIGHT);

      // Cleanup Three.js
      renderer.dispose();
      scene.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m: any) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });

      onProgress?.("Done!", 100);

      onRenderComplete({
        origins: allOrigins,
        frames: allFrames,
        iconDataUrl: iconResult.dataUrl,
      });
    } catch (err: any) {
      onError?.(err.message || "Render failed");
    } finally {
      setRendering(false);
    }
  }, [glbFile, onRenderComplete, onProgress, onError]);

  useEffect(() => {
    if (triggerRender > 0 && triggerRender !== lastTrigger.current && glbFile && !rendering) {
      lastTrigger.current = triggerRender;
      renderWeapon();
    }
  }, [triggerRender, glbFile, rendering, renderWeapon]);

  return (
    <canvas
      ref={canvasRef}
      width={RENDER_SIZE}
      height={RENDER_SIZE}
      className="hidden"
    />
  );
}
