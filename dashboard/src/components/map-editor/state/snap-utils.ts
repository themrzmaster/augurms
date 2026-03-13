// ========================
// Snap Utilities (Grid + Endpoint)
// ========================

import type { EditorFoothold } from "./types";

const SNAP_THRESHOLD = 10; // pixels in world space

export interface SnapResult {
  x: number;
  y: number;
  snappedX: boolean;
  snappedY: boolean;
}

/**
 * Snap a point to the nearest grid intersection.
 */
export function snapToGrid(x: number, y: number, gridSize: number): SnapResult {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
    snappedX: true,
    snappedY: true,
  };
}

/**
 * Snap a point to nearby foothold endpoints.
 */
export function snapToEndpoints(
  x: number,
  y: number,
  footholds: EditorFoothold[],
  excludeEditorId?: string,
): SnapResult {
  let bestX = x;
  let bestY = y;
  let bestDistX = SNAP_THRESHOLD;
  let bestDistY = SNAP_THRESHOLD;
  let snappedX = false;
  let snappedY = false;

  for (const fh of footholds) {
    if (fh.editorId === excludeEditorId) continue;

    // Check both endpoints
    const endpoints = [
      { x: fh.x1, y: fh.y1 },
      { x: fh.x2, y: fh.y2 },
    ];

    for (const ep of endpoints) {
      const dx = Math.abs(ep.x - x);
      const dy = Math.abs(ep.y - y);

      // Snap to exact endpoint if close enough on both axes
      if (dx < SNAP_THRESHOLD && dy < SNAP_THRESHOLD) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < Math.sqrt(bestDistX * bestDistX + bestDistY * bestDistY)) {
          bestX = ep.x;
          bestY = ep.y;
          bestDistX = dx;
          bestDistY = dy;
          snappedX = true;
          snappedY = true;
        }
      }
    }
  }

  return { x: bestX, y: bestY, snappedX, snappedY };
}

/**
 * Combined snap: try endpoint snap first, fall back to grid snap.
 */
export function snapPoint(
  x: number,
  y: number,
  footholds: EditorFoothold[],
  gridSize: number,
  snapEnabled: boolean,
  excludeEditorId?: string,
): { x: number; y: number } {
  if (!snapEnabled) return { x: Math.round(x), y: Math.round(y) };

  // Try endpoint snap first
  const epSnap = snapToEndpoints(x, y, footholds, excludeEditorId);
  if (epSnap.snappedX && epSnap.snappedY) {
    return { x: epSnap.x, y: epSnap.y };
  }

  // Fall back to grid snap
  const gridSnap = snapToGrid(x, y, gridSize);
  return { x: gridSnap.x, y: gridSnap.y };
}
