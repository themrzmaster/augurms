"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  hp: number;
  mp: number;
  meso: number;
  fame: number;
  ap: number;
  sp: number;
  map: number;
  gm: number;
  skincolor: number;
  gender: number;
  hair: number;
  face: number;
  exp: number;
}

type EditableFields = {
  level: number;
  str: number;
  dex: number;
  int: number;
  luk: number;
  maxhp: number;
  maxmp: number;
  meso: number;
  fame: number;
  ap: number;
  sp: number;
  job: number;
  map: number;
  gm: number;
};

function getLevelColor(level: number): string {
  if (level >= 200) return "text-accent-gold";
  if (level >= 150) return "text-accent-purple";
  if (level >= 100) return "text-accent-blue";
  return "text-accent-green";
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
        <span className={`${color} font-semibold`}>{label}</span>
        <span className="text-text-muted">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-bg-primary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color.replace("text-", "bg-")}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatField({
  label,
  name,
  value,
  onChange,
  color,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (name: string, value: number) => void;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label
        className={`w-16 text-sm font-semibold shrink-0 ${color || "text-text-secondary"}`}
      >
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(name, parseInt(e.target.value) || 0)}
        className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none transition-colors duration-200 focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(74,158,255,0.1)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}

export default function CharacterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    async function fetchCharacter() {
      try {
        const res = await fetch(`/api/characters/${id}`);
        if (!res.ok) throw new Error("Failed to fetch character");
        const data = await res.json();
        setCharacter(data);
        setFields({
          level: data.level,
          str: data.str,
          dex: data.dex,
          int: data.int,
          luk: data.luk,
          maxhp: data.maxhp,
          maxmp: data.maxmp,
          meso: data.meso,
          fame: data.fame,
          ap: data.ap ?? 0,
          sp: data.sp ?? 0,
          job: data.job,
          map: data.map,
          gm: data.gm,
        });
      } catch {
        setError("Could not load character data.");
      } finally {
        setLoading(false);
      }
    }
    fetchCharacter();
  }, [id]);

  const handleFieldChange = (name: string, value: number) => {
    if (!fields) return;
    setFields({ ...fields, [name]: value });
  };

  const handleSave = async () => {
    if (!fields) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/characters/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      setCharacter((prev) => (prev ? { ...prev, ...updated } : prev));
      showToast("Character updated successfully!", "success");
    } catch {
      showToast("Failed to save changes. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const quickAction = (overrides: Partial<EditableFields>) => {
    if (!fields) return;
    setFields({ ...fields, ...overrides });
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-bg-card-hover animate-pulse" />
        <div className="rounded-xl border border-border bg-bg-card p-8 animate-pulse">
          <div className="h-10 w-64 rounded bg-bg-card-hover mb-4" />
          <div className="h-5 w-32 rounded bg-bg-card-hover" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-bg-card p-6 animate-pulse">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 w-full rounded bg-bg-card-hover" />
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg-card p-6 animate-pulse">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-6 w-full rounded bg-bg-card-hover" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !character || !fields) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push("/characters")}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <span>&larr;</span> Back to Characters
        </button>
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4">😵</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Character Not Found
          </h2>
          <p className="text-text-secondary">{error || "This character does not exist."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 rounded-lg border px-5 py-3 text-sm font-medium shadow-lg transition-all duration-300 ${
            toast.type === "success"
              ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
              : "border-accent-red/30 bg-accent-red/10 text-accent-red"
          }`}
        >
          {toast.type === "success" ? "✓" : "✕"} {toast.message}
        </div>
      )}

      {/* Back Button */}
      <button
        onClick={() => router.push("/characters")}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <span>&larr;</span> Back to Characters
      </button>

      {/* Character Header Card */}
      <div className="rounded-xl border border-border bg-bg-card p-6 shadow-[0_0_30px_rgba(42,42,69,0.2)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-text-primary">
                {character.name}
              </h1>
              {character.gm > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-accent-gold/15 px-3 py-1 text-xs font-bold text-accent-gold border border-accent-gold/20">
                  ★ GM {character.gm}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-4">
              <span className={`text-lg font-bold ${getLevelColor(character.level)}`}>
                Level {character.level}
              </span>
              <span className="text-text-muted">|</span>
              <span className="text-text-secondary">
                {JOB_NAMES[character.job] || `Job ${character.job}`}
              </span>
            </div>
          </div>
          <div className="text-right text-sm text-text-muted">
            <p>Character ID: {character.id}</p>
            <p>Map: {character.map}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Stats Editor Panel */}
        <Card title="Stats Editor">
          <div className="space-y-3">
            <StatField label="Level" name="level" value={fields.level} onChange={handleFieldChange} color="text-accent-gold" />
            <div className="h-px bg-border my-1" />
            <StatField label="STR" name="str" value={fields.str} onChange={handleFieldChange} color="text-accent-red" />
            <StatField label="DEX" name="dex" value={fields.dex} onChange={handleFieldChange} color="text-accent-blue" />
            <StatField label="INT" name="int" value={fields.int} onChange={handleFieldChange} color="text-accent-purple" />
            <StatField label="LUK" name="luk" value={fields.luk} onChange={handleFieldChange} color="text-accent-green" />
            <div className="h-px bg-border my-1" />
            <StatField label="MaxHP" name="maxhp" value={fields.maxhp} onChange={handleFieldChange} color="text-accent-red" />
            <StatField label="MaxMP" name="maxmp" value={fields.maxmp} onChange={handleFieldChange} color="text-accent-blue" />
            <div className="h-px bg-border my-1" />
            <StatField label="Meso" name="meso" value={fields.meso} onChange={handleFieldChange} color="text-accent-gold" />
            <StatField label="Fame" name="fame" value={fields.fame} onChange={handleFieldChange} color="text-accent-orange" />
            <StatField label="AP" name="ap" value={fields.ap} onChange={handleFieldChange} />
            <StatField label="SP" name="sp" value={fields.sp} onChange={handleFieldChange} />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-5 w-full rounded-lg bg-accent-blue px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent-blue/80 hover:shadow-[0_0_20px_rgba(74,158,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </Card>

        <div className="space-y-6">
          {/* Stat Bars Visualization */}
          <Card title="Stat Overview">
            <div className="space-y-3">
              <StatBar label="STR" value={fields.str} max={32767} color="text-accent-red" />
              <StatBar label="DEX" value={fields.dex} max={32767} color="text-accent-blue" />
              <StatBar label="INT" value={fields.int} max={32767} color="text-accent-purple" />
              <StatBar label="LUK" value={fields.luk} max={32767} color="text-accent-green" />
              <div className="h-px bg-border my-1" />
              <StatBar label="HP" value={fields.maxhp} max={30000} color="text-accent-red" />
              <StatBar label="MP" value={fields.maxmp} max={30000} color="text-accent-blue" />
            </div>
          </Card>

          {/* Job Selector */}
          <Card title="Job">
            <select
              value={fields.job}
              onChange={(e) => handleFieldChange("job", parseInt(e.target.value))}
              className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary outline-none transition-colors duration-200 focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(74,158,255,0.1)]"
            >
              {Object.entries(JOB_NAMES).map(([jobId, jobName]) => (
                <option key={jobId} value={jobId}>
                  {jobName} ({jobId})
                </option>
              ))}
            </select>
          </Card>

          {/* Map Selector */}
          <Card title="Map">
            <StatField label="Map ID" name="map" value={fields.map} onChange={handleFieldChange} />
          </Card>

          {/* Role / GM Level */}
          <Card title="Role">
            <div className="space-y-2">
              {[
                { level: 0, label: "Player", desc: "Normal player", color: "border-border bg-bg-secondary text-text-secondary" },
                { level: 1, label: "Moderator", desc: "@ban, @unban, @dc, @goto, @hide", color: "border-accent-blue/30 bg-accent-blue/5 text-accent-blue" },
                { level: 2, label: "GM", desc: "@warp, @item, @jail, @heal, @job", color: "border-accent-purple/30 bg-accent-purple/5 text-accent-purple" },
                { level: 3, label: "Senior GM", desc: "@spawn, @fame, @givenx, @fly", color: "border-accent-gold/30 bg-accent-gold/5 text-accent-gold" },
                { level: 6, label: "Admin", desc: "Full access", color: "border-accent-red/30 bg-accent-red/5 text-accent-red" },
              ].map((role) => (
                <button
                  key={role.level}
                  onClick={() => handleFieldChange("gm", role.level)}
                  className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-all duration-200 ${
                    fields.gm === role.level
                      ? role.color + " shadow-sm"
                      : "border-border bg-bg-secondary/50 text-text-muted hover:bg-bg-card-hover"
                  }`}
                >
                  <div className="text-left">
                    <span className="font-semibold">{role.label}</span>
                    <p className="text-xs opacity-70 mt-0.5">{role.desc}</p>
                  </div>
                  {fields.gm === role.level && (
                    <span className="text-xs font-bold">Active</span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Click &quot;Save Changes&quot; to apply role change. Player must relog.
            </p>
          </Card>

          {/* Quick Actions */}
          <Card title="Quick Actions">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => quickAction({ str: 32767, dex: 32767, int: 32767, luk: 32767 })}
                className="rounded-lg border border-accent-red/20 bg-accent-red/5 px-3 py-2.5 text-sm font-medium text-accent-red transition-all duration-200 hover:bg-accent-red/15 hover:border-accent-red/40"
              >
                Max Stats
              </button>
              <button
                onClick={() => quickAction({ level: 200 })}
                className="rounded-lg border border-accent-gold/20 bg-accent-gold/5 px-3 py-2.5 text-sm font-medium text-accent-gold transition-all duration-200 hover:bg-accent-gold/15 hover:border-accent-gold/40"
              >
                Max Level
              </button>
              <button
                onClick={() => quickAction({ meso: 999999999 })}
                className="rounded-lg border border-accent-orange/20 bg-accent-orange/5 px-3 py-2.5 text-sm font-medium text-accent-orange transition-all duration-200 hover:bg-accent-orange/15 hover:border-accent-orange/40"
              >
                Give Mesos
              </button>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Quick actions update the form. Click &quot;Save Changes&quot; to apply.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
