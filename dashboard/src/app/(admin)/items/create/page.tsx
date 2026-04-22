"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import SpriteImage from "@/components/SpriteImage";

const SUB_CATEGORIES = [
  "Ring", "Pendant", "Face", "Eye", "Earring", "Belt", "Medal",
  "Cap", "Coat", "Longcoat", "Pants", "Shoes", "Glove", "Shield", "Cape", "Weapon",
];

const WEAPON_TYPES: Record<string, { label: string; prefix: number }> = {
  "1h-sword": { label: "One-Handed Sword", prefix: 1302 },
  "1h-axe": { label: "One-Handed Axe", prefix: 1312 },
  "1h-mace": { label: "One-Handed Mace", prefix: 1322 },
  dagger: { label: "Dagger", prefix: 1332 },
  wand: { label: "Wand", prefix: 1372 },
  staff: { label: "Staff", prefix: 1382 },
  "2h-sword": { label: "Two-Handed Sword", prefix: 1402 },
  "2h-axe": { label: "Two-Handed Axe", prefix: 1412 },
  "2h-mace": { label: "Two-Handed Mace", prefix: 1422 },
  spear: { label: "Spear", prefix: 1432 },
  polearm: { label: "Polearm", prefix: 1442 },
  bow: { label: "Bow", prefix: 1452 },
  crossbow: { label: "Crossbow", prefix: 1462 },
  claw: { label: "Claw", prefix: 1472 },
  knuckle: { label: "Knuckle", prefix: 1482 },
  gun: { label: "Gun", prefix: 1492 },
};

const ATTACK_SPEEDS = [
  { value: 2, label: "2 - Fastest" },
  { value: 3, label: "3 - Faster" },
  { value: 4, label: "4 - Fast" },
  { value: 5, label: "5 - Normal+" },
  { value: 6, label: "6 - Normal" },
  { value: 7, label: "7 - Slow" },
  { value: 8, label: "8 - Slower" },
  { value: 9, label: "9 - Slowest" },
];

const STAT_DEFS = [
  { key: "str", label: "STR", color: "text-accent-red" },
  { key: "dex", label: "DEX", color: "text-accent-green" },
  { key: "int", label: "INT", color: "text-accent-blue" },
  { key: "luk", label: "LUK", color: "text-accent-purple" },
  { key: "hp", label: "Max HP", color: "text-accent-red" },
  { key: "mp", label: "Max MP", color: "text-accent-blue" },
  { key: "watk", label: "W.ATK", color: "text-accent-orange" },
  { key: "matk", label: "M.ATK", color: "text-accent-blue" },
  { key: "wdef", label: "W.DEF", color: "text-accent-green" },
  { key: "mdef", label: "M.DEF", color: "text-accent-purple" },
  { key: "acc", label: "Accuracy", color: "text-text-secondary" },
  { key: "avoid", label: "Avoidability", color: "text-text-secondary" },
  { key: "speed", label: "Speed", color: "text-accent-gold" },
  { key: "jump", label: "Jump", color: "text-accent-gold" },
  { key: "slots", label: "Upgrade Slots", color: "text-text-secondary" },
];

const REQ_DEFS = [
  { key: "level", label: "Level" },
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "int", label: "INT" },
  { key: "luk", label: "LUK" },
];

export default function CreateItemPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [itemId, setItemId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subCategory, setSubCategory] = useState("Ring");
  const [baseItemId, setBaseItemId] = useState("");
  const [suggestedIds, setSuggestedIds] = useState<number[]>([]);
  const [idInfo, setIdInfo] = useState<string | null>(null);
  const [loadingIds, setLoadingIds] = useState(false);

  // Weapon-specific state
  const [weaponType, setWeaponType] = useState("staff");
  const [attackSpeed, setAttackSpeed] = useState(6);
  const [conceptFile, setConceptFile] = useState<File | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState("");
  const [renderResult, setRenderResult] = useState<{
    origins: Record<string, Array<{ gripX?: number; gripY?: number; x?: number; y?: number }>>;
    frames: Record<string, string[]>;
    iconUrl: string | null;
  } | null>(null);
  const conceptInputRef = useRef<HTMLInputElement>(null);

  const isWeapon = subCategory === "Weapon";

  const fetchAvailableIds = async (cat: string) => {
    setLoadingIds(true);
    try {
      const params = new URLSearchParams({ subCategory: cat, count: "5" });
      if (cat === "Weapon") params.set("weaponType", weaponType);
      const res = await fetch(`/api/admin/items/next-id?${params}`);
      const data = await res.json();
      if (data.suggested) {
        setSuggestedIds(data.suggested);
        setIdInfo(`${data.totalAvailable} available in ${data.range.start}-${data.range.end}`);
      }
    } catch { /* ignore */ }
    setLoadingIds(false);
  };

  const [stats, setStats] = useState<Record<string, number>>({});
  const [reqs, setReqs] = useState<Record<string, number>>({});
  const [flags, setFlags] = useState({
    cash: false,
    tradeBlock: false,
    only: false,
    notSale: false,
  });

  // Icon upload
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimTransparent = (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        let top = canvas.height, left = canvas.width, right = 0, bottom = 0;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const alpha = data[(y * canvas.width + x) * 4 + 3];
            if (alpha > 0) {
              if (x < left) left = x;
              if (x > right) right = x;
              if (y < top) top = y;
              if (y > bottom) bottom = y;
            }
          }
        }

        if (right < left || bottom < top) {
          resolve(file);
          return;
        }

        const trimW = right - left + 1;
        const trimH = bottom - top + 1;

        if (trimW === canvas.width && trimH === canvas.height) {
          resolve(file);
          return;
        }

        const trimmed = document.createElement("canvas");
        trimmed.width = trimW;
        trimmed.height = trimH;
        trimmed.getContext("2d")!.drawImage(canvas, left, top, trimW, trimH, 0, 0, trimW, trimH);

        trimmed.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: "image/png" }));
          } else {
            resolve(file);
          }
        }, "image/png");
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleIconSelect = async (file: File) => {
    const trimmed = await trimTransparent(file);
    setIconFile(trimmed);
    setIconPreview(URL.createObjectURL(trimmed));
    setIconUrl(null);
  };

  const uploadIcon = async (): Promise<string | null> => {
    if (!iconFile || !itemId) return iconUrl;
    if (iconUrl) return iconUrl;

    setUploading(true);
    try {
      const formData = new FormData();
      const key = `custom-items/${itemId}-icon.png`;
      const renamedFile = new File([iconFile], key, { type: "image/png" });
      formData.append("icon", renamedFile);

      const res = await fetch("/api/launcher/upload", { method: "POST", body: formData });
      const data = await res.json();
      const result = data.results?.[0];
      if (result?.success) {
        setIconUrl(result.url);
        return result.url;
      }
      throw new Error(result?.error || "Upload failed");
    } catch (err: any) {
      setError(`Icon upload failed: ${err.message}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleRenderWeapon = async () => {
    if (!conceptFile || !itemId) {
      setError("Upload a concept image and set an Item ID first.");
      return;
    }
    setRendering(true);
    setRenderProgress("Reading concept...");
    setError(null);

    try {
      const conceptDataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read concept image"));
        reader.readAsDataURL(conceptFile);
      });

      setRenderProgress("Rendering 2D sprite pipeline...");
      const res = await fetch("/api/admin/items/render-concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, concept: conceptDataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Render failed");

      setRenderResult({
        origins: data.origins,
        frames: data.frames,
        iconUrl: data.iconUrl,
      });

      if (data.iconUrl && !iconPreview) {
        setIconPreview(data.iconUrl);
        setIconUrl(data.iconUrl);
      }

      const frameCount = Object.values(data.frames as Record<string, string[]>).flat().length;
      setSuccess(`Rendered ${frameCount} frames. ${data.message}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRendering(false);
      setRenderProgress("");
    }
  };

  const setStat = (key: string, value: string) => {
    const num = parseInt(value) || 0;
    setStats((prev) => (num === 0 ? (() => { const { [key]: _, ...rest } = prev; return rest; })() : { ...prev, [key]: num }));
  };

  const setReq = (key: string, value: string) => {
    const num = parseInt(value) || 0;
    setReqs((prev) => (num === 0 ? (() => { const { [key]: _, ...rest } = prev; return rest; })() : { ...prev, [key]: num }));
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!itemId || !name) {
      setError("Item ID and name are required.");
      return;
    }

    if (isWeapon && !renderResult) {
      setError("Render weapon frames before saving. Upload a concept PNG and click 'Render Frames'.");
      return;
    }

    setSaving(true);
    try {
      // Upload icon first if present
      let uploadedIconUrl = iconUrl;
      if (iconFile && !iconUrl) {
        uploadedIconUrl = await uploadIcon();
      }

      const body: Record<string, any> = {
        item_id: parseInt(itemId),
        name,
        description,
        category: "equip",
        sub_category: subCategory,
        base_item_id: baseItemId ? parseInt(baseItemId) : null,
        icon_url: uploadedIconUrl,
        stats,
        requirements: reqs,
        flags,
      };

      // Add weapon-specific data
      if (isWeapon) {
        body.weapon_type = weaponType;
        body.attack_speed = attackSpeed;
        body.weapon_frames = renderResult
          ? { origins: renderResult.origins, frames: renderResult.frames }
          : null;
      }

      const res = await fetch("/api/admin/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create item");
        return;
      }

      setSuccess(`Item "${name}" (ID: ${itemId}) created! ${data.actions?.join(". ") || ""}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const hasStats = Object.values(stats).some((v) => v !== 0);
  const totalFrames = renderResult
    ? Object.values(renderResult.frames).flat().length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Create Custom Item
          </h1>
          <p className="mt-1.5 text-text-secondary">
            Define a new equip item with custom stats.{" "}
            {isWeapon
              ? "Upload a concept image (PNG) to generate MapleStory animation frames."
              : "Client will show the base item sprite until WZ is patched."}
          </p>
        </div>
        <button
          onClick={() => router.push("/items")}
          className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
        >
          Back to Items
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-accent-green/30 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Basic Info */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Basic Info">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Item ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={itemId}
                      onChange={(e) => setItemId(e.target.value)}
                      placeholder={isWeapon ? `e.g. ${WEAPON_TYPES[weaponType]?.prefix || 1382}900` : "e.g. 1112950"}
                      className="flex-1 rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/30"
                    />
                    <button
                      onClick={() => fetchAvailableIds(subCategory)}
                      disabled={loadingIds}
                      className="rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-2 text-xs font-medium text-accent-blue hover:bg-accent-blue/20 transition-colors whitespace-nowrap"
                    >
                      {loadingIds ? "..." : "Find IDs"}
                    </button>
                  </div>
                  {suggestedIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {suggestedIds.map((id) => (
                        <button
                          key={id}
                          onClick={() => setItemId(String(id))}
                          className={`rounded-md px-2 py-1 text-xs font-mono border transition-all ${
                            itemId === String(id)
                              ? "bg-accent-gold/10 text-accent-gold border-accent-gold/30"
                              : "bg-bg-secondary text-text-secondary border-border hover:text-text-primary hover:border-border-light"
                          }`}
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-text-muted">
                    {idInfo || (isWeapon
                      ? `${WEAPON_TYPES[weaponType]?.label || "Weapon"} IDs: ${WEAPON_TYPES[weaponType]?.prefix || 1382}000 - ${WEAPON_TYPES[weaponType]?.prefix || 1382}999`
                      : "Click 'Find IDs' to see available IDs for this category.")}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Base Item (Visual Clone)
                  </label>
                  <input
                    type="number"
                    value={baseItemId}
                    onChange={(e) => setBaseItemId(e.target.value)}
                    placeholder={isWeapon ? "Optional — frames from concept" : "e.g. 1112000"}
                    className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/30"
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    {isWeapon
                      ? "Optional fallback sprite. Concept-rendered frames take priority."
                      : "Client shows this item's sprite until WZ is patched."}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isWeapon ? "Crystal Staff of Power" : "Augur's Blessing Ring"}
                  className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={isWeapon
                    ? "A crystalline staff that channels arcane energy."
                    : "A ring blessed by the Augur, granting power to those who complete quests."}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/30 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Sub-Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {SUB_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSubCategory(cat);
                        setSuggestedIds([]);
                        setIdInfo(null);
                        if (cat !== "Weapon") {
                          setRenderResult(null);
                          setConceptFile(null);
                        }
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                        subCategory === cat
                          ? "bg-accent-gold/10 text-accent-gold border-accent-gold/30"
                          : "bg-bg-secondary text-text-muted border-border hover:text-text-primary hover:border-border-light"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Weapon Configuration — only shown when subCategory is Weapon */}
          {isWeapon && (
            <Card title="Weapon Configuration">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Weapon Type
                    </label>
                    <select
                      value={weaponType}
                      onChange={(e) => {
                        setWeaponType(e.target.value);
                        setSuggestedIds([]);
                        setIdInfo(null);
                      }}
                      className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/30"
                    >
                      {Object.entries(WEAPON_TYPES).map(([key, wt]) => (
                        <option key={key} value={key}>
                          {wt.label} ({wt.prefix}xxx)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Attack Speed
                    </label>
                    <select
                      value={attackSpeed}
                      onChange={(e) => setAttackSpeed(parseInt(e.target.value))}
                      className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/30"
                    >
                      {ATTACK_SPEEDS.map((as) => (
                        <option key={as.value} value={as.value}>
                          {as.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Concept image upload (fed into the 2D sprite pipeline) */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Concept image (PNG) — weapon pointing up on solid black bg
                  </label>
                  <input
                    ref={conceptInputRef}
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setConceptFile(file);
                        setRenderResult(null);
                      }
                    }}
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => conceptInputRef.current?.click()}
                      className="rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
                    >
                      {conceptFile ? conceptFile.name : "Choose concept.png..."}
                    </button>
                    <button
                      onClick={handleRenderWeapon}
                      disabled={!conceptFile || !itemId || rendering}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                        !conceptFile || !itemId || rendering
                          ? "bg-bg-card text-text-muted border border-border cursor-not-allowed"
                          : "bg-accent-blue text-white hover:bg-accent-blue/90"
                      }`}
                    >
                      {rendering ? "Rendering..." : "Render Frames"}
                    </button>
                  </div>
                  {rendering && (
                    <p className="mt-2 text-xs text-accent-blue animate-pulse">
                      {renderProgress || "Rendering..."}
                    </p>
                  )}
                </div>

                {/* Frame Preview */}
                {renderResult && (
                  <div>
                    <label className="block text-sm font-medium text-accent-green mb-2">
                      Rendered Frames ({totalFrames} frames)
                    </label>
                    <div className="space-y-3">
                      {Object.entries(renderResult.frames).map(([animName, urls]) => (
                        <div key={animName}>
                          <p className="text-xs font-mono text-text-muted mb-1">
                            {animName} ({urls.length} frames)
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            {urls.map((url, i) => (
                              <div
                                key={i}
                                className="rounded border border-border bg-bg-secondary p-1"
                                title={`${animName}/${i}.png`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt={`${animName} frame ${i}`}
                                  className="h-16 w-auto sprite-render"
                                  style={{ imageRendering: "pixelated" }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Stats */}
          <Card title="Stats">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {STAT_DEFS.map((stat) => (
                <div key={stat.key}>
                  <label className={`block text-xs font-medium mb-1 ${stat.color}`}>
                    {stat.label}
                  </label>
                  <input
                    type="number"
                    value={stats[stat.key] || ""}
                    onChange={(e) => setStat(stat.key, e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary text-center placeholder-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/30"
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Requirements */}
          <Card title="Requirements">
            <div className="grid grid-cols-5 gap-3">
              {REQ_DEFS.map((req) => (
                <div key={req.key}>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    {req.label}
                  </label>
                  <input
                    type="number"
                    value={reqs[req.key] || ""}
                    onChange={(e) => setReq(req.key, e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary text-center placeholder-text-muted focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/30"
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Flags */}
          <Card title="Flags">
            <div className="flex flex-wrap gap-4">
              {[
                { key: "tradeBlock" as const, label: "Untradeable" },
                { key: "only" as const, label: "One-of-a-kind" },
                { key: "notSale" as const, label: "Cannot sell to NPC" },
                { key: "cash" as const, label: "Cash item" },
              ].map((flag) => (
                <label key={flag.key} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={flags[flag.key]}
                    onChange={(e) => setFlags({ ...flags, [flag.key]: e.target.checked })}
                    className="rounded border-border bg-bg-secondary text-accent-gold focus:ring-accent-gold/30"
                  />
                  <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
                    {flag.label}
                  </span>
                </label>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column: Preview & Actions */}
        <div className="space-y-6">
          <Card title="Icon & Preview">
            <div className="flex flex-col items-center text-center space-y-4">
              {/* Icon Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleIconSelect(file);
                }}
              />

              {iconPreview ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative"
                  title="Click to change icon"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={iconPreview}
                    alt="Custom icon"
                    className="w-16 h-16 sprite-render object-contain rounded-lg border-2 border-accent-gold/30 group-hover:border-accent-gold transition-colors"
                    style={{ imageRendering: "pixelated" }}
                  />
                  {iconUrl && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent-green text-bg-primary text-[8px] flex items-center justify-center font-bold">R2</span>
                  )}
                </button>
              ) : baseItemId ? (
                <div className="relative">
                  <SpriteImage type="item" id={parseInt(baseItemId)} size={64} className="sprite-render" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 rounded-full bg-accent-gold text-bg-primary w-5 h-5 text-xs font-bold flex items-center justify-center hover:bg-accent-gold/80 transition-colors"
                    title="Upload custom icon"
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-accent-gold/50 flex flex-col items-center justify-center text-text-muted hover:text-accent-gold transition-colors cursor-pointer"
                >
                  <span className="text-lg">+</span>
                  <span className="text-[9px]">Upload PNG</span>
                </button>
              )}

              {iconFile && !iconUrl && (
                <p className="text-[10px] text-accent-orange">
                  Icon will upload on save
                </p>
              )}
              {iconUrl && (
                <p className="text-[10px] text-accent-green">
                  Uploaded to R2
                </p>
              )}
              <div>
                <h3 className="text-lg font-bold text-accent-gold">
                  {name || "Item Name"}
                </h3>
                <p className="text-xs text-text-muted mt-1">
                  {description || "No description"}
                </p>
              </div>

              <div className="w-full border-t border-border pt-3 text-left space-y-1">
                <p className="text-xs text-text-muted">
                  ID: {itemId || "\u2014"} | Type: {subCategory}
                  {isWeapon && ` (${WEAPON_TYPES[weaponType]?.label})`}
                </p>
                {isWeapon && (
                  <p className="text-xs text-accent-blue">
                    Attack Speed: {attackSpeed} | Frames: {totalFrames || "none"}
                  </p>
                )}
                {reqs.level > 0 && (
                  <p className="text-xs text-accent-orange">
                    REQ LEV: {reqs.level}
                  </p>
                )}
                {hasStats && (
                  <div className="space-y-0.5 mt-2">
                    {STAT_DEFS.filter((s) => stats[s.key]).map((s) => (
                      <p key={s.key} className={`text-xs ${s.color}`}>
                        {s.label}: +{stats[s.key]}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Item ID Ranges */}
          <Card title="ID Ranges">
            <div className="space-y-1.5 text-xs text-text-secondary">
              {isWeapon ? (
                <>
                  {Object.entries(WEAPON_TYPES).map(([key, wt]) => (
                    <p key={key} className={key === weaponType ? "text-accent-gold font-medium" : ""}>
                      <span className="text-text-primary font-medium">{wt.label}:</span> {wt.prefix}000 - {wt.prefix}999
                    </p>
                  ))}
                </>
              ) : (
                <>
                  <p><span className="text-text-primary font-medium">Rings:</span> 1112000 - 1112999</p>
                  <p><span className="text-text-primary font-medium">Pendants:</span> 1122000 - 1122999</p>
                  <p><span className="text-text-primary font-medium">Caps:</span> 1002000 - 1002999</p>
                  <p><span className="text-text-primary font-medium">Weapons:</span> 1302000 - 1492999</p>
                </>
              )}
              <p className="text-text-muted mt-2">
                Pick unused IDs near the end of a range (e.g. {isWeapon ? `${WEAPON_TYPES[weaponType]?.prefix || 1382}900+` : "1112950+"}).
              </p>
            </div>
          </Card>

          {/* Create Button */}
          <button
            onClick={handleSubmit}
            disabled={saving || !itemId || !name || (isWeapon && !renderResult)}
            className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition-all ${
              saving || !itemId || !name || (isWeapon && !renderResult)
                ? "bg-bg-card text-text-muted border border-border cursor-not-allowed"
                : "bg-accent-gold text-bg-primary hover:bg-accent-gold/90 shadow-lg shadow-accent-gold/20"
            }`}
          >
            {saving ? "Creating..." : isWeapon ? "Create Weapon" : "Create Item"}
          </button>
        </div>
      </div>

      {/* Publish to Client Section */}
      <Card title="Publish to Client">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            After creating items, use &quot;Publish to Server&quot; on the items page to push WZ changes to the game.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                const res = await fetch("/api/admin/items/export");
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "custom_items.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-sm font-medium text-accent-blue hover:bg-accent-blue/20 transition-colors"
            >
              Export Manifest JSON
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
