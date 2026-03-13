"use client";

import { useMemo } from "react";
import { useMapEditorStore } from "../state/useMapEditorStore";
import { getLayerColor } from "../state/types";

export default function LayerPanel() {
  const footholds = useMapEditorStore((s) => s.footholds);
  const visibleLayers = useMapEditorStore((s) => s.visibleLayers);
  const toggleLayerVisibility = useMapEditorStore((s) => s.toggleLayerVisibility);
  const drawLayer = useMapEditorStore((s) => s.drawLayer);
  const setDrawLayer = useMapEditorStore((s) => s.setDrawLayer);

  const layers = useMemo(() => {
    const layerMap = new Map<number, number>();
    for (const fh of footholds) {
      layerMap.set(fh.layer, (layerMap.get(fh.layer) || 0) + 1);
    }
    return [...layerMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([layer, count]) => ({ layer, count }));
  }, [footholds]);

  if (layers.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-text-muted">
        No foothold layers
      </div>
    );
  }

  return (
    <div className="space-y-1 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Foothold Layers
      </h4>
      {layers.map(({ layer, count }) => {
        const visible = visibleLayers.has(layer);
        const isDrawLayer = drawLayer === layer;
        const color = getLayerColor(layer);

        return (
          <div
            key={layer}
            className={`flex items-center gap-2 rounded px-2 py-1.5 transition-colors ${
              isDrawLayer ? "bg-bg-card-hover" : ""
            }`}
          >
            {/* Visibility toggle */}
            <button
              onClick={() => toggleLayerVisibility(layer)}
              className={`flex h-5 w-5 items-center justify-center rounded text-[10px] transition-colors ${
                visible
                  ? "text-text-primary"
                  : "text-text-muted opacity-40"
              }`}
              title={visible ? "Hide layer" : "Show layer"}
            >
              {visible ? "👁" : "—"}
            </button>

            {/* Color dot */}
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: color, opacity: visible ? 1 : 0.3 }}
            />

            {/* Label */}
            <button
              onClick={() => setDrawLayer(layer)}
              className={`flex-1 text-left text-xs transition-colors ${
                visible ? "text-text-primary" : "text-text-muted"
              } ${isDrawLayer ? "font-semibold" : ""}`}
              title="Set as draw layer"
            >
              Layer {layer}
            </button>

            {/* Count */}
            <span className="font-mono text-[10px] text-text-muted">
              {count}
            </span>

            {/* Active draw indicator */}
            {isDrawLayer && (
              <span className="text-[9px] text-accent-blue">DRAW</span>
            )}
          </div>
        );
      })}

      <div className="mt-3 text-[10px] text-text-muted">
        Click a layer name to set it as the active draw layer.
      </div>
    </div>
  );
}
