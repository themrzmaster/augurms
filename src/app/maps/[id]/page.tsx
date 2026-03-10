"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useMapEditorStore } from "@/components/map-editor/state/useMapEditorStore";

// Dynamic import to avoid SSR issues with Konva
const MapEditor = dynamic(() => import("@/components/map-editor/MapEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-3 text-text-secondary">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
        Loading editor...
      </div>
    </div>
  ),
});

export default function MapDetailPage() {
  const params = useParams();
  const mapId = params.id as string;

  const mapName = useMapEditorStore((s) => s.mapName);
  const streetName = useMapEditorStore((s) => s.streetName);

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col gap-3">
      {/* Breadcrumb + Header */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Link
            href="/maps"
            className="transition-colors hover:text-text-secondary"
          >
            Maps
          </Link>
          <span>/</span>
          <span className="text-text-secondary">
            {mapName || `Map ${mapId}`}
          </span>
        </div>
        <div className="mt-1 flex items-end gap-3">
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            {mapName || "Map Editor"}
          </h1>
          {streetName && (
            <span className="text-sm text-text-secondary">{streetName}</span>
          )}
          <span className="rounded bg-bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
            {mapId}
          </span>
        </div>
      </div>

      {/* Editor */}
      <div className="min-h-0 flex-1">
        <MapEditor mapId={mapId} />
      </div>
    </div>
  );
}
