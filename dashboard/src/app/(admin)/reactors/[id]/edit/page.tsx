"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Card from "@/components/Card";

const ANIMATION_STYLES = [
  { value: "breakable", label: "Breakable", desc: "Shakes on hit, splits apart on break" },
  { value: "collectible", label: "Collectible", desc: "Glows on hit, shrinks and floats up" },
  { value: "pulsing", label: "Pulsing", desc: "Flashes on hit, expands outward on break" },
];

const EVENT_TYPES = [
  { value: 0, label: "Click/Hit" },
  { value: 100, label: "Item Triggered" },
  { value: 101, label: "Timed" },
];

const SCRIPT_TEMPLATES = [
  { value: "drop_items", label: "Drop Items" },
  { value: "drop_items_meso", label: "Drop Items + Meso" },
  { value: "spawn_monster", label: "Spawn Monster" },
];

interface Drop {
  itemid: number;
  chance: number;
  questid: number;
}

export default function EditReactorPage() {
  const router = useRouter();
  const params = useParams();
  const reactorId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [animationStyle, setAnimationStyle] = useState("breakable");
  const [eventType, setEventType] = useState(0);
  const [hitsToBreak, setHitsToBreak] = useState(3);
  const [scriptTemplate, setScriptTemplate] = useState("drop_items");
  const [hitDelay, setHitDelay] = useState(120);
  const [breakDelay, setBreakDelay] = useState(150);
  const [triggerItemId, setTriggerItemId] = useState("");
  const [triggerItemQty, setTriggerItemQty] = useState(1);
  const [timeoutMs, setTimeoutMs] = useState(3000);

  // Drops
  const [drops, setDrops] = useState<{ itemid: number; chance: number; questid: number }[]>([]);
  const [dropItemSearch, setDropItemSearch] = useState("");
  const [dropSearchResults, setDropSearchResults] = useState<any[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);

  // Load reactor data
  useEffect(() => {
    fetch(`/api/admin/reactors/${reactorId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        setName(data.name || "");
        setAnimationStyle(data.animation_style || "breakable");
        setEventType(data.event_type ?? 0);
        setHitsToBreak(data.hits_to_break ?? 3);
        setScriptTemplate(data.script_template || "drop_items");
        setHitDelay(data.hit_delay ?? 120);
        setBreakDelay(data.break_delay ?? 150);
        setTriggerItemId(data.trigger_item_id ? String(data.trigger_item_id) : "");
        setTriggerItemQty(data.trigger_item_qty ?? 1);
        setTimeoutMs(data.timeout_ms ?? 3000);
        // Convert drops: DB stores inverse chance, convert back to percentage
        if (data.drops) {
          setDrops(
            data.drops.map((d: any) => ({
              itemid: d.itemid,
              chance: Math.max(1, Math.round(100 / (d.chance || 1))),
              questid: d.questid ?? -1,
            }))
          );
        }
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [reactorId]);

  // Item search
  useEffect(() => {
    if (dropItemSearch.length < 2) { setDropSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchingItems(true);
      try {
        const res = await fetch(`/api/items?q=${encodeURIComponent(dropItemSearch)}&limit=10`);
        const data = await res.json();
        setDropSearchResults(Array.isArray(data) ? data : data.items || []);
      } catch { setDropSearchResults([]); }
      setSearchingItems(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [dropItemSearch]);

  function addDrop(itemId: number) {
    if (drops.some((d) => d.itemid === itemId)) return;
    setDrops((prev) => [...prev, { itemid: itemId, chance: 50, questid: -1 }]);
    setDropItemSearch("");
    setDropSearchResults([]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/reactors/${reactorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          event_type: eventType,
          hits_to_break: hitsToBreak,
          animation_style: animationStyle,
          script_template: scriptTemplate,
          hit_delay: hitDelay,
          break_delay: breakDelay,
          trigger_item_id: eventType === 100 && triggerItemId ? parseInt(triggerItemId) : null,
          trigger_item_qty: triggerItemQty,
          timeout_ms: eventType === 101 ? timeoutMs : null,
          drops: drops.map((d) => ({ itemid: d.itemid, chance: d.chance, questid: d.questid })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save"); setSaving(false); return; }
      setSuccess("Saved! Restart game server to apply changes.");
      setSaving(false);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-text-secondary">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">
          Edit Reactor {reactorId}
        </h1>
        <button
          onClick={() => router.push("/reactors")}
          className="text-sm text-text-muted hover:text-text-secondary"
        >
          Back to list
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-accent-red/30 bg-accent-red/10 p-3 text-sm text-accent-red">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-accent-green/30 bg-accent-green/10 p-3 text-sm text-accent-green">
          {success}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Basic Info */}
          <Card title="Basic Info">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Hits to Break</label>
                <input
                  type="range"
                  min={1} max={5}
                  value={hitsToBreak}
                  onChange={(e) => setHitsToBreak(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-text-muted">
                  <span>1</span>
                  <span className="font-semibold text-text-primary">{hitsToBreak} hit{hitsToBreak !== 1 ? "s" : ""}</span>
                  <span>5</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Animation Style */}
          <Card title="Animation Style">
            <div className="space-y-2">
              {ANIMATION_STYLES.map((s) => (
                <label key={s.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${animationStyle === s.value ? "border-accent-blue bg-accent-blue/10" : "border-border hover:border-border-light"}`}>
                  <input type="radio" name="style" value={s.value} checked={animationStyle === s.value} onChange={(e) => setAnimationStyle(e.target.value)} className="mt-1" />
                  <div>
                    <div className="text-sm font-medium text-text-primary">{s.label}</div>
                    <div className="text-xs text-text-muted">{s.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </Card>

          {/* Trigger Type */}
          <Card title="Trigger Type">
            <div className="space-y-2">
              {EVENT_TYPES.map((et) => (
                <label key={et.value} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${eventType === et.value ? "border-accent-blue bg-accent-blue/10" : "border-border hover:border-border-light"}`}>
                  <input type="radio" name="event" value={et.value} checked={eventType === et.value} onChange={(e) => setEventType(parseInt(e.target.value))} />
                  <span className="text-sm text-text-primary">{et.label}</span>
                </label>
              ))}
            </div>
            {eventType === 100 && (
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Trigger Item ID</label>
                  <input type="number" value={triggerItemId} onChange={(e) => setTriggerItemId(e.target.value)} className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Quantity</label>
                  <input type="number" min={1} max={99} value={triggerItemQty} onChange={(e) => setTriggerItemQty(parseInt(e.target.value) || 1)} className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none" />
                </div>
              </div>
            )}
            {eventType === 101 && (
              <div className="mt-4 border-t border-border pt-4">
                <label className="mb-1 block text-sm text-text-secondary">Timeout (ms)</label>
                <input type="number" min={500} max={60000} step={500} value={timeoutMs} onChange={(e) => setTimeoutMs(parseInt(e.target.value) || 3000)} className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none" />
              </div>
            )}
          </Card>

          {/* Script */}
          <Card title="On Break Script">
            <div className="space-y-2">
              {SCRIPT_TEMPLATES.map((t) => (
                <label key={t.value} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${scriptTemplate === t.value ? "border-accent-blue bg-accent-blue/10" : "border-border hover:border-border-light"}`}>
                  <input type="radio" name="script" value={t.value} checked={scriptTemplate === t.value} onChange={(e) => setScriptTemplate(e.target.value)} />
                  <span className="text-sm text-text-primary">{t.label}</span>
                </label>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Drops */}
          <Card title="Item Drops">
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={dropItemSearch}
                  onChange={(e) => setDropItemSearch(e.target.value)}
                  placeholder="Search items by name or ID..."
                  className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                />
                {dropSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-bg-card shadow-lg">
                    {dropSearchResults.map((item: any) => (
                      <button
                        key={item.itemid ?? item.id}
                        type="button"
                        onClick={() => addDrop(item.itemid ?? item.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg-dark transition-colors"
                      >
                        <span className="text-text-muted text-xs">{item.itemid ?? item.id}</span>
                        <span className="text-text-primary">{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchingItems && <span className="absolute right-3 top-2.5 text-xs text-text-muted">Searching...</span>}
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  id="manualItemId"
                  placeholder="Item ID"
                  className="flex-1 rounded-lg border border-border bg-bg-dark px-3 py-1.5 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById("manualItemId") as HTMLInputElement;
                    if (input?.value) { addDrop(parseInt(input.value)); input.value = ""; }
                  }}
                  className="rounded-lg bg-bg-dark px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  + Add
                </button>
              </div>

              {drops.length === 0 ? (
                <p className="text-xs text-text-muted py-2">No drops configured.</p>
              ) : (
                <div className="space-y-2">
                  {drops.map((drop) => (
                    <div key={drop.itemid} className="flex items-center gap-3 rounded-lg border border-border bg-bg-dark p-2">
                      <span className="flex-1 text-sm text-text-primary">Item #{drop.itemid}</span>
                      <input
                        type="number"
                        min={1} max={100}
                        value={drop.chance}
                        onChange={(e) => setDrops((prev) => prev.map((d) => d.itemid === drop.itemid ? { ...d, chance: parseInt(e.target.value) || 50 } : d))}
                        className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-sm text-text-primary text-center focus:border-accent-blue focus:outline-none"
                      />
                      <span className="text-xs text-text-muted">%</span>
                      <button
                        type="button"
                        onClick={() => setDrops((prev) => prev.filter((d) => d.itemid !== drop.itemid))}
                        className="text-text-muted hover:text-accent-red transition-colors text-xs"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Timing */}
          <Card title="Animation Timing">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Hit Delay (ms)</label>
                <input type="number" min={50} max={500} step={10} value={hitDelay} onChange={(e) => setHitDelay(parseInt(e.target.value) || 120)} className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Break Delay (ms)</label>
                <input type="number" min={50} max={500} step={10} value={breakDelay} onChange={(e) => setBreakDelay(parseInt(e.target.value) || 150)} className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none" />
              </div>
            </div>
          </Card>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || !name}
            className="w-full rounded-lg bg-accent-blue px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/80 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <p className="text-xs text-text-muted text-center">
            Updates server XML + script. Rebuild client WZ from the reactor list to apply visual changes.
          </p>
        </div>
      </div>
    </div>
  );
}
