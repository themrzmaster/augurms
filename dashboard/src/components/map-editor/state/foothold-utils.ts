// ========================
// Foothold Linked List Management
// ========================

import type { EditorFoothold, EditorId } from "./types";

let nextFhId = 90000; // Start high to avoid collisions with existing IDs

export function getNextFootholdId(): number {
  return nextFhId++;
}

export function initNextFootholdId(footholds: EditorFoothold[]) {
  let maxId = 0;
  for (const fh of footholds) {
    maxId = Math.max(maxId, fh.id);
  }
  nextFhId = maxId + 1;
}

/**
 * When a foothold is deleted, relink its neighbors so the chain stays connected.
 * If fh has prev=A and next=B:
 *   - A's next becomes B (or 0 if B doesn't exist)
 *   - B's prev becomes A (or 0 if A doesn't exist)
 */
export function relinkOnDelete(
  footholds: EditorFoothold[],
  deletedFh: EditorFoothold,
): EditorFoothold[] {
  const prevId = deletedFh.prev;
  const nextId = deletedFh.next;

  return footholds
    .filter((fh) => fh.editorId !== deletedFh.editorId)
    .map((fh) => {
      if (fh.id === prevId && fh.layer === deletedFh.layer && fh.group === deletedFh.group) {
        return { ...fh, next: nextId || 0 };
      }
      if (fh.id === nextId && fh.layer === deletedFh.layer && fh.group === deletedFh.group) {
        return { ...fh, prev: prevId || 0 };
      }
      return fh;
    });
}

/**
 * Insert a new foothold into a chain. The new foothold's prev/next are set,
 * and neighbors are updated.
 */
export function insertIntoChain(
  footholds: EditorFoothold[],
  newFh: EditorFoothold,
): EditorFoothold[] {
  let result = [...footholds, newFh];

  // Update the previous foothold's next pointer
  if (newFh.prev > 0) {
    result = result.map((fh) => {
      if (fh.id === newFh.prev && fh.layer === newFh.layer && fh.group === newFh.group) {
        return { ...fh, next: newFh.id };
      }
      return fh;
    });
  }

  // Update the next foothold's prev pointer
  if (newFh.next > 0) {
    result = result.map((fh) => {
      if (fh.id === newFh.next && fh.layer === newFh.layer && fh.group === newFh.group) {
        return { ...fh, prev: newFh.id };
      }
      return fh;
    });
  }

  return result;
}

/**
 * Build a chain of footholds from an array of points.
 * Returns the footholds to add (caller handles insertion).
 */
export function buildFootholdChain(
  points: { x: number; y: number }[],
  layer: number,
  group: number,
  lastChainFhId: number, // The previous chain end's id, or 0
): EditorFoothold[] {
  if (points.length < 2) return [];

  const chain: EditorFoothold[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const id = getNextFootholdId();
    const prevFhId = i === 0 ? lastChainFhId : chain[i - 1].id;
    const nextFhId_temp = i < points.length - 2 ? 0 : 0; // Will be set below

    chain.push({
      editorId: `fh-${id}`,
      id,
      layer,
      group,
      x1: Math.round(points[i].x),
      y1: Math.round(points[i].y),
      x2: Math.round(points[i + 1].x),
      y2: Math.round(points[i + 1].y),
      prev: prevFhId,
      next: 0,
    });
  }

  // Link the chain internally
  for (let i = 0; i < chain.length; i++) {
    if (i > 0) {
      chain[i].prev = chain[i - 1].id;
    }
    if (i < chain.length - 1) {
      chain[i].next = chain[i + 1].id;
    }
  }

  return chain;
}

/**
 * Find the maximum group number in a given layer.
 */
export function getMaxGroup(footholds: EditorFoothold[], layer: number): number {
  let maxGroup = -1;
  for (const fh of footholds) {
    if (fh.layer === layer) {
      maxGroup = Math.max(maxGroup, fh.group);
    }
  }
  return maxGroup;
}

/**
 * Find foothold by its numeric id within a layer/group.
 */
export function findFootholdById(
  footholds: EditorFoothold[],
  id: number,
  layer: number,
  group: number,
): EditorFoothold | undefined {
  return footholds.find((fh) => fh.id === id && fh.layer === layer && fh.group === group);
}

/**
 * Get the end of a chain (the foothold with next=0) in a given layer/group.
 */
export function findChainEnd(
  footholds: EditorFoothold[],
  layer: number,
  group: number,
): EditorFoothold | undefined {
  return footholds.find((fh) => fh.layer === layer && fh.group === group && fh.next === 0);
}
