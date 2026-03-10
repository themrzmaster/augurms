"use client";

import { useCallback } from "react";
import { useMapEditorStore } from "../state/useMapEditorStore";
import { UpdatePropertyCommand } from "../state/commands";
import { getLayerColor, PORTAL_TYPE_NAMES } from "../state/types";
import type {
  EditorFoothold,
  EditorLife,
  EditorPortal,
  EditorLadderRope,
  EditorSeat,
} from "../state/types";

export default function PropertyPanel() {
  const selection = useMapEditorStore((s) => s.selection);
  const footholds = useMapEditorStore((s) => s.footholds);
  const life = useMapEditorStore((s) => s.life);
  const portals = useMapEditorStore((s) => s.portals);
  const ladderRopes = useMapEditorStore((s) => s.ladderRopes);
  const seats = useMapEditorStore((s) => s.seats);
  const executeCommand = useMapEditorStore((s) => s.executeCommand);

  const selectedIds = selection.editorIds;

  if (selectedIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-muted">
        <span className="text-2xl opacity-40">↖</span>
        <p className="mt-2 text-xs">Select an element to edit</p>
      </div>
    );
  }

  if (selectedIds.length > 1) {
    return (
      <div className="p-3 text-xs text-text-secondary">
        {selectedIds.length} elements selected
      </div>
    );
  }

  const id = selectedIds[0];

  // Find the element
  const fh = footholds.find((f) => f.editorId === id);
  if (fh) return <FootholdProps fh={fh} />;

  const lifeEl = life.find((l) => l.editorId === id);
  if (lifeEl) return <LifeProps life={lifeEl} />;

  const portal = portals.find((p) => p.editorId === id);
  if (portal) return <PortalProps portal={portal} />;

  const lr = ladderRopes.find((l) => l.editorId === id);
  if (lr) return <LadderRopeProps lr={lr} />;

  const seat = seats.find((s) => s.editorId === id);
  if (seat) return <SeatProps seat={seat} />;

  return <div className="p-3 text-xs text-text-muted">Element not found</div>;
}

// ---------- Property Field ----------

function PropField({
  label,
  value,
  type = "text",
  onChange,
  readOnly,
}: {
  label: string;
  value: string | number;
  type?: "text" | "number";
  onChange?: (val: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="flex-shrink-0 text-[11px] text-text-muted">{label}</label>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-24 rounded border border-border bg-bg-secondary px-2 py-1 text-right font-mono text-xs text-text-primary outline-none transition-colors focus:border-accent-blue ${
          readOnly ? "cursor-default opacity-60" : ""
        }`}
      />
    </div>
  );
}

function SectionHeader({ title, color }: { title: string; color?: string }) {
  return (
    <h4
      className="mb-2 text-xs font-semibold uppercase tracking-wide"
      style={{ color: color || "var(--color-text-secondary)" }}
    >
      {title}
    </h4>
  );
}

// ---------- Foothold Properties ----------

function FootholdProps({ fh }: { fh: EditorFoothold }) {
  const executeCommand = useMapEditorStore((s) => s.executeCommand);
  const getFootholds = () => useMapEditorStore.getState().footholds;
  const setFootholds = (fhs: EditorFoothold[]) => useMapEditorStore.setState({ footholds: fhs, isDirty: true });

  const update = useCallback(
    (key: keyof EditorFoothold, val: number) => {
      executeCommand(
        new UpdatePropertyCommand(
          `Update foothold ${key}`,
          fh.editorId,
          key,
          val as any,
          getFootholds,
          setFootholds,
        ),
      );
    },
    [fh.editorId, executeCommand],
  );

  return (
    <div className="space-y-3 p-3">
      <SectionHeader title="Foothold" color={getLayerColor(fh.layer)} />
      <PropField label="ID" value={fh.id} readOnly />
      <PropField label="Layer" value={fh.layer} readOnly />
      <PropField label="Group" value={fh.group} readOnly />
      <div className="h-px bg-border" />
      <PropField label="X1" value={fh.x1} type="number" onChange={(v) => update("x1", parseInt(v) || 0)} />
      <PropField label="Y1" value={fh.y1} type="number" onChange={(v) => update("y1", parseInt(v) || 0)} />
      <PropField label="X2" value={fh.x2} type="number" onChange={(v) => update("x2", parseInt(v) || 0)} />
      <PropField label="Y2" value={fh.y2} type="number" onChange={(v) => update("y2", parseInt(v) || 0)} />
      <div className="h-px bg-border" />
      <PropField label="Prev" value={fh.prev} type="number" onChange={(v) => update("prev", parseInt(v) || 0)} />
      <PropField label="Next" value={fh.next} type="number" onChange={(v) => update("next", parseInt(v) || 0)} />
    </div>
  );
}

// ---------- Life Properties ----------

function LifeProps({ life }: { life: EditorLife }) {
  const executeCommand = useMapEditorStore((s) => s.executeCommand);
  const getLife = () => useMapEditorStore.getState().life;
  const setLife = (ls: EditorLife[]) => useMapEditorStore.setState({ life: ls, isDirty: true });

  const update = useCallback(
    (key: keyof EditorLife, val: any) => {
      executeCommand(
        new UpdatePropertyCommand(
          `Update life ${key}`,
          life.editorId,
          key,
          val,
          getLife,
          setLife,
        ),
      );
    },
    [life.editorId, executeCommand],
  );

  const isMob = life.type === "m";

  return (
    <div className="space-y-3 p-3">
      <SectionHeader title={isMob ? "Mob" : "NPC"} color={isMob ? "#ff5c5c" : "#4a9eff"} />
      <PropField label="ID" value={life.id} readOnly />
      <PropField label="Type" value={isMob ? "Mob" : "NPC"} readOnly />
      <div className="h-px bg-border" />
      <PropField label="X" value={life.x} type="number" onChange={(v) => update("x", parseInt(v) || 0)} />
      <PropField label="Y" value={life.y} type="number" onChange={(v) => update("y", parseInt(v) || 0)} />
      <PropField label="CY" value={life.cy} type="number" onChange={(v) => update("cy", parseInt(v) || 0)} />
      <PropField label="FH" value={life.fh} type="number" onChange={(v) => update("fh", parseInt(v) || 0)} />
      <div className="h-px bg-border" />
      <PropField label="RX0" value={life.rx0} type="number" onChange={(v) => update("rx0", parseInt(v) || 0)} />
      <PropField label="RX1" value={life.rx1} type="number" onChange={(v) => update("rx1", parseInt(v) || 0)} />
      {isMob && (
        <PropField
          label="Respawn"
          value={life.mobTime ?? 0}
          type="number"
          onChange={(v) => update("mobTime", parseInt(v) || 0)}
        />
      )}
    </div>
  );
}

// ---------- Portal Properties ----------

function PortalProps({ portal }: { portal: EditorPortal }) {
  const executeCommand = useMapEditorStore((s) => s.executeCommand);
  const getPortals = () => useMapEditorStore.getState().portals;
  const setPortals = (ps: EditorPortal[]) => useMapEditorStore.setState({ portals: ps, isDirty: true });

  const update = useCallback(
    (key: keyof EditorPortal, val: any) => {
      executeCommand(
        new UpdatePropertyCommand(
          `Update portal ${key}`,
          portal.editorId,
          key,
          val,
          getPortals,
          setPortals,
        ),
      );
    },
    [portal.editorId, executeCommand],
  );

  return (
    <div className="space-y-3 p-3">
      <SectionHeader title="Portal" color="#f5c542" />
      <PropField label="Name" value={portal.pn} onChange={(v) => update("pn", v as any)} />
      <PropField label="Type" value={`${portal.pt} (${PORTAL_TYPE_NAMES[portal.pt] || "Unknown"})`} readOnly />
      <div className="h-px bg-border" />
      <PropField label="X" value={portal.x} type="number" onChange={(v) => update("x", parseInt(v) || 0)} />
      <PropField label="Y" value={portal.y} type="number" onChange={(v) => update("y", parseInt(v) || 0)} />
      <div className="h-px bg-border" />
      <PropField label="Target Map" value={portal.tm} type="number" onChange={(v) => update("tm", parseInt(v) || 0)} />
      <PropField label="Target Portal" value={portal.tn} onChange={(v) => update("tn", v as any)} />
    </div>
  );
}

// ---------- Ladder/Rope Properties ----------

function LadderRopeProps({ lr }: { lr: EditorLadderRope }) {
  const executeCommand = useMapEditorStore((s) => s.executeCommand);
  const getLR = () => useMapEditorStore.getState().ladderRopes;
  const setLR = (lrs: EditorLadderRope[]) => useMapEditorStore.setState({ ladderRopes: lrs, isDirty: true });

  const update = useCallback(
    (key: keyof EditorLadderRope, val: any) => {
      executeCommand(
        new UpdatePropertyCommand(
          `Update ladder/rope ${key}`,
          lr.editorId,
          key,
          val,
          getLR,
          setLR,
        ),
      );
    },
    [lr.editorId, executeCommand],
  );

  return (
    <div className="space-y-3 p-3">
      <SectionHeader title={lr.l === 1 ? "Ladder" : "Rope"} color={lr.l === 1 ? "#fb923c" : "#42d392"} />
      <PropField label="ID" value={lr.id} readOnly />
      <div className="h-px bg-border" />
      <PropField label="X" value={lr.x} type="number" onChange={(v) => update("x", parseInt(v) || 0)} />
      <PropField label="Y1" value={lr.y1} type="number" onChange={(v) => update("y1", parseInt(v) || 0)} />
      <PropField label="Y2" value={lr.y2} type="number" onChange={(v) => update("y2", parseInt(v) || 0)} />
      <div className="h-px bg-border" />
      <PropField label="Page" value={lr.page} type="number" onChange={(v) => update("page", parseInt(v) || 0)} />
    </div>
  );
}

// ---------- Seat Properties ----------

function SeatProps({ seat }: { seat: EditorSeat }) {
  const executeCommand = useMapEditorStore((s) => s.executeCommand);
  const getSeats = () => useMapEditorStore.getState().seats;
  const setSeats = (ss: EditorSeat[]) => useMapEditorStore.setState({ seats: ss, isDirty: true });

  const update = useCallback(
    (key: keyof EditorSeat, val: any) => {
      executeCommand(
        new UpdatePropertyCommand(
          `Update seat ${key}`,
          seat.editorId,
          key,
          val,
          getSeats,
          setSeats,
        ),
      );
    },
    [seat.editorId, executeCommand],
  );

  return (
    <div className="space-y-3 p-3">
      <SectionHeader title="Seat" color="#a78bfa" />
      <PropField label="ID" value={seat.id} readOnly />
      <div className="h-px bg-border" />
      <PropField label="X" value={seat.x} type="number" onChange={(v) => update("x", parseInt(v) || 0)} />
      <PropField label="Y" value={seat.y} type="number" onChange={(v) => update("y", parseInt(v) || 0)} />
    </div>
  );
}
