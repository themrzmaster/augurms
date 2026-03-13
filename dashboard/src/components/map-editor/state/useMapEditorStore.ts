// ========================
// Zustand Store — Single Source of Truth
// ========================

import { create } from "zustand";
import type {
  EditorFoothold,
  EditorLife,
  EditorPortal,
  EditorLadderRope,
  EditorSeat,
  EditorId,
  Tool,
  Viewport,
  FootholdDrawState,
  LadderDrawState,
  MapInfo,
  ApiMapData,
  Bounds,
  Selection,
} from "./types";
import { calculateBounds } from "./types";
import type { Command } from "./commands";
import { initNextFootholdId } from "./foothold-utils";

// ---------- Store State Interface ----------

interface MapEditorState {
  // Map metadata
  mapId: number | null;
  mapName: string;
  streetName: string;
  mapInfo: MapInfo;

  // Elements
  footholds: EditorFoothold[];
  life: EditorLife[];
  portals: EditorPortal[];
  ladderRopes: EditorLadderRope[];
  seats: EditorSeat[];

  // Editor state
  tool: Tool;
  selection: Selection;
  viewport: Viewport;
  snapEnabled: boolean;
  gridSize: number;
  showGrid: boolean;
  isDirty: boolean;
  saving: boolean;

  // Layer visibility
  visibleLayers: Set<number>;

  // Foothold draw state
  footholdDraw: FootholdDrawState | null;
  drawLayer: number;
  drawGroup: number;

  // Ladder draw state
  ladderDraw: LadderDrawState | null;

  // Placement state
  placementEntityId: string | null;
  placementPortalType: number;

  // Undo/Redo
  undoStack: Command[];
  redoStack: Command[];

  // Bounds
  bounds: Bounds;

  // Actions
  loadMapData: (data: ApiMapData) => void;
  setTool: (tool: Tool) => void;
  setSelection: (sel: Selection) => void;
  clearSelection: () => void;
  setViewport: (vp: Partial<Viewport>) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setGridSize: (size: number) => void;
  toggleLayerVisibility: (layer: number) => void;
  setDrawLayer: (layer: number) => void;

  // Element mutations (direct, no undo)
  setFootholds: (fhs: EditorFoothold[]) => void;
  setLife: (life: EditorLife[]) => void;
  setPortals: (portals: EditorPortal[]) => void;
  setLadderRopes: (lrs: EditorLadderRope[]) => void;
  setSeats: (seats: EditorSeat[]) => void;

  // Command execution (with undo)
  executeCommand: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;

  // Foothold drawing
  startFootholdDraw: (point: { x: number; y: number }) => void;
  addFootholdDrawPoint: (point: { x: number; y: number }) => void;
  cancelFootholdDraw: () => void;

  // Ladder drawing
  startLadderDraw: (x: number, y1: number) => void;
  cancelLadderDraw: () => void;

  // Placement
  setPlacementEntityId: (id: string | null) => void;
  setPlacementPortalType: (type: number) => void;

  // Save
  setSaving: (saving: boolean) => void;
  markClean: () => void;

  // Bounds
  recalcBounds: () => void;
}

// ---------- ID Generation ----------

let editorIdCounter = 0;
function genEditorId(prefix: string): EditorId {
  return `${prefix}-${++editorIdCounter}`;
}

// ---------- Store ----------

export const useMapEditorStore = create<MapEditorState>((set, get) => ({
  // Map metadata
  mapId: null,
  mapName: "",
  streetName: "",
  mapInfo: {},

  // Elements
  footholds: [],
  life: [],
  portals: [],
  ladderRopes: [],
  seats: [],

  // Editor state
  tool: "select",
  selection: { editorIds: [] },
  viewport: { x: 0, y: 0, scale: 1 },
  snapEnabled: true,
  gridSize: 50,
  showGrid: true,
  isDirty: false,
  saving: false,

  // Layer visibility
  visibleLayers: new Set([0, 1, 2, 3, 4, 5, 6, 7]),

  // Draw state
  footholdDraw: null,
  drawLayer: 0,
  drawGroup: 0,
  ladderDraw: null,

  // Placement
  placementEntityId: null,
  placementPortalType: 2,

  // Undo/Redo
  undoStack: [],
  redoStack: [],

  // Bounds
  bounds: { minX: -500, minY: -500, maxX: 500, maxY: 500 },

  // ---- Actions ----

  loadMapData: (data: ApiMapData) => {
    editorIdCounter = 0;

    const footholds: EditorFoothold[] = data.footholds.map((fh) => ({
      editorId: genEditorId("fh"),
      id: parseInt(fh.id),
      layer: parseInt(fh.layer),
      group: parseInt(fh.group),
      x1: fh.x1,
      y1: fh.y1,
      x2: fh.x2,
      y2: fh.y2,
      prev: fh.prev,
      next: fh.next,
    }));

    const life: EditorLife[] = data.life.map((l) => ({
      editorId: genEditorId("life"),
      index: parseInt(l.index),
      type: l.type as "m" | "n",
      id: l.id,
      x: l.x,
      y: l.y,
      fh: l.fh,
      cy: l.cy,
      rx0: l.rx0,
      rx1: l.rx1,
      mobTime: l.mobTime,
      f: l.f,
      hide: l.hide,
    }));

    const portals: EditorPortal[] = data.portals.map((p) => ({
      editorId: genEditorId("portal"),
      index: parseInt(p.index),
      pn: p.pn,
      pt: p.pt,
      x: p.x,
      y: p.y,
      tm: p.tm,
      tn: p.tn,
      image: p.image,
    }));

    const ladderRopes: EditorLadderRope[] = (data.ladderRopes ?? []).map((lr) => ({
      editorId: genEditorId("lr"),
      id: parseInt(lr.id),
      x: lr.x,
      y1: lr.y1,
      y2: lr.y2,
      l: lr.l,
      uf: lr.uf,
      page: lr.page,
    }));

    const seats: EditorSeat[] = (data.seats ?? []).map((s) => ({
      editorId: genEditorId("seat"),
      id: parseInt(s.id),
      x: s.x,
      y: s.y,
    }));

    initNextFootholdId(footholds);

    const bounds = calculateBounds(footholds, life, portals, ladderRopes, seats);

    // Collect all unique layers for visibility
    const layers = new Set<number>();
    for (const fh of footholds) layers.add(fh.layer);

    set({
      mapId: data.id,
      mapName: data.mapName,
      streetName: data.streetName,
      mapInfo: data.info,
      footholds,
      life,
      portals,
      ladderRopes,
      seats,
      bounds,
      visibleLayers: layers.size > 0 ? layers : new Set([0]),
      isDirty: false,
      undoStack: [],
      redoStack: [],
      selection: { editorIds: [] },
      footholdDraw: null,
      ladderDraw: null,
      tool: "select",
    });
  },

  setTool: (tool) => set({ tool, footholdDraw: null, ladderDraw: null }),
  setSelection: (sel) => set({ selection: sel }),
  clearSelection: () => set({ selection: { editorIds: [] } }),

  setViewport: (vp) =>
    set((s) => ({ viewport: { ...s.viewport, ...vp } })),

  setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
  setShowGrid: (show) => set({ showGrid: show }),
  setGridSize: (size) => set({ gridSize: size }),

  toggleLayerVisibility: (layer) =>
    set((s) => {
      const next = new Set(s.visibleLayers);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return { visibleLayers: next };
    }),

  setDrawLayer: (layer) => set({ drawLayer: layer }),

  // Direct mutations
  setFootholds: (fhs) => set({ footholds: fhs, isDirty: true }),
  setLife: (life) => set({ life, isDirty: true }),
  setPortals: (portals) => set({ portals, isDirty: true }),
  setLadderRopes: (lrs) => set({ ladderRopes: lrs, isDirty: true }),
  setSeats: (seats) => set({ seats, isDirty: true }),

  // Command execution
  executeCommand: (cmd) => {
    cmd.execute();
    set((s) => ({
      undoStack: [...s.undoStack, cmd],
      redoStack: [],
      isDirty: true,
    }));
  },

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;
    const cmd = undoStack[undoStack.length - 1];
    cmd.undo();
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, cmd],
      isDirty: true,
    }));
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const cmd = redoStack[redoStack.length - 1];
    cmd.execute();
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, cmd],
      isDirty: true,
    }));
  },

  // Foothold draw
  startFootholdDraw: (point) => {
    const { drawLayer, drawGroup } = get();
    set({
      footholdDraw: {
        points: [point],
        layer: drawLayer,
        group: drawGroup,
      },
    });
  },

  addFootholdDrawPoint: (point) =>
    set((s) => {
      if (!s.footholdDraw) return {};
      return {
        footholdDraw: {
          ...s.footholdDraw,
          points: [...s.footholdDraw.points, point],
        },
      };
    }),

  cancelFootholdDraw: () => set({ footholdDraw: null }),

  // Ladder draw
  startLadderDraw: (x, y1) => set({ ladderDraw: { x, y1, dragging: true } }),
  cancelLadderDraw: () => set({ ladderDraw: null }),

  // Placement
  setPlacementEntityId: (id) => set({ placementEntityId: id }),
  setPlacementPortalType: (type) => set({ placementPortalType: type }),

  // Save
  setSaving: (saving) => set({ saving }),
  markClean: () => set({ isDirty: false }),

  // Bounds
  recalcBounds: () => {
    const { footholds, life, portals, ladderRopes, seats } = get();
    set({ bounds: calculateBounds(footholds, life, portals, ladderRopes, seats) });
  },
}));
