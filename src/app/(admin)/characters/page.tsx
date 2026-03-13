"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import { JOB_NAMES } from "@/lib/cosmic";

interface Character {
  id: number;
  name: string;
  level: number;
  job: number;
  str: number;
  dex: number;
  int: number;
  luk: number;
  maxhp: number;
  maxmp: number;
  meso: number;
  fame: number;
  map: number;
  gm: number;
}

function getLevelColor(level: number): string {
  if (level >= 200) return "bg-accent-gold text-bg-primary";
  if (level >= 150) return "bg-accent-purple text-bg-primary";
  if (level >= 100) return "bg-accent-blue text-bg-primary";
  return "bg-accent-green text-bg-primary";
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-32 rounded bg-bg-card-hover" />
        <div className="h-6 w-16 rounded-full bg-bg-card-hover" />
      </div>
      <div className="h-4 w-24 rounded bg-bg-card-hover mb-3" />
      <div className="flex gap-4 mb-3">
        <div className="h-3 w-16 rounded bg-bg-card-hover" />
        <div className="h-3 w-16 rounded bg-bg-card-hover" />
      </div>
      <div className="space-y-2">
        <div className="h-2 w-full rounded bg-bg-card-hover" />
        <div className="h-2 w-full rounded bg-bg-card-hover" />
      </div>
    </div>
  );
}

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchCharacters() {
      try {
        const res = await fetch("/api/characters");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setCharacters(data);
      } catch {
        setError("Could not load characters. Start the server first to see characters.");
      } finally {
        setLoading(false);
      }
    }
    fetchCharacters();
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Characters
        </h1>
        <p className="mt-1.5 text-text-secondary">
          Manage player characters, stats, and inventories
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4">⚔️</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            No Characters Available
          </h2>
          <p className="text-text-secondary max-w-md">
            {error}
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Character Grid */}
      {!loading && !error && characters.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4">🌟</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            No Characters Found
          </h2>
          <p className="text-text-secondary">
            No characters exist in the database yet.
          </p>
        </div>
      )}

      {!loading && !error && characters.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {characters.map((char) => (
            <Card
              key={char.id}
              hover
              onClick={() => router.push(`/characters/${char.id}`)}
              className="group"
            >
              {/* Name & Level Row */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {char.gm > 0 && (
                    <span
                      className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-gold/20 text-accent-gold text-xs shrink-0"
                      title={`GM Level ${char.gm}`}
                    >
                      ★
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-text-primary truncate group-hover:text-accent-gold transition-colors duration-200">
                    {char.name}
                  </h3>
                </div>
                <span
                  className={`shrink-0 ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${getLevelColor(char.level)}`}
                >
                  Lv. {char.level}
                </span>
              </div>

              {/* Job */}
              <p className="text-sm text-text-secondary mb-3">
                {JOB_NAMES[char.job] || `Job ${char.job}`}
              </p>

              {/* Stats Row */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted mb-3">
                <span>
                  <span className="text-accent-red font-medium">STR</span> {char.str}
                </span>
                <span>
                  <span className="text-accent-blue font-medium">DEX</span> {char.dex}
                </span>
                <span>
                  <span className="text-accent-purple font-medium">INT</span> {char.int}
                </span>
                <span>
                  <span className="text-accent-green font-medium">LUK</span> {char.luk}
                </span>
              </div>

              {/* HP Bar */}
              <div className="mb-1.5">
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-accent-red font-medium">HP</span>
                  <span className="text-text-muted">{char.maxhp.toLocaleString()}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-bg-primary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-red transition-all duration-500"
                    style={{ width: `${Math.min((char.maxhp / 30000) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* MP Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-accent-blue font-medium">MP</span>
                  <span className="text-text-muted">{char.maxmp.toLocaleString()}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-bg-primary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-blue transition-all duration-500"
                    style={{ width: `${Math.min((char.maxmp / 30000) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Meso */}
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-accent-gold">💰</span>
                <span className="text-accent-gold font-semibold">
                  {char.meso.toLocaleString()}
                </span>
                <span className="text-text-muted text-xs">mesos</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
