"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/components/Card";
import SpriteImage from "@/components/SpriteImage";

interface MobDetail {
  id: number;
  name: string;
  stats: {
    level?: number;
    maxHP?: number;
    maxMP?: number;
    exp?: number;
    PADamage?: number;
    MADamage?: number;
    PDDamage?: number;
    MDDamage?: number;
    acc?: number;
    eva?: number;
    speed?: number;
    boss?: boolean | number;
    undead?: boolean | number;
    [key: string]: number | boolean | string | undefined;
  };
}

function EditableStatRow({
  label,
  statKey,
  value,
  color = "text-text-primary",
  onChange,
}: {
  label: string;
  statKey: string;
  value: number | undefined;
  color?: string;
  onChange: (key: string, value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <input
        type="number"
        value={value ?? 0}
        onChange={(e) => onChange(statKey, parseInt(e.target.value) || 0)}
        className={`w-24 rounded border border-border bg-bg-secondary px-2 py-0.5 text-right text-sm font-semibold outline-none transition-colors focus:border-accent-blue ${color} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
    </div>
  );
}

function StatRow({
  label,
  value,
  color = "text-text-primary",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

function StatBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className={`font-semibold ${color}`}>{label}</span>
        <span className="text-text-muted">{value.toLocaleString()}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-bg-primary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color.replace("text-", "bg-")}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function MobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [mob, setMob] = useState<MobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const isDirty = Object.keys(pendingChanges).length > 0;

  useEffect(() => {
    async function fetchMob() {
      try {
        const res = await fetch(`/api/mobs/${id}`);
        if (!res.ok) throw new Error("Failed to fetch mob");
        const data = await res.json();
        setMob(data);
      } catch {
        setError("Could not load mob data.");
      } finally {
        setLoading(false);
      }
    }
    fetchMob();
  }, [id]);

  const handleStatChange = useCallback((key: string, value: number) => {
    setMob((prev) => {
      if (!prev) return prev;
      return { ...prev, stats: { ...prev.stats, [key]: value } };
    });
    setPendingChanges((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/mobs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingChanges),
      });
      if (!res.ok) throw new Error("Save failed");
      setPendingChanges({});
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save mob stats.");
    } finally {
      setSaving(false);
    }
  }, [id, pendingChanges, isDirty]);

  // Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !saving) handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, saving, handleSave]);

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-32 rounded bg-bg-card-hover animate-pulse" />
        <div className="rounded-xl border border-border bg-bg-card p-8 animate-pulse">
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 rounded bg-bg-card-hover" />
            <div className="h-7 w-48 rounded bg-bg-card-hover" />
            <div className="h-4 w-20 rounded bg-bg-card-hover" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-bg-card p-6 animate-pulse">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-6 w-full rounded bg-bg-card-hover" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error || !mob) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push("/mobs")}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <span>&larr;</span> Back to Mobs
        </button>
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4">👾</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Mob Not Found
          </h2>
          <p className="text-text-secondary">{error || "This mob does not exist."}</p>
        </div>
      </div>
    );
  }

  const { stats } = mob;
  const isBoss = stats.boss === true || stats.boss === 1;
  const isUndead = stats.undead === true || stats.undead === 1;

  // Compute sensible max values for bars
  const hpMax = Math.max(stats.maxHP || 0, 100000);
  const mpMax = Math.max(stats.maxMP || 0, 10000);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => router.push("/mobs")}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <span>&larr;</span> Back to Mobs
      </button>

      {/* Mob Header */}
      <div className="rounded-xl border border-border bg-bg-card p-8 shadow-[0_0_30px_rgba(42,42,69,0.2)]">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 rounded-lg border border-border bg-bg-primary p-4">
            <SpriteImage type="mob" id={mob.id} size={96} />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">{mob.name}</h1>
          <p className="text-sm text-text-muted mt-1">ID: {mob.id}</p>

          {/* Badges */}
          <div className="flex items-center gap-2 mt-3">
            {stats.level !== undefined && (
              <span className="rounded-full bg-accent-blue/10 border border-accent-blue/20 px-3 py-0.5 text-xs font-semibold text-accent-blue">
                Lv. {stats.level}
              </span>
            )}
            {isBoss && (
              <span className="rounded-full bg-accent-red/10 border border-accent-red/20 px-3 py-0.5 text-xs font-bold text-accent-red uppercase tracking-wide">
                Boss
              </span>
            )}
            {isUndead && (
              <span className="rounded-full bg-accent-purple/10 border border-accent-purple/20 px-3 py-0.5 text-xs font-bold text-accent-purple uppercase tracking-wide">
                Undead
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Save bar */}
      {isDirty && (
        <div className="flex items-center justify-between rounded-xl border border-accent-orange/30 bg-accent-orange/5 px-5 py-3">
          <span className="text-sm text-accent-orange">
            {Object.keys(pendingChanges).length} unsaved change{Object.keys(pendingChanges).length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent-green px-5 py-2 text-sm font-semibold text-bg-primary transition-colors hover:bg-accent-green/80 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Vitals */}
        <Card title="Vitals">
          <div className="space-y-4">
            {stats.maxHP !== undefined && (
              <StatBar label="HP" value={stats.maxHP} max={hpMax} color="text-accent-red" />
            )}
            {stats.maxMP !== undefined && (
              <StatBar label="MP" value={stats.maxMP} max={mpMax} color="text-accent-blue" />
            )}
          </div>
          <div className="mt-3 space-y-1 border-t border-border pt-3">
            <EditableStatRow label="Level" statKey="level" value={stats.level as number} color="text-accent-blue" onChange={handleStatChange} />
            <EditableStatRow label="Max HP" statKey="maxHP" value={stats.maxHP as number} color="text-accent-red" onChange={handleStatChange} />
            <EditableStatRow label="Max MP" statKey="maxMP" value={stats.maxMP as number} color="text-accent-blue" onChange={handleStatChange} />
            <EditableStatRow label="EXP" statKey="exp" value={stats.exp as number} color="text-accent-gold" onChange={handleStatChange} />
          </div>
        </Card>

        {/* Combat Stats */}
        <Card title="Combat">
          <div className="space-y-1">
            <EditableStatRow label="Physical Attack" statKey="PADamage" value={stats.PADamage as number} color="text-accent-red" onChange={handleStatChange} />
            <EditableStatRow label="Magic Attack" statKey="MADamage" value={stats.MADamage as number} color="text-accent-purple" onChange={handleStatChange} />
            <EditableStatRow label="Physical Defense" statKey="PDDamage" value={stats.PDDamage as number} color="text-accent-orange" onChange={handleStatChange} />
            <EditableStatRow label="Magic Defense" statKey="MDDamage" value={stats.MDDamage as number} color="text-accent-blue" onChange={handleStatChange} />
          </div>
        </Card>

        {/* Agility */}
        <Card title="Agility">
          <div className="space-y-1">
            <EditableStatRow label="Accuracy" statKey="acc" value={stats.acc as number} color="text-accent-green" onChange={handleStatChange} />
            <EditableStatRow label="Evasion" statKey="eva" value={stats.eva as number} color="text-accent-green" onChange={handleStatChange} />
            <EditableStatRow label="Speed" statKey="speed" value={stats.speed as number} color="text-text-primary" onChange={handleStatChange} />
          </div>
        </Card>

        {/* Flags */}
        <Card title="Flags">
          <div className="space-y-1">
            <EditableStatRow label="Boss" statKey="boss" value={stats.boss as number} onChange={handleStatChange} />
            <EditableStatRow label="Undead" statKey="undead" value={stats.undead as number} onChange={handleStatChange} />
            <EditableStatRow label="Body Attack" statKey="bodyAttack" value={stats.bodyAttack as number} onChange={handleStatChange} />
            <EditableStatRow label="Pushed" statKey="pushed" value={stats.pushed as number} onChange={handleStatChange} />
          </div>
        </Card>
      </div>

      {/* Add to Map Section */}
      <Card title="Add to Map">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">
              Map ID
            </label>
            <input
              type="number"
              placeholder="Enter map ID..."
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors duration-200 focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(74,158,255,0.1)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">
              Position (X, Y)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="X"
                className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors duration-200 focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(74,158,255,0.1)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <input
                type="number"
                placeholder="Y"
                className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors duration-200 focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(74,158,255,0.1)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button className="w-full rounded-lg bg-accent-blue px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent-blue/80 hover:shadow-[0_0_20px_rgba(74,158,255,0.2)]">
              Add Spawn
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Add this mob as a spawn point on the specified map.
        </p>
      </Card>
    </div>
  );
}
