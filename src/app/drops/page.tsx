"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import SpriteImage from "@/components/SpriteImage";

/* ── types ──────────────────────────────────────────────────────── */

interface Mob {
  id: number;
  name: string;
}

interface Item {
  id: number;
  name: string;
  category: string;
}

interface Drop {
  id: number;
  dropperid: number;
  itemid: number;
  minimum_quantity: number;
  maximum_quantity: number;
  chance: number;
}

/* ── constants ──────────────────────────────────────────────────── */

const CHANCE_MAX = 1_000_000; // 1,000,000 = 100%

function chanceToPercent(chance: number): string {
  return ((chance / CHANCE_MAX) * 100).toFixed(4);
}

function percentToChance(percent: number): number {
  return Math.round((percent / 100) * CHANCE_MAX);
}

/* ── Inline editable cell ─────────────────────────────────────── */

function EditableCell({
  value,
  suffix,
  onSave,
  min,
  max,
  step,
  className,
}: {
  value: number;
  suffix?: string;
  onSave: (val: number) => Promise<void>;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      // Need small delay so the input is mounted
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, value]);

  const commit = async () => {
    const num = Number(draft);
    if (isNaN(num) || num === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(num);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        min={min}
        max={max}
        step={step}
        disabled={saving}
        className="w-full rounded border border-accent-blue/40 bg-bg-secondary px-1.5 py-0.5 text-sm text-text-primary outline-none focus:border-accent-blue"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-bg-card-hover ${className ?? "text-text-secondary"}`}
      title="Click to edit"
    >
      {value}{suffix}
    </button>
  );
}

/* ── main page ──────────────────────────────────────────────────── */

export default function DropsPage() {
  /* mob search */
  const [mobQuery, setMobQuery] = useState("");
  const [mobResults, setMobResults] = useState<Mob[]>([]);
  const [loadingMobs, setLoadingMobs] = useState(false);
  const [selectedMob, setSelectedMob] = useState<Mob | null>(null);
  const mobTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* drops */
  const [drops, setDrops] = useState<Drop[]>([]);
  const [loadingDrops, setLoadingDrops] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  /* add drop form */
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [addChance, setAddChance] = useState("10");
  const [addMin, setAddMin] = useState("1");
  const [addMax, setAddMax] = useState("1");
  const [adding, setAdding] = useState(false);
  const itemTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* feedback */
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  }

  /* ── mob search ──────────────────────────────────────────────── */

  function handleMobSearch(query: string) {
    setMobQuery(query);
    if (mobTimerRef.current) clearTimeout(mobTimerRef.current);
    if (!query.trim()) {
      setMobResults([]);
      return;
    }
    mobTimerRef.current = setTimeout(async () => {
      setLoadingMobs(true);
      try {
        const res = await fetch(`/api/mobs?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          setMobResults(await res.json());
        }
      } catch {
        setMobResults([]);
      } finally {
        setLoadingMobs(false);
      }
    }, 300);
  }

  /* ── fetch drops ─────────────────────────────────────────────── */

  const fetchDrops = useCallback(async (mobId: number) => {
    setLoadingDrops(true);
    try {
      const res = await fetch(`/api/drops/${mobId}`);
      if (res.ok) {
        setDrops(await res.json());
      } else {
        setDrops([]);
      }
    } catch {
      setDrops([]);
    } finally {
      setLoadingDrops(false);
    }
  }, []);

  useEffect(() => {
    if (selectedMob) fetchDrops(selectedMob.id);
  }, [selectedMob, fetchDrops]);

  /* ── select mob ──────────────────────────────────────────────── */

  function selectMob(mob: Mob) {
    setSelectedMob(mob);
    setMobResults([]);
    setMobQuery(mob.name);
  }

  /* ── update drop (inline edit) ─────────────────────────────── */

  async function handleUpdateDrop(
    itemId: number,
    field: "chance" | "minQuantity" | "maxQuantity",
    value: number
  ) {
    if (!selectedMob) return;
    try {
      const body: Record<string, number> = { itemId };
      if (field === "chance") body.chance = percentToChance(value);
      else if (field === "minQuantity") body.minQuantity = value;
      else if (field === "maxQuantity") body.maxQuantity = value;

      const res = await fetch(`/api/drops/${selectedMob.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showFeedback("success", "Drop updated");
        fetchDrops(selectedMob.id);
      } else {
        showFeedback("error", "Failed to update");
      }
    } catch {
      showFeedback("error", "Failed to update");
    }
  }

  /* ── delete drop ─────────────────────────────────────────────── */

  async function handleDeleteDrop(itemId: number) {
    if (!selectedMob) return;
    setDeletingItemId(itemId);
    try {
      const res = await fetch(`/api/drops/${selectedMob.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok) {
        showFeedback("success", "Drop removed");
        fetchDrops(selectedMob.id);
      } else {
        showFeedback("error", "Failed to remove drop");
      }
    } catch {
      showFeedback("error", "Failed to remove drop");
    } finally {
      setDeletingItemId(null);
    }
  }

  /* ── item search for add form ────────────────────────────────── */

  function handleItemSearch(query: string) {
    setItemQuery(query);
    setSelectedItem(null);
    if (itemTimerRef.current) clearTimeout(itemTimerRef.current);
    if (!query.trim()) {
      setItemResults([]);
      return;
    }
    itemTimerRef.current = setTimeout(async () => {
      setLoadingItems(true);
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          setItemResults(await res.json());
        }
      } catch {
        setItemResults([]);
      } finally {
        setLoadingItems(false);
      }
    }, 300);
  }

  /* ── add drop ────────────────────────────────────────────────── */

  async function handleAddDrop() {
    if (!selectedMob || !selectedItem) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/drops/${selectedMob.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedItem.id,
          chance: percentToChance(Number(addChance)),
          minQuantity: Number(addMin),
          maxQuantity: Number(addMax),
        }),
      });
      if (res.ok) {
        showFeedback("success", `Added ${selectedItem.name} to drop table`);
        setSelectedItem(null);
        setItemQuery("");
        setItemResults([]);
        setAddChance("10");
        setAddMin("1");
        setAddMax("1");
        fetchDrops(selectedMob.id);
      } else {
        showFeedback("error", "Failed to add drop");
      }
    } catch {
      showFeedback("error", "Failed to add drop");
    } finally {
      setAdding(false);
    }
  }

  /* ── max chance for bars ─────────────────────────────────────── */
  const maxChance = Math.max(...drops.map((d) => d.chance), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Drop Tables
          </h1>
          <p className="mt-1.5 text-text-secondary">
            Manage monster drop rates and loot tables
          </p>
        </div>
        {feedback && (
          <div
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              feedback.type === "success"
                ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
                : "border-accent-red/30 bg-accent-red/10 text-accent-red"
            }`}
          >
            {feedback.message}
          </div>
        )}
      </div>

      {/* ── Mob Search ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-text-secondary uppercase">
          Search Monster
        </h3>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-text-muted">
            🔍
          </span>
          <input
            type="text"
            value={mobQuery}
            onChange={(e) => handleMobSearch(e.target.value)}
            placeholder="Search by mob name or ID..."
            className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-3 pl-10 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(74,158,255,0.1)]"
          />
          {loadingMobs && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
            </span>
          )}
        </div>

        {/* Search results */}
        {mobResults.length > 0 && (
          <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-border bg-bg-secondary">
            {mobResults.map((mob) => (
              <button
                key={mob.id}
                onClick={() => selectMob(mob)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-card-hover"
              >
                <SpriteImage type="mob" id={mob.id} size={36} />
                <div>
                  <span className="text-sm font-medium text-text-primary">
                    {mob.name}
                  </span>
                  <span className="ml-2 text-xs text-text-muted">
                    ID: {mob.id}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Selected Mob ───────────────────────────────────────── */}
      {selectedMob && (
        <>
          {/* Mob header */}
          <div className="flex items-center gap-4 rounded-xl border border-accent-gold/20 bg-accent-gold/5 p-4">
            <SpriteImage type="mob" id={selectedMob.id} size={56} />
            <div>
              <h2 className="text-xl font-bold text-text-primary">
                {selectedMob.name}
              </h2>
              <span className="text-xs text-text-secondary">
                Mob ID: {selectedMob.id}
              </span>
            </div>
            <span className="ml-auto rounded-md bg-bg-secondary px-3 py-1 text-xs text-text-secondary">
              {drops.length} drop{drops.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ── Drop Table ───────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
            <div className="border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold tracking-wide text-text-secondary uppercase">
                Drop Table
              </h3>
            </div>

            {loadingDrops ? (
              <div className="flex h-32 items-center justify-center">
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
              </div>
            ) : drops.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-text-muted">
                No drops configured for this monster
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Header row */}
                <div className="grid grid-cols-[48px_1fr_64px_64px_100px_1fr_48px] items-center gap-3 px-5 py-2 text-[10px] font-semibold tracking-wider text-text-muted uppercase">
                  <span>Icon</span>
                  <span>Item ID</span>
                  <span>Min</span>
                  <span>Max</span>
                  <span>Chance</span>
                  <span>Rate</span>
                  <span />
                </div>

                {drops.map((drop) => {
                  const pct = Number(chanceToPercent(drop.chance));
                  const barWidth = (drop.chance / maxChance) * 100;
                  const chanceColor =
                    pct >= 50
                      ? "text-accent-green"
                      : pct >= 10
                      ? "text-accent-blue"
                      : pct >= 1
                      ? "text-accent-gold"
                      : "text-accent-red";
                  const barColor =
                    pct >= 50
                      ? "bg-accent-green/60"
                      : pct >= 10
                      ? "bg-accent-blue/60"
                      : pct >= 1
                      ? "bg-accent-gold/60"
                      : "bg-accent-red/60";

                  return (
                    <div
                      key={`${drop.itemid}-${drop.id}`}
                      className="group grid grid-cols-[48px_1fr_64px_64px_100px_1fr_48px] items-center gap-3 px-5 py-3 transition-colors hover:bg-bg-card-hover"
                    >
                      <SpriteImage type="item" id={drop.itemid} size={32} />

                      <span className="font-mono text-sm text-text-primary">
                        {drop.itemid}
                      </span>

                      <EditableCell
                        value={drop.minimum_quantity}
                        min={1}
                        step={1}
                        onSave={(val) =>
                          handleUpdateDrop(drop.itemid, "minQuantity", val)
                        }
                      />

                      <EditableCell
                        value={drop.maximum_quantity}
                        min={1}
                        step={1}
                        onSave={(val) =>
                          handleUpdateDrop(drop.itemid, "maxQuantity", val)
                        }
                      />

                      <EditableCell
                        value={Math.round(pct * 10000) / 10000}
                        suffix="%"
                        min={0.0001}
                        max={100}
                        step={0.1}
                        className={`font-semibold ${chanceColor}`}
                        onSave={(val) =>
                          handleUpdateDrop(drop.itemid, "chance", val)
                        }
                      />

                      {/* Chance bar */}
                      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-secondary">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>

                      <button
                        onClick={() => handleDeleteDrop(drop.itemid)}
                        disabled={deletingItemId === drop.itemid}
                        className="rounded-md p-1.5 text-text-muted opacity-0 transition-all hover:bg-accent-red/10 hover:text-accent-red group-hover:opacity-100 disabled:opacity-50"
                        title="Remove drop"
                      >
                        {deletingItemId === drop.itemid ? (
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent-red border-t-transparent" />
                        ) : (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Add Drop Form ────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold tracking-wide text-text-secondary uppercase">
              Add Drop
            </h3>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
              {/* Item search */}
              <div className="relative lg:col-span-2">
                <label className="mb-1 block text-xs text-text-muted">
                  Item
                </label>
                <input
                  type="text"
                  value={itemQuery}
                  onChange={(e) => handleItemSearch(e.target.value)}
                  placeholder="Search item by name..."
                  className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent-blue"
                />
                {loadingItems && (
                  <span className="absolute right-3 top-8">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent-gold border-t-transparent" />
                  </span>
                )}

                {/* Item search results */}
                {itemResults.length > 0 && !selectedItem && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-bg-card shadow-2xl">
                    {itemResults.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedItem(item);
                          setItemQuery(item.name);
                          setItemResults([]);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-card-hover"
                      >
                        <SpriteImage type="item" id={item.id} size={24} />
                        <span className="text-xs text-text-primary">
                          {item.name}
                        </span>
                        <span className="ml-auto text-[10px] text-text-muted">
                          {item.id}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedItem && (
                  <div className="mt-1.5 flex items-center gap-2 rounded-md bg-accent-blue/10 px-2.5 py-1.5">
                    <SpriteImage
                      type="item"
                      id={selectedItem.id}
                      size={20}
                    />
                    <span className="text-xs font-medium text-accent-blue">
                      {selectedItem.name}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      ({selectedItem.id})
                    </span>
                    <button
                      onClick={() => {
                        setSelectedItem(null);
                        setItemQuery("");
                      }}
                      className="ml-auto text-text-muted hover:text-accent-red"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Chance */}
              <div>
                <label className="mb-1 block text-xs text-text-muted">
                  Chance (%)
                </label>
                <input
                  type="number"
                  value={addChance}
                  onChange={(e) => setAddChance(e.target.value)}
                  min="0.0001"
                  max="100"
                  step="0.1"
                  className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-blue"
                />
              </div>

              {/* Min qty */}
              <div>
                <label className="mb-1 block text-xs text-text-muted">
                  Min Qty
                </label>
                <input
                  type="number"
                  value={addMin}
                  onChange={(e) => setAddMin(e.target.value)}
                  min="1"
                  className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-blue"
                />
              </div>

              {/* Max qty */}
              <div>
                <label className="mb-1 block text-xs text-text-muted">
                  Max Qty
                </label>
                <input
                  type="number"
                  value={addMax}
                  onChange={(e) => setAddMax(e.target.value)}
                  min="1"
                  className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent-blue"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleAddDrop}
                disabled={!selectedItem || adding}
                className="rounded-lg border border-accent-green/30 bg-accent-green/15 px-5 py-2.5 text-sm font-semibold text-accent-green transition-all hover:bg-accent-green/25 disabled:opacity-40"
              >
                {adding ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-green border-t-transparent" />
                    Adding...
                  </span>
                ) : (
                  "Add Drop"
                )}
              </button>
              {selectedItem && (
                <span className="text-xs text-text-muted">
                  {Number(addChance)}% = {percentToChance(Number(addChance)).toLocaleString()} / {CHANCE_MAX.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Empty State ────────────────────────────────────────── */}
      {!selectedMob && (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="mb-4 opacity-20"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <p className="text-sm">Search for a monster to view and edit its drop table</p>
        </div>
      )}
    </div>
  );
}
