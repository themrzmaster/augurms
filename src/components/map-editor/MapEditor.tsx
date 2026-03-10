"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useMapEditorStore } from "./state/useMapEditorStore";
import { buildSavePayload } from "./state/serializer";
import type { ApiMapData } from "./state/types";
import MapStage from "./canvas/MapStage";
import EditorToolbar from "./toolbar/EditorToolbar";
import PropertyPanel from "./panels/PropertyPanel";
import ElementListPanel from "./panels/ElementListPanel";
import LayerPanel from "./panels/LayerPanel";

type RightTab = "properties" | "elements" | "layers";

interface MapEditorProps {
  mapId: string;
}

export default function MapEditor({ mapId }: MapEditorProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("properties");
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const loadMapData = useMapEditorStore((s) => s.loadMapData);
  const isDirty = useMapEditorStore((s) => s.isDirty);
  const saving = useMapEditorStore((s) => s.saving);
  const setSaving = useMapEditorStore((s) => s.setSaving);
  const markClean = useMapEditorStore((s) => s.markClean);
  const selection = useMapEditorStore((s) => s.selection);

  // ---- Fetch map data ----

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/maps/${mapId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load map (${res.status})`);
        return res.json();
      })
      .then((data: ApiMapData) => {
        if (!cancelled) {
          loadMapData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mapId, loadMapData]);

  // ---- Resize observer for canvas container ----

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ---- Save handler ----

  const handleSave = useCallback(async () => {
    const state = useMapEditorStore.getState();
    setSaving(true);
    try {
      const payload = buildSavePayload(
        state.footholds,
        state.life,
        state.portals,
        state.ladderRopes,
        state.seats,
      );

      const res = await fetch(`/api/maps/${mapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed");
      markClean();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save map. Check console for details.");
    } finally {
      setSaving(false);
    }
  }, [mapId, setSaving, markClean]);

  // ---- Ctrl+S ----

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !saving) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, saving, handleSave]);

  // ---- Unsaved changes warning ----

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ---- Auto-switch to properties tab on selection ----

  useEffect(() => {
    if (selection.editorIds.length > 0) {
      setRightTab("properties");
    }
  }, [selection.editorIds]);

  // ---- Loading / Error ----

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 text-text-secondary">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
          Loading map editor...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-text-muted">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const RIGHT_TABS: { key: RightTab; label: string }[] = [
    { key: "properties", label: "Properties" },
    { key: "elements", label: "Elements" },
    { key: "layers", label: "Layers" },
  ];

  return (
    <div className="flex h-full flex-col gap-2">
      {/* Toolbar row */}
      <div className="flex items-center gap-2">
        <EditorToolbar />
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-1.5 text-xs font-semibold text-accent-green transition-colors hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Main content: Canvas + Right panel */}
      <div className="flex min-h-0 flex-1 gap-2">
        {/* Canvas */}
        <div
          ref={canvasContainerRef}
          className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border"
        >
          <MapStage width={canvasSize.width} height={canvasSize.height} />
        </div>

        {/* Right panel */}
        <div className="flex w-72 flex-shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-bg-card">
          {/* Tabs */}
          <div className="flex border-b border-border">
            {RIGHT_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setRightTab(tab.key)}
                className={`flex-1 px-2 py-2 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  rightTab === tab.key
                    ? "border-b-2 border-accent-gold text-accent-gold"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {rightTab === "properties" && <PropertyPanel />}
            {rightTab === "elements" && <ElementListPanel />}
            {rightTab === "layers" && <LayerPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
