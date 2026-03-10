"use client";

import React, { useRef, useEffect, useCallback, useState, memo } from "react";
import { Stage, Layer, Line, Circle, Rect, Text } from "react-konva";
import type Konva from "konva";
import { useMapEditorStore } from "../state/useMapEditorStore";
import { getLayerColor, TOOL_KEYS } from "../state/types";
import type {
  EditorFoothold,
  EditorLife,
  EditorPortal,
  EditorLadderRope,
  EditorSeat,
  EditorId,
} from "../state/types";
import {
  MoveElementCommand,
  MoveFootholdCommand,
  MoveFootholdEndpointCommand,
  MoveLadderRopeCommand,
  AddElementCommand,
  DeleteElementCommand,
} from "../state/commands";
import { buildFootholdChain, getMaxGroup, relinkOnDelete, getNextFootholdId } from "../state/foothold-utils";
import { snapPoint } from "../state/snap-utils";

// ---------- MapStage ----------

interface MapStageProps {
  width: number;
  height: number;
}

function MapStage({ width, height }: MapStageProps) {
  const stageRef = useRef<Konva.Stage>(null);

  // Store selectors
  const footholds = useMapEditorStore((s) => s.footholds);
  const life = useMapEditorStore((s) => s.life);
  const portals = useMapEditorStore((s) => s.portals);
  const ladderRopes = useMapEditorStore((s) => s.ladderRopes);
  const seats = useMapEditorStore((s) => s.seats);
  const tool = useMapEditorStore((s) => s.tool);
  const selection = useMapEditorStore((s) => s.selection);
  const visibleLayers = useMapEditorStore((s) => s.visibleLayers);
  const showGrid = useMapEditorStore((s) => s.showGrid);
  const gridSize = useMapEditorStore((s) => s.gridSize);
  const snapEnabled = useMapEditorStore((s) => s.snapEnabled);
  const footholdDraw = useMapEditorStore((s) => s.footholdDraw);
  const bounds = useMapEditorStore((s) => s.bounds);
  const drawLayer = useMapEditorStore((s) => s.drawLayer);

  const setTool = useMapEditorStore((s) => s.setTool);
  const setSelection = useMapEditorStore((s) => s.setSelection);
  const clearSelection = useMapEditorStore((s) => s.clearSelection);
  const executeCommand = useMapEditorStore((s) => s.executeCommand);
  const undo = useMapEditorStore((s) => s.undo);
  const redo = useMapEditorStore((s) => s.redo);
  const startFootholdDraw = useMapEditorStore((s) => s.startFootholdDraw);
  const addFootholdDrawPoint = useMapEditorStore((s) => s.addFootholdDrawPoint);
  const cancelFootholdDraw = useMapEditorStore((s) => s.cancelFootholdDraw);

  // Mouse position in world space for preview
  const [mouseWorld, setMouseWorld] = useState<{ x: number; y: number } | null>(null);

  // Drag state for elements
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // ---- Stage transform (pan/zoom) ----

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);

  // Fit view to bounds
  const fitView = useCallback(() => {
    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    if (worldW === 0 || worldH === 0) return;

    const scaleX = width / worldW;
    const scaleY = height / worldH;
    const scale = Math.min(scaleX, scaleY) * 0.9;

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    setStageScale(scale);
    setStagePos({
      x: width / 2 - centerX * scale,
      y: height / 2 - centerY * scale,
    });
  }, [bounds, width, height]);

  // Fit on first load
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!fittedRef.current && bounds.minX !== -500) {
      fittedRef.current = true;
      fitView();
    }
  }, [bounds, fitView]);

  // ---- Screen <-> World ----

  const screenToWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - stagePos.x) / stageScale,
      y: (sy - stagePos.y) / stageScale,
    }),
    [stagePos, stageScale],
  );

  // ---- Wheel zoom ----

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const zoomFactor = e.evt.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.02, Math.min(20, stageScale * zoomFactor));

      // Zoom toward pointer
      const worldBefore = {
        x: (pointer.x - stagePos.x) / stageScale,
        y: (pointer.y - stagePos.y) / stageScale,
      };

      setStageScale(newScale);
      setStagePos({
        x: pointer.x - worldBefore.x * newScale,
        y: pointer.y - worldBefore.y * newScale,
      });
    },
    [stageScale, stagePos],
  );

  // ---- Mouse move (for preview cursor) ----

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const world = screenToWorld(pointer.x, pointer.y);
      const snapped = snapPoint(
        world.x,
        world.y,
        footholds,
        gridSize,
        snapEnabled,
      );
      setMouseWorld(snapped);
    },
    [screenToWorld, footholds, gridSize, snapEnabled],
  );

  // ---- Hit testing ----

  const findElementAt = useCallback(
    (wx: number, wy: number): { editorId: EditorId; type: string } | null => {
      const hitRadius = 12 / stageScale;

      // Check life
      for (const entity of life) {
        const dx = entity.x - wx;
        const dy = entity.y - wy;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
          return { editorId: entity.editorId, type: "life" };
        }
      }

      // Check portals
      for (const portal of portals) {
        const dx = portal.x - wx;
        const dy = portal.y - wy;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
          return { editorId: portal.editorId, type: "portal" };
        }
      }

      // Check seats
      for (const seat of seats) {
        const dx = seat.x - wx;
        const dy = seat.y - wy;
        if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
          return { editorId: seat.editorId, type: "seat" };
        }
      }

      // Check ladderRopes
      for (const lr of ladderRopes) {
        const dx = Math.abs(lr.x - wx);
        const dy = wy >= Math.min(lr.y1, lr.y2) && wy <= Math.max(lr.y1, lr.y2) ? 0 : Infinity;
        if (dx < hitRadius && dy === 0) {
          return { editorId: lr.editorId, type: "ladderRope" };
        }
      }

      // Check footholds
      for (const fh of footholds) {
        if (!visibleLayers.has(fh.layer)) continue;
        // Point-to-line-segment distance
        const dx = fh.x2 - fh.x1;
        const dy = fh.y2 - fh.y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) continue;
        let t = ((wx - fh.x1) * dx + (wy - fh.y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const closestX = fh.x1 + t * dx;
        const closestY = fh.y1 + t * dy;
        const dist = Math.sqrt((wx - closestX) ** 2 + (wy - closestY) ** 2);
        if (dist < hitRadius) {
          return { editorId: fh.editorId, type: "foothold" };
        }
      }

      return null;
    },
    [life, portals, seats, ladderRopes, footholds, visibleLayers, stageScale],
  );

  // ---- Stage click handler ----

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const world = screenToWorld(pointer.x, pointer.y);
      const snapped = snapPoint(world.x, world.y, footholds, gridSize, snapEnabled);

      switch (tool) {
        case "select": {
          const hit = findElementAt(world.x, world.y);
          if (hit) {
            setSelection({ editorIds: [hit.editorId] });
          } else {
            clearSelection();
          }
          break;
        }

        case "foothold": {
          const state = useMapEditorStore.getState();
          if (!state.footholdDraw) {
            startFootholdDraw(snapped);
          } else {
            addFootholdDrawPoint(snapped);
          }
          break;
        }

        case "placeMob":
        case "placeNPC": {
          const state = useMapEditorStore.getState();
          const entityId = state.placementEntityId;
          if (!entityId) break;

          const maxIndex = life.reduce((max, l) => Math.max(max, l.index), -1);
          const newLife: EditorLife = {
            editorId: `life-${Date.now()}`,
            index: maxIndex + 1,
            type: tool === "placeMob" ? "m" : "n",
            id: entityId,
            x: Math.round(snapped.x),
            y: Math.round(snapped.y),
            fh: 0,
            cy: Math.round(snapped.y),
            rx0: Math.round(snapped.x) - 50,
            rx1: Math.round(snapped.x) + 50,
          };

          executeCommand(
            new AddElementCommand(
              `Add ${tool === "placeMob" ? "mob" : "NPC"} ${entityId}`,
              newLife,
              () => useMapEditorStore.getState().life,
              (ls) => useMapEditorStore.setState({ life: ls, isDirty: true }),
            ),
          );
          break;
        }

        case "placePortal": {
          const state = useMapEditorStore.getState();
          const maxIndex = portals.reduce((max, p) => Math.max(max, p.index), -1);
          const newPortal: EditorPortal = {
            editorId: `portal-${Date.now()}`,
            index: maxIndex + 1,
            pn: `p${maxIndex + 1}`,
            pt: state.placementPortalType,
            x: Math.round(snapped.x),
            y: Math.round(snapped.y),
            tm: 999999999,
            tn: "",
          };

          executeCommand(
            new AddElementCommand(
              "Add portal",
              newPortal,
              () => useMapEditorStore.getState().portals,
              (ps) => useMapEditorStore.setState({ portals: ps, isDirty: true }),
            ),
          );
          break;
        }

        case "placeSeat": {
          const maxId = seats.reduce((max, s) => Math.max(max, s.id), -1);
          const newSeat: EditorSeat = {
            editorId: `seat-${Date.now()}`,
            id: maxId + 1,
            x: Math.round(snapped.x),
            y: Math.round(snapped.y),
          };

          executeCommand(
            new AddElementCommand(
              "Add seat",
              newSeat,
              () => useMapEditorStore.getState().seats,
              (ss) => useMapEditorStore.setState({ seats: ss, isDirty: true }),
            ),
          );
          break;
        }

        case "eraser": {
          const hit = findElementAt(world.x, world.y);
          if (!hit) break;

          if (hit.type === "foothold") {
            const fh = footholds.find((f) => f.editorId === hit.editorId);
            if (fh) {
              // Relink chain and delete
              const relinked = relinkOnDelete(footholds, fh);
              useMapEditorStore.setState({ footholds: relinked, isDirty: true });
            }
          } else if (hit.type === "life") {
            executeCommand(
              new DeleteElementCommand(
                "Delete life",
                hit.editorId,
                () => useMapEditorStore.getState().life,
                (ls) => useMapEditorStore.setState({ life: ls, isDirty: true }),
              ),
            );
          } else if (hit.type === "portal") {
            executeCommand(
              new DeleteElementCommand(
                "Delete portal",
                hit.editorId,
                () => useMapEditorStore.getState().portals,
                (ps) => useMapEditorStore.setState({ portals: ps, isDirty: true }),
              ),
            );
          } else if (hit.type === "ladderRope") {
            executeCommand(
              new DeleteElementCommand(
                "Delete ladder/rope",
                hit.editorId,
                () => useMapEditorStore.getState().ladderRopes,
                (lrs) => useMapEditorStore.setState({ ladderRopes: lrs, isDirty: true }),
              ),
            );
          } else if (hit.type === "seat") {
            executeCommand(
              new DeleteElementCommand(
                "Delete seat",
                hit.editorId,
                () => useMapEditorStore.getState().seats,
                (ss) => useMapEditorStore.setState({ seats: ss, isDirty: true }),
              ),
            );
          }
          break;
        }

        case "placeLadder": {
          const state = useMapEditorStore.getState();
          if (!state.ladderDraw) {
            useMapEditorStore.getState().startLadderDraw(Math.round(snapped.x), Math.round(snapped.y));
          } else {
            // Finish ladder draw
            const ld = state.ladderDraw;
            const maxId = ladderRopes.reduce((max, lr) => Math.max(max, lr.id), -1);
            const newLR: EditorLadderRope = {
              editorId: `lr-${Date.now()}`,
              id: maxId + 1,
              x: ld.x,
              y1: Math.min(ld.y1, Math.round(snapped.y)),
              y2: Math.max(ld.y1, Math.round(snapped.y)),
              l: 1,
              uf: 1,
              page: 0,
            };

            executeCommand(
              new AddElementCommand(
                "Add ladder/rope",
                newLR,
                () => useMapEditorStore.getState().ladderRopes,
                (lrs) => useMapEditorStore.setState({ ladderRopes: lrs, isDirty: true }),
              ),
            );
            useMapEditorStore.getState().cancelLadderDraw();
          }
          break;
        }
      }
    },
    [
      tool, screenToWorld, footholds, gridSize, snapEnabled,
      findElementAt, setSelection, clearSelection, executeCommand,
      startFootholdDraw, addFootholdDrawPoint, life, portals, seats, ladderRopes,
    ],
  );

  // ---- Double click to commit foothold chain ----

  const handleDblClick = useCallback(() => {
    const state = useMapEditorStore.getState();
    if (tool !== "foothold" || !state.footholdDraw) return;

    const { points, layer, group: drawGroup } = state.footholdDraw;
    if (points.length < 2) {
      cancelFootholdDraw();
      return;
    }

    // Determine group
    const actualGroup = drawGroup >= 0 ? drawGroup : getMaxGroup(footholds, layer) + 1;

    const chain = buildFootholdChain(points, layer, actualGroup, 0);

    // Add all footholds
    const currentFhs = useMapEditorStore.getState().footholds;
    useMapEditorStore.setState({
      footholds: [...currentFhs, ...chain],
      isDirty: true,
    });

    cancelFootholdDraw();
  }, [tool, footholds, cancelFootholdDraw]);

  // ---- Keyboard shortcuts ----

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      // Tool shortcuts
      const toolKey = TOOL_KEYS[e.key.toLowerCase()];
      if (toolKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setTool(toolKey);
        return;
      }

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redo();
        return;
      }

      // Escape: cancel draw or deselect
      if (e.key === "Escape") {
        const state = useMapEditorStore.getState();
        if (state.footholdDraw) {
          cancelFootholdDraw();
        } else if (state.ladderDraw) {
          useMapEditorStore.getState().cancelLadderDraw();
        } else {
          clearSelection();
        }
        return;
      }

      // Enter: commit foothold draw
      if (e.key === "Enter") {
        handleDblClick();
        return;
      }

      // Delete/Backspace: delete selection
      if (e.key === "Delete" || e.key === "Backspace") {
        const state = useMapEditorStore.getState();
        const ids = state.selection.editorIds;
        if (ids.length === 0) return;

        for (const id of ids) {
          const fh = state.footholds.find((f) => f.editorId === id);
          if (fh) {
            const relinked = relinkOnDelete(useMapEditorStore.getState().footholds, fh);
            useMapEditorStore.setState({ footholds: relinked, isDirty: true });
            continue;
          }

          // Try other element types
          for (const [getter, setter] of [
            [() => useMapEditorStore.getState().life, (ls: any) => useMapEditorStore.setState({ life: ls, isDirty: true })],
            [() => useMapEditorStore.getState().portals, (ps: any) => useMapEditorStore.setState({ portals: ps, isDirty: true })],
            [() => useMapEditorStore.getState().ladderRopes, (lrs: any) => useMapEditorStore.setState({ ladderRopes: lrs, isDirty: true })],
            [() => useMapEditorStore.getState().seats, (ss: any) => useMapEditorStore.setState({ seats: ss, isDirty: true })],
          ] as const) {
            const els = (getter as () => { editorId: string }[])();
            if (els.find((e) => e.editorId === id)) {
              executeCommand(
                new DeleteElementCommand("Delete element", id, getter as any, setter as any),
              );
              break;
            }
          }
        }
        clearSelection();
      }

      // Reset view
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        fitView();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setTool, undo, redo, clearSelection, cancelFootholdDraw, handleDblClick, executeCommand, fitView]);

  // ---- Drag support for select tool ----
  // Konva drag visually moves the node. On dragEnd we capture the delta,
  // reset the node position (state is the source of truth), then apply a
  // command so the state update + re-render positions the node correctly.

  const handleDragStart = useCallback(
    (editorId: EditorId, e: Konva.KonvaEventObject<DragEvent>) => {
      if (tool !== "select") return;
      const node = e.target;
      dragStartRef.current = { x: node.x(), y: node.y() };
    },
    [tool],
  );

  const handleDragEnd = useCallback(
    (editorId: EditorId, elementType: string, e: Konva.KonvaEventObject<DragEvent>) => {
      if (tool !== "select" || !dragStartRef.current) return;

      const node = e.target;
      const dx = Math.round(node.x() - dragStartRef.current.x);
      const dy = Math.round(node.y() - dragStartRef.current.y);

      // Reset the Konva node to its original position so state is the only
      // source of truth. The command's execute() will update state and
      // React will re-render the node at the new position.
      node.position(dragStartRef.current);
      dragStartRef.current = null;

      if (dx === 0 && dy === 0) return;

      switch (elementType) {
        case "life":
          executeCommand(
            new MoveElementCommand(
              "Move life",
              editorId,
              dx,
              dy,
              () => useMapEditorStore.getState().life,
              (ls) => useMapEditorStore.setState({ life: ls, isDirty: true }),
            ),
          );
          break;
        case "portal":
          executeCommand(
            new MoveElementCommand(
              "Move portal",
              editorId,
              dx,
              dy,
              () => useMapEditorStore.getState().portals,
              (ps) => useMapEditorStore.setState({ portals: ps, isDirty: true }),
            ),
          );
          break;
        case "seat":
          executeCommand(
            new MoveElementCommand(
              "Move seat",
              editorId,
              dx,
              dy,
              () => useMapEditorStore.getState().seats,
              (ss) => useMapEditorStore.setState({ seats: ss, isDirty: true }),
            ),
          );
          break;
        case "ladderRope":
          executeCommand(
            new MoveLadderRopeCommand(
              "Move ladder/rope",
              editorId,
              dx,
              dy,
              () => useMapEditorStore.getState().ladderRopes,
              (lrs) => useMapEditorStore.setState({ ladderRopes: lrs, isDirty: true }),
            ),
          );
          break;
        case "foothold":
          executeCommand(
            new MoveFootholdCommand(
              "Move foothold",
              editorId,
              dx,
              dy,
              () => useMapEditorStore.getState().footholds,
              (fhs) => useMapEditorStore.setState({ footholds: fhs, isDirty: true }),
            ),
          );
          break;
      }
    },
    [tool, executeCommand],
  );

  // ---- Visible world range (for grid culling) ----

  const worldTopLeft = screenToWorld(0, 0);
  const worldBottomRight = screenToWorld(width, height);

  // ---- Grid lines ----

  const gridLines: React.ReactNode[] = [];
  if (showGrid) {
    const startX = Math.floor(worldTopLeft.x / gridSize) * gridSize;
    const startY = Math.floor(worldTopLeft.y / gridSize) * gridSize;

    for (let gx = startX; gx <= worldBottomRight.x; gx += gridSize) {
      gridLines.push(
        <Line
          key={`gv-${gx}`}
          points={[gx, worldTopLeft.y, gx, worldBottomRight.y]}
          stroke="rgba(42, 42, 69, 0.3)"
          strokeWidth={1 / stageScale}
          listening={false}
        />,
      );
    }
    for (let gy = startY; gy <= worldBottomRight.y; gy += gridSize) {
      gridLines.push(
        <Line
          key={`gh-${gy}`}
          points={[worldTopLeft.x, gy, worldBottomRight.x, gy]}
          stroke="rgba(42, 42, 69, 0.3)"
          strokeWidth={1 / stageScale}
          listening={false}
        />,
      );
    }
  }

  // ---- Compute cursor style ----

  let cursor = "default";
  switch (tool) {
    case "select": cursor = "default"; break;
    case "foothold": cursor = "crosshair"; break;
    case "placeMob":
    case "placeNPC":
    case "placePortal":
    case "placeSeat":
    case "placeLadder": cursor = "crosshair"; break;
    case "eraser": cursor = "pointer"; break;
  }

  // ---- Visible footholds ----
  const visibleFootholds = footholds.filter((fh) => visibleLayers.has(fh.layer));

  // ---- Selection set for fast lookup ----
  const selectedSet = new Set(selection.editorIds);

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      x={stagePos.x}
      y={stagePos.y}
      scaleX={stageScale}
      scaleY={stageScale}
      draggable={tool === "select"}
      onWheel={handleWheel}
      onClick={handleStageClick}
      onDblClick={handleDblClick}
      onMouseMove={handleMouseMove}
      onDragEnd={(e) => {
        // Stage drag = pan
        if (e.target === stageRef.current) {
          setStagePos({ x: e.target.x(), y: e.target.y() });
        }
      }}
      style={{ cursor, background: "#0d0d18" }}
    >
      {/* Grid layer */}
      <Layer listening={false}>{gridLines}</Layer>

      {/* Origin crosshair */}
      <Layer listening={false}>
        <Line
          points={[0, worldTopLeft.y, 0, worldBottomRight.y]}
          stroke="rgba(85, 85, 106, 0.3)"
          strokeWidth={1 / stageScale}
          dash={[4 / stageScale, 4 / stageScale]}
        />
        <Line
          points={[worldTopLeft.x, 0, worldBottomRight.x, 0]}
          stroke="rgba(85, 85, 106, 0.3)"
          strokeWidth={1 / stageScale}
          dash={[4 / stageScale, 4 / stageScale]}
        />
      </Layer>

      {/* Foothold layer */}
      <Layer listening={false}>
        {visibleFootholds.map((fh) => {
          const color = getLayerColor(fh.layer);
          const isSelected = selectedSet.has(fh.editorId);
          return (
            <Line
              key={fh.editorId}
              points={[fh.x1, fh.y1, fh.x2, fh.y2]}
              stroke={isSelected ? "#ffffff" : color}
              strokeWidth={(isSelected ? 3 : 2) / stageScale}
              lineCap="round"
            />
          );
        })}
        {/* Foothold endpoints */}
        {visibleFootholds.map((fh) => {
          const color = getLayerColor(fh.layer);
          return [
            <Circle
              key={`${fh.editorId}-p1`}
              x={fh.x1}
              y={fh.y1}
              radius={3 / stageScale}
              fill={color}
              opacity={0.6}
            />,
            <Circle
              key={`${fh.editorId}-p2`}
              x={fh.x2}
              y={fh.y2}
              radius={3 / stageScale}
              fill={color}
              opacity={0.6}
            />,
          ];
        })}
      </Layer>

      {/* Ladder/Rope layer */}
      <Layer listening={false}>
        {ladderRopes.map((lr) => (
          <Line
            key={lr.editorId}
            points={[lr.x, lr.y1, lr.x, lr.y2]}
            stroke={lr.l === 1 ? "#fb923c" : "#42d392"}
            strokeWidth={2 / stageScale}
            dash={[6 / stageScale, 4 / stageScale]}
            opacity={selectedSet.has(lr.editorId) ? 1 : 0.7}
          />
        ))}
      </Layer>

      {/* Seat layer */}
      <Layer listening={false}>
        {seats.map((s) => (
          <Rect
            key={s.editorId}
            x={s.x - 4 / stageScale}
            y={s.y - 4 / stageScale}
            width={8 / stageScale}
            height={8 / stageScale}
            fill="#a78bfa"
            opacity={selectedSet.has(s.editorId) ? 1 : 0.7}
          />
        ))}
      </Layer>

      {/* Portal layer */}
      <Layer listening={false}>
        {portals.map((p) => {
          const isSelected = selectedSet.has(p.editorId);
          const size = 8 / stageScale;
          return (
            <React.Fragment key={p.editorId}>
              {/* Diamond shape using Line */}
              <Line
                points={[p.x, p.y - size, p.x + size, p.y, p.x, p.y + size, p.x - size, p.y]}
                closed
                fill={isSelected ? "#ffd700" : "#f5c542"}
                stroke="#d4a520"
                strokeWidth={1.5 / stageScale}
              />
              {stageScale > 0.3 && (
                <Text
                  x={p.x - 30 / stageScale}
                  y={p.y - 18 / stageScale}
                  width={60 / stageScale}
                  text={p.pn || "portal"}
                  fontSize={10 / stageScale}
                  fill="#f5c542"
                  align="center"
                />
              )}
            </React.Fragment>
          );
        })}
      </Layer>

      {/* Life layer (mobs and NPCs) */}
      <Layer>
        {life.map((entity) => {
          const isMob = entity.type === "m";
          const color = isMob ? "#ff5c5c" : "#4a9eff";
          const isSelected = selectedSet.has(entity.editorId);
          const r = 6 / stageScale;

          return (
            <React.Fragment key={entity.editorId}>
              <Circle
                x={entity.x}
                y={entity.y}
                radius={r}
                fill={color}
                stroke={isSelected ? "#ffffff" : isMob ? "rgba(200,50,50,0.8)" : "rgba(40,120,220,0.8)"}
                strokeWidth={1.5 / stageScale}
                draggable={tool === "select"}
                onDragStart={(e) => handleDragStart(entity.editorId, e)}
                onDragEnd={(e) => handleDragEnd(entity.editorId, "life", e)}
                onClick={(e) => {
                  e.cancelBubble = true;
                  if (tool === "select") {
                    setSelection({ editorIds: [entity.editorId] });
                  }
                }}
              />
              {stageScale > 0.25 && (
                <Text
                  x={entity.x - 40 / stageScale}
                  y={entity.y - 16 / stageScale}
                  width={80 / stageScale}
                  text={entity.name || `${isMob ? "Mob" : "NPC"} ${entity.id}`}
                  fontSize={10 / stageScale}
                  fill={color}
                  align="center"
                  listening={false}
                />
              )}
            </React.Fragment>
          );
        })}
      </Layer>

      {/* Selection overlay — endpoint handles for selected footholds */}
      <Layer>
        {selection.editorIds.map((id) => {
          const fh = footholds.find((f) => f.editorId === id);
          if (!fh) return null;
          const handleR = 5 / stageScale;
          return (
            <React.Fragment key={`sel-${id}`}>
              <Circle
                x={fh.x1}
                y={fh.y1}
                radius={handleR}
                fill="white"
                stroke="#4a9eff"
                strokeWidth={2 / stageScale}
                draggable
                onDragStart={(e) => {
                  dragStartRef.current = { x: fh.x1, y: fh.y1 };
                }}
                onDragEnd={(e) => {
                  if (!dragStartRef.current) return;
                  const dx = Math.round(e.target.x() - dragStartRef.current.x);
                  const dy = Math.round(e.target.y() - dragStartRef.current.y);
                  e.target.position(dragStartRef.current);
                  dragStartRef.current = null;
                  if (dx === 0 && dy === 0) return;
                  executeCommand(
                    new MoveFootholdEndpointCommand(
                      "Move foothold endpoint",
                      fh.editorId,
                      "start",
                      dx,
                      dy,
                      () => useMapEditorStore.getState().footholds,
                      (fhs) => useMapEditorStore.setState({ footholds: fhs, isDirty: true }),
                    ),
                  );
                }}
              />
              <Circle
                x={fh.x2}
                y={fh.y2}
                radius={handleR}
                fill="white"
                stroke="#4a9eff"
                strokeWidth={2 / stageScale}
                draggable
                onDragStart={(e) => {
                  dragStartRef.current = { x: fh.x2, y: fh.y2 };
                }}
                onDragEnd={(e) => {
                  if (!dragStartRef.current) return;
                  const dx = Math.round(e.target.x() - dragStartRef.current.x);
                  const dy = Math.round(e.target.y() - dragStartRef.current.y);
                  e.target.position(dragStartRef.current);
                  dragStartRef.current = null;
                  if (dx === 0 && dy === 0) return;
                  executeCommand(
                    new MoveFootholdEndpointCommand(
                      "Move foothold endpoint",
                      fh.editorId,
                      "end",
                      dx,
                      dy,
                      () => useMapEditorStore.getState().footholds,
                      (fhs) => useMapEditorStore.setState({ footholds: fhs, isDirty: true }),
                    ),
                  );
                }}
              />
            </React.Fragment>
          );
        })}
      </Layer>

      {/* Foothold draw preview */}
      {footholdDraw && footholdDraw.points.length > 0 && mouseWorld && (
        <Layer listening={false}>
          {/* Existing chain lines */}
          {footholdDraw.points.length >= 2 &&
            footholdDraw.points.slice(0, -1).map((pt, i) => (
              <Line
                key={`draw-${i}`}
                points={[pt.x, pt.y, footholdDraw.points[i + 1].x, footholdDraw.points[i + 1].y]}
                stroke={getLayerColor(footholdDraw.layer)}
                strokeWidth={2 / stageScale}
                lineCap="round"
              />
            ))}
          {/* Preview line to cursor */}
          <Line
            points={[
              footholdDraw.points[footholdDraw.points.length - 1].x,
              footholdDraw.points[footholdDraw.points.length - 1].y,
              mouseWorld.x,
              mouseWorld.y,
            ]}
            stroke={getLayerColor(footholdDraw.layer)}
            strokeWidth={2 / stageScale}
            dash={[4 / stageScale, 4 / stageScale]}
            opacity={0.6}
          />
          {/* Points */}
          {footholdDraw.points.map((pt, i) => (
            <Circle
              key={`draw-pt-${i}`}
              x={pt.x}
              y={pt.y}
              radius={4 / stageScale}
              fill={getLayerColor(footholdDraw.layer)}
            />
          ))}
        </Layer>
      )}

      {/* Ladder draw preview */}
      {tool === "placeLadder" &&
        useMapEditorStore.getState().ladderDraw &&
        mouseWorld && (
          <Layer listening={false}>
            <Line
              points={[
                useMapEditorStore.getState().ladderDraw!.x,
                useMapEditorStore.getState().ladderDraw!.y1,
                useMapEditorStore.getState().ladderDraw!.x,
                mouseWorld.y,
              ]}
              stroke="#fb923c"
              strokeWidth={2 / stageScale}
              dash={[6 / stageScale, 4 / stageScale]}
              opacity={0.6}
            />
          </Layer>
        )}
    </Stage>
  );
}

export default memo(MapStage);
