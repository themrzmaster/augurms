"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";

const ANIMATION_STYLES = [
  { value: "breakable", label: "Breakable", desc: "Shakes on hit, splits apart on break (chests, boxes)" },
  { value: "collectible", label: "Collectible", desc: "Glows on hit, shrinks and floats up on collect (pickups)" },
  { value: "pulsing", label: "Pulsing", desc: "Flashes on hit, expands outward on break (orbs, crystals)" },
];

const EVENT_TYPES = [
  { value: 0, label: "Click/Hit", desc: "Player clicks or attacks to activate" },
  { value: 100, label: "Item Triggered", desc: "Activated when player drops a specific item on it" },
  { value: 101, label: "Timed", desc: "Auto-advances after timeout" },
];

const SCRIPT_TEMPLATES = [
  { value: "drop_items", label: "Drop Items", desc: "Drops items from reactordrops table" },
  { value: "drop_items_meso", label: "Drop Items + Meso", desc: "Drops items and meso" },
  { value: "spawn_monster", label: "Spawn Monster", desc: "Spawns a monster on break" },
];

interface PreviewFrames {
  idle: string;
  hit: string[];
  break: string[];
  width: number;
  height: number;
}

export default function CreateReactorPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [drops, setDrops] = useState<{ itemId: string; chance: number; itemName: string }[]>([]);
  const [dropItemSearch, setDropItemSearch] = useState("");
  const [dropSearchResults, setDropSearchResults] = useState<any[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);

  // File + preview
  const [idleFile, setIdleFile] = useState<File | null>(null);
  const [idlePreviewUrl, setIdlePreviewUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewFrames | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Animation player
  const [playingSequence, setPlayingSequence] = useState<"idle" | "hit" | "break" | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const animTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdleFile(file);
    setIdlePreviewUrl(URL.createObjectURL(file));
    setPreview(null);
  }, []);

  // Generate preview when file or style changes
  useEffect(() => {
    if (!idleFile) return;
    const controller = new AbortController();
    setLoadingPreview(true);

    const formData = new FormData();
    formData.append("png", idleFile);
    formData.append("style", animationStyle);

    fetch("/api/admin/reactors/preview", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          setPreview(data);
          setLoadingPreview(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadingPreview(false);
      });

    return () => controller.abort();
  }, [idleFile, animationStyle]);

  // Animation player loop
  useEffect(() => {
    if (animTimerRef.current) clearInterval(animTimerRef.current);
    if (!playingSequence || !preview) return;

    const frames = playingSequence === "idle"
      ? [preview.idle]
      : playingSequence === "hit"
        ? preview.hit
        : preview.break;

    const delay = playingSequence === "hit" ? hitDelay : playingSequence === "break" ? breakDelay : 500;

    if (frames.length <= 1) {
      setCurrentFrame(0);
      return;
    }

    let frame = 0;
    setCurrentFrame(0);
    animTimerRef.current = setInterval(() => {
      frame = (frame + 1) % frames.length;
      setCurrentFrame(frame);
      if (frame === 0) {
        // Stop after one loop
        if (animTimerRef.current) clearInterval(animTimerRef.current);
        setPlayingSequence(null);
      }
    }, delay);

    return () => {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
    };
  }, [playingSequence, preview, hitDelay, breakDelay]);

  function getDisplayFrame(): string | null {
    if (!preview) return null;
    if (!playingSequence) return preview.idle;
    const frames = playingSequence === "idle"
      ? [preview.idle]
      : playingSequence === "hit"
        ? preview.hit
        : preview.break;
    return frames[currentFrame] || preview.idle;
  }

  // Item search for drops
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

  function addDrop(itemId: string, itemName: string) {
    if (drops.some((d) => d.itemId === itemId)) return;
    setDrops((prev) => [...prev, { itemId, chance: 50, itemName }]);
    setDropItemSearch("");
    setDropSearchResults([]);
  }

  function removeDrop(itemId: string) {
    setDrops((prev) => prev.filter((d) => d.itemId !== itemId));
  }

  function updateDropChance(itemId: string, chance: number) {
    setDrops((prev) => prev.map((d) => d.itemId === itemId ? { ...d, chance } : d));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idleFile || !name) {
      setError("Name and idle sprite PNG are required");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("idlePng", idleFile);
    formData.append("animationStyle", animationStyle);
    formData.append("eventType", String(eventType));
    formData.append("hitsToBreak", String(hitsToBreak));
    formData.append("scriptTemplate", scriptTemplate);
    formData.append("hitDelay", String(hitDelay));
    formData.append("breakDelay", String(breakDelay));
    if (eventType === 100 && triggerItemId) {
      formData.append("triggerItemId", triggerItemId);
      formData.append("triggerItemQty", String(triggerItemQty));
    }
    if (eventType === 101) {
      formData.append("timeoutMs", String(timeoutMs));
    }
    if (drops.length > 0) {
      formData.append("drops", JSON.stringify(drops.map((d) => ({
        itemId: parseInt(d.itemId),
        chance: d.chance,
      }))));
    }

    try {
      const res = await fetch("/api/admin/reactors", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create reactor");
        setSaving(false);
        return;
      }
      setSuccess(`Reactor ${data.reactorId} created! ${data.actions?.join(", ") || ""}`);
      setSaving(false);
      setTimeout(() => router.push("/reactors"), 2000);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  const displayFrame = getDisplayFrame();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Create Reactor</h1>
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

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-2">
        {/* Left: Form Fields */}
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
                  placeholder="Golden Chest"
                  className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Hits to Break</label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={hitsToBreak}
                  onChange={(e) => setHitsToBreak(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-text-muted">
                  <span>1 hit</span>
                  <span className="font-semibold text-text-primary">{hitsToBreak} hit{hitsToBreak !== 1 ? "s" : ""}</span>
                  <span>5 hits</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Sprite Upload */}
          <Card title="Idle Sprite">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-accent-blue"
            >
              {idlePreviewUrl ? (
                <img
                  src={idlePreviewUrl}
                  alt="Idle sprite"
                  className="max-h-32 max-w-32 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <>
                  <span className="text-4xl mb-2">📁</span>
                  <span className="text-sm text-text-secondary">Click to upload PNG sprite</span>
                  <span className="text-xs text-text-muted mt-1">Recommended: 32-128px, transparent background</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png"
              onChange={handleFileChange}
              className="hidden"
            />
          </Card>

          {/* Animation Style */}
          <Card title="Animation Style">
            <div className="space-y-2">
              {ANIMATION_STYLES.map((style) => (
                <label
                  key={style.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    animationStyle === style.value
                      ? "border-accent-blue bg-accent-blue/10"
                      : "border-border hover:border-border-light"
                  }`}
                >
                  <input
                    type="radio"
                    name="animationStyle"
                    value={style.value}
                    checked={animationStyle === style.value}
                    onChange={(e) => setAnimationStyle(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-text-primary">{style.label}</div>
                    <div className="text-xs text-text-muted">{style.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </Card>

          {/* Event Type */}
          <Card title="Trigger Type">
            <div className="space-y-2">
              {EVENT_TYPES.map((et) => (
                <label
                  key={et.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    eventType === et.value
                      ? "border-accent-blue bg-accent-blue/10"
                      : "border-border hover:border-border-light"
                  }`}
                >
                  <input
                    type="radio"
                    name="eventType"
                    value={et.value}
                    checked={eventType === et.value}
                    onChange={(e) => setEventType(parseInt(e.target.value))}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-text-primary">{et.label}</div>
                    <div className="text-xs text-text-muted">{et.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Item trigger fields */}
            {eventType === 100 && (
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Trigger Item ID</label>
                  <input
                    type="number"
                    value={triggerItemId}
                    onChange={(e) => setTriggerItemId(e.target.value)}
                    placeholder="4031138"
                    className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-text-secondary">Quantity Required</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={triggerItemQty}
                    onChange={(e) => setTriggerItemQty(parseInt(e.target.value) || 1)}
                    className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Timed fields */}
            {eventType === 101 && (
              <div className="mt-4 border-t border-border pt-4">
                <label className="mb-1 block text-sm text-text-secondary">Timeout (ms)</label>
                <input
                  type="number"
                  min={500}
                  max={60000}
                  step={500}
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(parseInt(e.target.value) || 3000)}
                  className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                />
                <p className="mt-1 text-xs text-text-muted">{(timeoutMs / 1000).toFixed(1)}s between auto-advances</p>
              </div>
            )}
          </Card>

          {/* Script Template */}
          <Card title="On Break Script">
            <div className="space-y-2">
              {SCRIPT_TEMPLATES.map((t) => (
                <label
                  key={t.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    scriptTemplate === t.value
                      ? "border-accent-blue bg-accent-blue/10"
                      : "border-border hover:border-border-light"
                  }`}
                >
                  <input
                    type="radio"
                    name="scriptTemplate"
                    value={t.value}
                    checked={scriptTemplate === t.value}
                    onChange={(e) => setScriptTemplate(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-text-primary">{t.label}</div>
                    <div className="text-xs text-text-muted">{t.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </Card>

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
                        onClick={() => addDrop(String(item.itemid ?? item.id), item.name)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg-dark transition-colors"
                      >
                        <span className="text-text-muted text-xs">{item.itemid ?? item.id}</span>
                        <span className="text-text-primary">{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchingItems && (
                  <span className="absolute right-3 top-2.5 text-xs text-text-muted">Searching...</span>
                )}
              </div>

              {/* Manual add */}
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
                    if (input?.value) {
                      addDrop(input.value, `Item #${input.value}`);
                      input.value = "";
                    }
                  }}
                  className="rounded-lg bg-bg-dark px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  + Add by ID
                </button>
              </div>

              {/* Drop list */}
              {drops.length === 0 ? (
                <p className="text-xs text-text-muted py-2">No drops configured. Reactor will only drop meso.</p>
              ) : (
                <div className="space-y-2">
                  {drops.map((drop) => (
                    <div
                      key={drop.itemId}
                      className="flex items-center gap-3 rounded-lg border border-border bg-bg-dark p-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-primary truncate">{drop.itemName}</div>
                        <div className="text-xs text-text-muted">ID: {drop.itemId}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={drop.chance}
                          onChange={(e) => updateDropChance(drop.itemId, parseInt(e.target.value) || 50)}
                          className="w-16 rounded border border-border bg-bg-card px-2 py-1 text-sm text-text-primary text-center focus:border-accent-blue focus:outline-none"
                        />
                        <span className="text-xs text-text-muted">%</span>
                        <button
                          type="button"
                          onClick={() => removeDrop(drop.itemId)}
                          className="text-text-muted hover:text-accent-red transition-colors text-xs ml-1"
                        >
                          x
                        </button>
                      </div>
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
                <input
                  type="number"
                  min={50}
                  max={500}
                  step={10}
                  value={hitDelay}
                  onChange={(e) => setHitDelay(parseInt(e.target.value) || 120)}
                  className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-text-secondary">Break Delay (ms)</label>
                <input
                  type="number"
                  min={50}
                  max={500}
                  step={10}
                  value={breakDelay}
                  onChange={(e) => setBreakDelay(parseInt(e.target.value) || 150)}
                  className="w-full rounded-lg border border-border bg-bg-dark px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none"
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Preview + Submit */}
        <div className="space-y-6">
          {/* Animation Preview */}
          <Card title="Animation Preview">
            <div className="flex flex-col items-center gap-4">
              <div
                className="flex items-center justify-center rounded-lg bg-bg-dark"
                style={{ width: 200, height: 200 }}
              >
                {displayFrame ? (
                  <img
                    src={`data:image/png;base64,${displayFrame}`}
                    alt="Preview"
                    className="max-h-40 max-w-40 object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : idlePreviewUrl ? (
                  loadingPreview ? (
                    <span className="text-sm text-text-muted">Generating frames...</span>
                  ) : (
                    <img
                      src={idlePreviewUrl}
                      alt="Idle"
                      className="max-h-40 max-w-40 object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  )
                ) : (
                  <span className="text-sm text-text-muted">Upload a sprite to preview</span>
                )}
              </div>

              {preview && (
                <>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setPlayingSequence(null); setCurrentFrame(0); }}
                      className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                        !playingSequence ? "bg-accent-blue/20 text-accent-blue" : "bg-bg-dark text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      Idle
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlayingSequence("hit")}
                      className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                        playingSequence === "hit" ? "bg-accent-orange/20 text-accent-orange" : "bg-bg-dark text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      Play Hit ({preview.hit.length}f)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlayingSequence("break")}
                      className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                        playingSequence === "break" ? "bg-accent-red/20 text-accent-red" : "bg-bg-dark text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      Play Break ({preview.break.length}f)
                    </button>
                  </div>

                  <div className="w-full text-xs text-text-muted text-center">
                    Sprite: {preview.width}x{preview.height}px
                  </div>

                  {/* Frame strip */}
                  <div className="w-full">
                    <p className="mb-2 text-xs text-text-secondary">All Frames</p>
                    <div className="flex flex-wrap gap-2">
                      <div className="text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-bg-dark">
                          <img
                            src={`data:image/png;base64,${preview.idle}`}
                            alt="idle"
                            className="max-h-10 max-w-10 object-contain"
                            style={{ imageRendering: "pixelated" }}
                          />
                        </div>
                        <span className="text-[10px] text-text-muted">idle</span>
                      </div>
                      {preview.hit.map((f, i) => (
                        <div key={`hit-${i}`} className="text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded bg-bg-dark">
                            <img
                              src={`data:image/png;base64,${f}`}
                              alt={`hit ${i}`}
                              className="max-h-10 max-w-10 object-contain"
                              style={{ imageRendering: "pixelated" }}
                            />
                          </div>
                          <span className="text-[10px] text-accent-orange">hit {i}</span>
                        </div>
                      ))}
                      {preview.break.map((f, i) => (
                        <div key={`break-${i}`} className="text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded bg-bg-dark">
                            <img
                              src={`data:image/png;base64,${f}`}
                              alt={`break ${i}`}
                              className="max-h-10 max-w-10 object-contain"
                              style={{ imageRendering: "pixelated" }}
                            />
                          </div>
                          <span className="text-[10px] text-accent-red">brk {i}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* Summary */}
          <Card title="Summary">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Name</span>
                <span className="text-text-primary">{name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Style</span>
                <span className="text-text-primary capitalize">{animationStyle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Trigger</span>
                <span className="text-text-primary">{EVENT_TYPES.find(e => e.value === eventType)?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Hits</span>
                <span className="text-text-primary">{hitsToBreak}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Script</span>
                <span className="text-text-primary">{SCRIPT_TEMPLATES.find(s => s.value === scriptTemplate)?.label}</span>
              </div>
              {preview && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Frames</span>
                  <span className="text-text-primary">1 idle + {preview.hit.length} hit + {preview.break.length} break</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-secondary">Drops</span>
                <span className="text-text-primary">
                  {drops.length === 0 ? "Meso only" : `${drops.length} item${drops.length !== 1 ? "s" : ""}`}
                </span>
              </div>
            </div>
          </Card>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !idleFile || !name}
            className="w-full rounded-lg bg-accent-blue px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-blue/80 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Reactor"}
          </button>

          <p className="text-xs text-text-muted text-center">
            Creates server WZ XML + reactor script immediately. Use &ldquo;Publish&rdquo; on the reactor list to build client WZ.
          </p>
        </div>
      </form>
    </div>
  );
}
