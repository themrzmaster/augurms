"use client";

import { useState, useEffect, useCallback } from "react";
import ServerControls from "@/components/ServerControls";

/* ── types ──────────────────────────────────────────────────────── */

interface WorldConfig {
  flag: number;
  server_message: string;
  event_message: string;
  why_am_i_recommended: string;
  channels: number;
  exp_rate: number;
  meso_rate: number;
  drop_rate: number;
  boss_drop_rate: number;
  quest_rate: number;
  fishing_rate: number;
  travel_rate: number;
}

interface Config {
  server: Record<string, unknown>;
  worlds?: WorldConfig[];
}

/* ── helpers ────────────────────────────────────────────────────── */

const WORLD_NAMES: Record<number, string> = {
  0: "Scania",
  1: "Bera",
  2: "Broa",
  3: "Windia",
  4: "Khaini",
  5: "Bellocan",
  6: "Mardia",
  7: "Kradia",
  8: "Yellonde",
  9: "Demethos",
  10: "Galicia",
  11: "El Nido",
  12: "Zenith",
  13: "Arcania",
};

const RATE_FIELDS: { key: string; label: string; max: number }[] = [
  { key: "exp_rate", label: "EXP Rate", max: 100 },
  { key: "meso_rate", label: "Meso Rate", max: 100 },
  { key: "drop_rate", label: "Drop Rate", max: 100 },
  { key: "boss_drop_rate", label: "Boss Drop Rate", max: 100 },
  { key: "quest_rate", label: "Quest Rate", max: 50 },
  { key: "fishing_rate", label: "Fishing Rate", max: 50 },
  { key: "travel_rate", label: "Travel Rate", max: 50 },
];

type FlagGroup = {
  label: string;
  color: string;
  keys: string[];
};

function groupFlags(serverKeys: string[]): FlagGroup[] {
  const gameplay: string[] = [];
  const economy: string[] = [];
  const events: string[] = [];
  const debug: string[] = [];
  const other: string[] = [];

  for (const k of serverKeys) {
    if (typeof k !== "string") continue;
    const upper = k.toUpperCase();
    if (
      !(upper.startsWith("USE_") || upper.startsWith("ENABLE_")) ||
      upper.includes("PIC") ||
      upper.includes("PIN") ||
      upper === "ENABLE_PIC" ||
      upper === "ENABLE_PIN"
    )
      continue;

    if (
      upper.includes("DEBUG") ||
      upper.includes("PACKET") ||
      upper.includes("SHOW_RCVD")
    ) {
      debug.push(k);
    } else if (
      upper.includes("AUTOBAN") ||
      upper.includes("HPMP") ||
      upper.includes("RANDOMIZE") ||
      upper.includes("MAX_") ||
      upper.includes("UNDEAD") ||
      upper.includes("PERFECT") ||
      upper.includes("BUFF") ||
      upper.includes("SOLO") ||
      upper.includes("EXPEDI") ||
      upper.includes("PQ") ||
      upper.includes("NPC") ||
      upper.includes("QUEST") ||
      upper.includes("FAMILY") ||
      upper.includes("PARTY")
    ) {
      gameplay.push(k);
    } else if (
      upper.includes("MERCH") ||
      upper.includes("CASH") ||
      upper.includes("MTS") ||
      upper.includes("TRADE") ||
      upper.includes("SHOP") ||
      upper.includes("MESO") ||
      upper.includes("DUEY") ||
      upper.includes("CUSTOM_NPC") ||
      upper.includes("ENFORCE")
    ) {
      economy.push(k);
    } else if (
      upper.includes("EVENT") ||
      upper.includes("OLD_GMS") ||
      upper.includes("STARTING") ||
      upper.includes("LOGIN") ||
      upper.includes("SERVER") ||
      upper.includes("REGISTER")
    ) {
      events.push(k);
    } else {
      other.push(k);
    }
  }

  const groups: FlagGroup[] = [];
  if (gameplay.length)
    groups.push({ label: "Gameplay", color: "text-accent-blue", keys: gameplay.sort() });
  if (economy.length)
    groups.push({ label: "Economy", color: "text-accent-gold", keys: economy.sort() });
  if (events.length)
    groups.push({ label: "Events & Server", color: "text-accent-purple", keys: events.sort() });
  if (debug.length)
    groups.push({ label: "Debug", color: "text-accent-red", keys: debug.sort() });
  if (other.length)
    groups.push({ label: "Other", color: "text-accent-green", keys: other.sort() });
  return groups;
}

/* ── sub-components ─────────────────────────────────────────────── */

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-bg-card-hover"
      >
        <span className="text-lg">{icon}</span>
        <span className="flex-1 text-sm font-semibold tracking-wide text-text-primary uppercase">
          {title}
        </span>
        <span
          className={`text-text-muted transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      {open && <div className="border-t border-border px-5 py-5">{children}</div>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
        checked
          ? "border-accent-green bg-accent-green/20"
          : "border-border bg-bg-secondary"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-lg transition-all duration-200 ${
          checked
            ? "translate-x-5 bg-accent-green shadow-[0_0_8px_rgba(66,211,146,0.4)]"
            : "translate-x-0 bg-text-muted"
        }`}
      />
    </button>
  );
}

/* ── main page ──────────────────────────────────────────────────── */

export default function ConfigPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorld, setSelectedWorld] = useState(0);
  const [worldEdits, setWorldEdits] = useState<Record<string, number>>({});
  const [savingWorld, setSavingWorld] = useState(false);
  const [numericEdits, setNumericEdits] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{
    key: string;
    type: "success" | "error";
  } | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error("Failed to fetch config");
      const data = await res.json();
      setConfig(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function updateConfig(path: string, value: unknown) {
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update config");
    }
    return res.json();
  }

  function showFeedback(key: string, type: "success" | "error") {
    setFeedback({ key, type });
    setTimeout(() => setFeedback(null), 2000);
  }

  async function handleToggle(key: string, value: boolean) {
    setSavingKeys((prev) => new Set(prev).add(key));
    try {
      await updateConfig(`server.${key}`, value);
      setConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          server: { ...prev.server, [key]: value },
        };
      });
      showFeedback(key, "success");
    } catch {
      showFeedback(key, "error");
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleNumericSave(key: string) {
    const raw = numericEdits[key];
    if (raw === undefined) return;
    const value = Number(raw);
    if (isNaN(value)) return;

    setSavingKeys((prev) => new Set(prev).add(key));
    try {
      await updateConfig(`server.${key}`, value);
      setConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          server: { ...prev.server, [key]: value },
        };
      });
      setNumericEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      showFeedback(key, "success");
    } catch {
      showFeedback(key, "error");
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleWorldApply() {
    if (!config?.worlds?.[selectedWorld]) return;
    setSavingWorld(true);
    try {
      for (const [rateKey, rateVal] of Object.entries(worldEdits)) {
        await updateConfig(`worlds.${selectedWorld}.${rateKey}`, rateVal);
      }
      setConfig((prev) => {
        if (!prev || !prev.worlds) return prev;
        const worlds = [...prev.worlds];
        worlds[selectedWorld] = {
          ...worlds[selectedWorld],
          ...worldEdits,
        } as WorldConfig;
        return { ...prev, worlds };
      });
      setWorldEdits({});
      showFeedback("world-rates", "success");
    } catch {
      showFeedback("world-rates", "error");
    } finally {
      setSavingWorld(false);
    }
  }

  /* ── render ──────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
          <span className="text-sm text-text-secondary">Loading configuration...</span>
        </div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="rounded-xl border border-accent-red/30 bg-accent-red/10 px-6 py-4 text-accent-red">
          {error || "Failed to load configuration"}
        </div>
      </div>
    );
  }

  const server = config.server;
  const worlds = config.worlds || [];
  const currentWorld = worlds[selectedWorld];

  // Separate config keys by type
  const boolKeys = Object.keys(server).filter(
    (k) =>
      typeof server[k] === "boolean" &&
      (k.toUpperCase().startsWith("USE_") || k.toUpperCase().startsWith("ENABLE_"))
  );
  const numericKeys = Object.keys(server).filter(
    (k) =>
      typeof server[k] === "number" &&
      !k.toUpperCase().startsWith("USE_") &&
      !k.toUpperCase().startsWith("ENABLE_") &&
      !k.toUpperCase().includes("DB_") &&
      !k.toUpperCase().includes("PORT")
  );

  const loginKeys = boolKeys.filter(
    (k) =>
      k.toUpperCase().includes("PIC") ||
      k.toUpperCase().includes("PIN") ||
      k.toUpperCase() === "AUTOMATIC_REGISTER"
  );

  const flagGroups = groupFlags(
    boolKeys.filter((k) => !loginKeys.includes(k))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Server Configuration
        </h1>
        <p className="mt-1.5 text-text-secondary">
          Manage rates, feature flags, and server settings
        </p>
      </div>

      {/* ── Rates ──────────────────────────────────────────────── */}
      <CollapsibleSection title="World Rates" icon="⚡">
        {/* World tabs */}
        {worlds.length > 0 && (
          <>
            <div className="mb-5 flex flex-wrap gap-2">
              {worlds.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelectedWorld(i);
                    setWorldEdits({});
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                    selectedWorld === i
                      ? "border-accent-gold/40 bg-accent-gold/15 text-accent-gold shadow-[0_0_12px_rgba(245,197,66,0.1)]"
                      : "border-border bg-bg-secondary text-text-secondary hover:text-text-primary"
                  }`}
                >
                  World {i} {WORLD_NAMES[i] || ""}
                </button>
              ))}
            </div>

            {currentWorld && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {RATE_FIELDS.map(({ key, label, max }) => {
                    const current =
                      worldEdits[key] ??
                      (currentWorld as unknown as Record<string, number>)[key] ??
                      1;
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-border bg-bg-secondary p-4"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
                            {label}
                          </span>
                          <span className="text-lg font-bold text-accent-gold">
                            {current}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={max}
                          step={1}
                          value={current}
                          onChange={(e) =>
                            setWorldEdits((prev) => ({
                              ...prev,
                              [key]: Number(e.target.value),
                            }))
                          }
                          className="w-full accent-accent-gold"
                        />
                        <div className="mt-1 flex justify-between text-[10px] text-text-muted">
                          <span>1x</span>
                          <span>{max}x</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {Object.keys(worldEdits).length > 0 && (
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleWorldApply}
                      disabled={savingWorld}
                      className="rounded-lg border border-accent-gold/30 bg-accent-gold/15 px-5 py-2 text-sm font-semibold text-accent-gold transition-all hover:bg-accent-gold/25 disabled:opacity-50"
                    >
                      {savingWorld ? (
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
                          Applying...
                        </span>
                      ) : (
                        "Apply Rates"
                      )}
                    </button>
                    <button
                      onClick={() => setWorldEdits({})}
                      className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
                    >
                      Reset
                    </button>
                    {feedback?.key === "world-rates" && (
                      <span
                        className={`text-xs font-medium ${
                          feedback.type === "success"
                            ? "text-accent-green"
                            : "text-accent-red"
                        }`}
                      >
                        {feedback.type === "success"
                          ? "Rates updated!"
                          : "Failed to update"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {worlds.length === 0 && (
          <p className="text-sm text-text-muted">No worlds configured.</p>
        )}
      </CollapsibleSection>

      {/* ── Feature Flags ──────────────────────────────────────── */}
      <CollapsibleSection title="Feature Flags" icon="🎛️">
        <div className="space-y-6">
          {flagGroups.map((group) => (
            <div key={group.label}>
              <h4
                className={`mb-3 text-xs font-bold tracking-wider uppercase ${group.color}`}
              >
                {group.label}
              </h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group.keys.map((key) => {
                  const val = server[key] as boolean;
                  const isSaving = savingKeys.has(key);
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary px-3.5 py-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-xs font-medium text-text-primary">
                          {key}
                        </span>
                        {feedback?.key === key && (
                          <span
                            className={`shrink-0 text-[10px] font-bold ${
                              feedback.type === "success"
                                ? "text-accent-green"
                                : "text-accent-red"
                            }`}
                          >
                            {feedback.type === "success" ? "Saved" : "Error"}
                          </span>
                        )}
                      </div>
                      <Toggle
                        checked={val}
                        onChange={(v) => handleToggle(key, v)}
                        disabled={isSaving}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* ── Login Settings ─────────────────────────────────────── */}
      <CollapsibleSection title="Login Settings" icon="🔐">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {loginKeys.map((key) => {
            const val = server[key];
            const isSaving = savingKeys.has(key);

            if (typeof val === "boolean") {
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary px-3.5 py-2.5"
                >
                  <span className="text-xs font-medium text-text-primary">
                    {key}
                  </span>
                  <Toggle
                    checked={val}
                    onChange={(v) => handleToggle(key, v)}
                    disabled={isSaving}
                  />
                </div>
              );
            }

            // Numeric (e.g. expiration values)
            const editVal =
              numericEdits[key] ?? String(val);
            return (
              <div
                key={key}
                className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3.5 py-2.5"
              >
                <span className="flex-1 truncate text-xs font-medium text-text-primary">
                  {key}
                </span>
                <input
                  type="number"
                  value={editVal}
                  onChange={(e) =>
                    setNumericEdits((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  className="w-24 rounded-md border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-blue"
                />
                <button
                  onClick={() => handleNumericSave(key)}
                  disabled={isSaving}
                  className="rounded-md border border-accent-blue/30 bg-accent-blue/10 px-2.5 py-1 text-[10px] font-semibold text-accent-blue hover:bg-accent-blue/20 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* ── Server Settings (Numeric) ──────────────────────────── */}
      <CollapsibleSection title="Server Settings" icon="🔧" defaultOpen={false}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {numericKeys.sort().map((key) => {
            const current = server[key] as number;
            const editVal =
              numericEdits[key] ?? String(current);
            const isSaving = savingKeys.has(key);

            return (
              <div
                key={key}
                className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3.5 py-2.5"
              >
                <span className="flex-1 truncate text-xs font-medium text-text-primary">
                  {key}
                </span>
                <input
                  type="number"
                  value={editVal}
                  onChange={(e) =>
                    setNumericEdits((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  className="w-24 rounded-md border border-border bg-bg-primary px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-blue"
                />
                <button
                  onClick={() => handleNumericSave(key)}
                  disabled={isSaving}
                  className="rounded-md border border-accent-blue/30 bg-accent-blue/10 px-2.5 py-1 text-[10px] font-semibold text-accent-blue hover:bg-accent-blue/20 disabled:opacity-50"
                >
                  {isSaving ? "..." : "Save"}
                </button>
                {feedback?.key === key && (
                  <span
                    className={`text-[10px] font-bold ${
                      feedback.type === "success"
                        ? "text-accent-green"
                        : "text-accent-red"
                    }`}
                  >
                    {feedback.type === "success" ? "OK" : "Err"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* ── Server Management ──────────────────────────────────── */}
      <CollapsibleSection title="Server Management" icon="🖥️" defaultOpen={false}>
        <ServerControls />
      </CollapsibleSection>
    </div>
  );
}
