// ========================
// Map Editor — Type Definitions
// ========================

/** Every editor element gets a unique editorId for tracking */
export type EditorId = string;

// ---------- Map Elements ----------

export interface EditorFoothold {
  editorId: EditorId;
  id: number;
  layer: number;
  group: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  prev: number;
  next: number;
}

export interface EditorLife {
  editorId: EditorId;
  index: number;
  type: "m" | "n";
  id: string;
  x: number;
  y: number;
  fh: number;
  cy: number;
  rx0: number;
  rx1: number;
  mobTime?: number;
  f?: number;
  hide?: number;
  name?: string;
}

export interface EditorPortal {
  editorId: EditorId;
  index: number;
  pn: string;
  pt: number;
  x: number;
  y: number;
  tm: number;
  tn: string;
  image?: string;
}

export interface EditorLadderRope {
  editorId: EditorId;
  id: number;
  x: number;
  y1: number;
  y2: number;
  l: number; // 1 = ladder, 0 = rope
  uf: number;
  page: number;
}

export interface EditorSeat {
  editorId: EditorId;
  id: number;
  x: number;
  y: number;
}

export interface EditorReactor {
  editorId: EditorId;
  index: number;
  id: string;
  x: number;
  y: number;
  reactorTime: number;
  f: number;
  name: string;
}

// ---------- Union type for any element ----------

export type EditorElement =
  | EditorFoothold
  | EditorLife
  | EditorPortal
  | EditorLadderRope
  | EditorSeat
  | EditorReactor;

export type ElementType = "foothold" | "life" | "portal" | "ladderRope" | "seat" | "reactor";

export function getElementType(el: EditorElement): ElementType {
  if ("x1" in el && "y1" in el && "x2" in el && "y2" in el && "prev" in el) return "foothold";
  if ("type" in el && ("m" === (el as EditorLife).type || "n" === (el as EditorLife).type) && "fh" in el) return "life";
  if ("pn" in el && "pt" in el) return "portal";
  if ("l" in el && "uf" in el) return "ladderRope";
  if ("reactorTime" in el) return "reactor";
  return "seat";
}

// ---------- Tools ----------

export type Tool =
  | "select"
  | "foothold"
  | "placeMob"
  | "placeNPC"
  | "placePortal"
  | "placeSeat"
  | "placeLadder"
  | "eraser";

export const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  f: "foothold",
  m: "placeMob",
  n: "placeNPC",
  p: "placePortal",
  s: "placeSeat",
  l: "placeLadder",
  e: "eraser",
};

export const TOOL_LABELS: Record<Tool, string> = {
  select: "Select",
  foothold: "Draw Foothold",
  placeMob: "Place Mob",
  placeNPC: "Place NPC",
  placePortal: "Place Portal",
  placeSeat: "Place Seat",
  placeLadder: "Place Ladder",
  eraser: "Eraser",
};

export const TOOL_SHORTCUTS: Record<Tool, string> = {
  select: "V",
  foothold: "F",
  placeMob: "M",
  placeNPC: "N",
  placePortal: "P",
  placeSeat: "S",
  placeLadder: "L",
  eraser: "E",
};

// ---------- Selection ----------

export interface Selection {
  editorIds: EditorId[];
  elementType?: ElementType;
}

// ---------- Viewport ----------

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

// ---------- Foothold Drawing State ----------

export interface FootholdDrawState {
  points: { x: number; y: number }[];
  layer: number;
  group: number;
}

// ---------- Ladder Drawing State ----------

export interface LadderDrawState {
  x: number;
  y1: number;
  dragging: boolean;
}

// ---------- Layer Colors ----------

export const LAYER_COLORS: Record<number, string> = {
  0: "#c8c8dc",  // silver
  1: "#fb923c",  // orange
  2: "#4a9eff",  // blue
  3: "#42d392",  // green
  4: "#a78bfa",  // purple
  5: "#f5c542",  // gold
  6: "#ff5c5c",  // red
  7: "#e879f9",  // pink
};

export function getLayerColor(layer: number): string {
  return LAYER_COLORS[layer] ?? LAYER_COLORS[0];
}

// ---------- Portal Types ----------

export const PORTAL_TYPE_NAMES: Record<number, string> = {
  0: "Spawn Point",
  1: "Invisible",
  2: "Visible",
  3: "Touch",
  4: "Touch (type 4)",
  5: "Touch (type 5)",
  6: "Touch (type 6)",
  7: "Scripted",
  8: "Scripted (invisible)",
  9: "Scripted (touch)",
  10: "Hidden",
  12: "Spring",
};

// ---------- Map Info ----------

export interface MapInfo {
  town?: number;
  bgm?: string;
  returnMap?: number;
  mobRate?: number;
  fieldLimit?: number;
  [key: string]: unknown;
}

// ---------- API Data Shapes ----------

export interface ApiMapData {
  id: number;
  streetName: string;
  mapName: string;
  info: MapInfo;
  life: Array<{
    index: string;
    type: string;
    id: string;
    x: number;
    y: number;
    fh: number;
    cy: number;
    rx0: number;
    rx1: number;
    mobTime?: number;
    f?: number;
    hide?: number;
  }>;
  portals: Array<{
    index: string;
    pn: string;
    pt: number;
    x: number;
    y: number;
    tm: number;
    tn: string;
    image?: string;
  }>;
  footholds: Array<{
    layer: string;
    group: string;
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    prev: number;
    next: number;
  }>;
  ladderRopes: Array<{
    id: string;
    x: number;
    y1: number;
    y2: number;
    l: number;
    uf: number;
    page: number;
  }>;
  seats: Array<{
    id: string;
    x: number;
    y: number;
  }>;
}

// ---------- Bounds ----------

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function calculateBounds(
  footholds: EditorFoothold[],
  life: EditorLife[],
  portals: EditorPortal[],
  ladderRopes: EditorLadderRope[],
  seats: EditorSeat[],
): Bounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const fh of footholds) {
    minX = Math.min(minX, fh.x1, fh.x2);
    minY = Math.min(minY, fh.y1, fh.y2);
    maxX = Math.max(maxX, fh.x1, fh.x2);
    maxY = Math.max(maxY, fh.y1, fh.y2);
  }
  for (const l of life) {
    minX = Math.min(minX, l.x);
    minY = Math.min(minY, l.y);
    maxX = Math.max(maxX, l.x);
    maxY = Math.max(maxY, l.y);
  }
  for (const p of portals) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  for (const lr of ladderRopes) {
    minX = Math.min(minX, lr.x);
    minY = Math.min(minY, lr.y1, lr.y2);
    maxX = Math.max(maxX, lr.x);
    maxY = Math.max(maxY, lr.y1, lr.y2);
  }
  for (const s of seats) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x);
    maxY = Math.max(maxY, s.y);
  }

  if (!isFinite(minX)) {
    return { minX: -500, minY: -500, maxX: 500, maxY: 500 };
  }

  const padX = (maxX - minX) * 0.1 || 100;
  const padY = (maxY - minY) * 0.1 || 100;
  return {
    minX: minX - padX,
    minY: minY - padY,
    maxX: maxX + padX,
    maxY: maxY + padY,
  };
}
