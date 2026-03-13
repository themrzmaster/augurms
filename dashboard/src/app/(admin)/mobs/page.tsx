"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import SearchInput from "@/components/SearchInput";
import SpriteImage from "@/components/SpriteImage";

interface Mob {
  id: number;
  name: string;
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-bg-card p-5 animate-pulse">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded bg-bg-card-hover" />
            <div className="h-4 w-20 rounded bg-bg-card-hover" />
            <div className="h-3 w-14 rounded bg-bg-card-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MobsPage() {
  const [mobs, setMobs] = useState<Mob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchMobs = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);

    try {
      const url = query.trim()
        ? `/api/mobs?q=${encodeURIComponent(query)}`
        : "/api/mobs";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setMobs(data);
    } catch {
      setError("Could not load mobs. Make sure the server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load all mobs on mount
  useEffect(() => { fetchMobs(""); }, [fetchMobs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Mobs
        </h1>
        <p className="mt-1.5 text-text-secondary">
          Monster database with stats, drops, and spawn info
        </p>
      </div>

      {/* Search */}
      <SearchInput
        placeholder="Search mobs by name or ID..."
        onChange={fetchMobs}
      />

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4">👾</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Error Loading Mobs
          </h2>
          <p className="text-text-secondary max-w-md">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && <SkeletonGrid />}

      {/* No Results */}
      {!loading && !error && mobs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4">🏜️</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            No Mobs Found
          </h2>
          <p className="text-text-secondary max-w-md">
            Try a different search term.
          </p>
        </div>
      )}

      {/* Mob Grid */}
      {!loading && !error && mobs.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {mobs.map((mob) => (
            <Card
              key={mob.id}
              hover
              onClick={() => router.push(`/mobs/${mob.id}`)}
              className="group flex flex-col items-center text-center"
            >
              <div className="mb-3 flex items-center justify-center h-20">
                <SpriteImage type="mob" id={mob.id} size={64} />
              </div>
              <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent-gold transition-colors duration-200 leading-tight">
                {mob.name}
              </h3>
              <p className="text-xs text-text-muted mt-1">ID: {mob.id}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
