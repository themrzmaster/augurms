"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import SearchInput from "@/components/SearchInput";

interface MapEntry {
  id: number;
  streetName: string;
  mapName: string;
}

const POPULAR_MAPS: MapEntry[] = [
  { id: 100000000, streetName: "Maple Island", mapName: "Henesys" },
  { id: 101000000, streetName: "Victoria Island", mapName: "Ellinia" },
  { id: 102000000, streetName: "Victoria Island", mapName: "Perion" },
  { id: 103000000, streetName: "Victoria Island", mapName: "Kerning City" },
  { id: 104000000, streetName: "Victoria Island", mapName: "Lith Harbor" },
  { id: 105040300, streetName: "Victoria Island", mapName: "Sleepywood" },
  { id: 200000000, streetName: "Ossyria", mapName: "Orbis" },
  { id: 211000000, streetName: "Ossyria", mapName: "El Nath" },
  { id: 230000000, streetName: "Ossyria", mapName: "Aquarium" },
  { id: 220000000, streetName: "Ossyria", mapName: "Ludibrium" },
];

function MapPreview({ mapId }: { mapId: number }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading"
  );

  return (
    <div className="relative h-32 w-full overflow-hidden rounded-t-xl bg-bg-secondary">
      {status === "loading" && (
        <div className="absolute inset-0 animate-pulse bg-bg-card-hover" />
      )}
      {status === "error" && (
        <div className="flex h-full items-center justify-center text-text-muted">
          <div className="text-center">
            <span className="text-3xl opacity-40">🗺️</span>
            <p className="mt-1 text-xs">No preview</p>
          </div>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://maplestory.io/api/GMS/83/map/${mapId}/render`}
        alt={`Map ${mapId}`}
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        draggable={false}
      />
      {/* Gradient overlay on bottom */}
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-bg-card to-transparent" />
    </div>
  );
}

export default function MapsPage() {
  const [query, setQuery] = useState("");
  const [maps, setMaps] = useState<MapEntry[]>(POPULAR_MAPS);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const searchMaps = useCallback(async (q: string) => {
    if (!q.trim()) {
      setMaps(POPULAR_MAPS);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/maps?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search failed");
      const data: MapEntry[] = await res.json();
      setMaps(data);
    } catch {
      setMaps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      searchMaps(value);
    },
    [searchMaps]
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Maps
        </h1>
        <p className="mt-1.5 text-text-secondary">
          Browse and search all game maps, view spawns, portals, and footholds
        </p>
      </div>

      {/* Search */}
      <SearchInput
        placeholder="Search maps by name or ID..."
        onChange={handleSearch}
        className="max-w-lg"
      />

      {/* Section label */}
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-text-secondary uppercase">
          {searched
            ? `Search Results${maps.length ? ` (${maps.length})` : ""}`
            : "Popular Maps"}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-text-secondary">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
            Searching maps...
          </div>
        </div>
      )}

      {/* No results */}
      {!loading && searched && maps.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <span className="text-4xl opacity-40">🗺️</span>
          <p className="mt-3 text-sm">
            No maps found for &ldquo;{query}&rdquo;
          </p>
        </div>
      )}

      {/* Map grid */}
      {!loading && maps.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {maps.map((map) => (
            <Link key={map.id} href={`/maps/${map.id}`} className="group">
              <div className="overflow-hidden rounded-xl border border-border bg-bg-card transition-all duration-200 group-hover:border-border-light group-hover:bg-bg-card-hover group-hover:shadow-[0_0_30px_rgba(42,42,69,0.4)]">
                <MapPreview mapId={map.id} />
                <div className="px-4 pb-4 pt-2">
                  <h3 className="font-semibold text-text-primary transition-colors group-hover:text-accent-gold">
                    {map.mapName}
                  </h3>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {map.streetName}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="rounded bg-bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                      {map.id}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
