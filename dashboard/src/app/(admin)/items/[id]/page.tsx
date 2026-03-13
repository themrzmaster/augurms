"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/components/Card";
import SpriteImage from "@/components/SpriteImage";

interface ItemDetail {
  id: number;
  name: string;
  description: string;
  category: string;
  stats: Record<string, number | string>;
}

const STAT_LABELS: Record<string, string> = {
  reqLevel: "Required Level",
  reqSTR: "Required STR",
  reqDEX: "Required DEX",
  reqINT: "Required INT",
  reqLUK: "Required LUK",
  incSTR: "STR",
  incDEX: "DEX",
  incINT: "INT",
  incLUK: "LUK",
  incMHP: "Max HP",
  incMMP: "Max MP",
  incPAD: "Weapon Attack",
  incMAD: "Magic Attack",
  incPDD: "Weapon Defense",
  incMDD: "Magic Defense",
  incACC: "Accuracy",
  incEVA: "Avoidability",
  incSpeed: "Speed",
  incJump: "Jump",
  tuc: "Upgrade Slots",
  price: "Price",
  hp: "HP Recovery",
  mp: "MP Recovery",
  hpR: "HP %",
  mpR: "MP %",
  time: "Duration",
  quest: "Quest Item",
};

function getStatColor(key: string): string {
  if (key.startsWith("req")) return "text-accent-orange";
  if (key.startsWith("inc")) return "text-accent-green";
  if (key === "hp" || key === "hpR" || key.includes("HP")) return "text-accent-red";
  if (key === "mp" || key === "mpR" || key.includes("MP")) return "text-accent-blue";
  return "text-text-secondary";
}

function getCategoryBadge(category: string) {
  switch (category) {
    case "equip":
      return "bg-accent-blue/10 text-accent-blue border-accent-blue/20";
    case "consume":
      return "bg-accent-green/10 text-accent-green border-accent-green/20";
    case "etc":
      return "bg-accent-purple/10 text-accent-purple border-accent-purple/20";
    case "cash":
      return "bg-accent-orange/10 text-accent-orange border-accent-orange/20";
    case "setup":
      return "bg-accent-gold/10 text-accent-gold border-accent-gold/20";
    default:
      return "bg-text-muted/10 text-text-muted border-text-muted/20";
  }
}

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [charInput, setCharInput] = useState("");
  const [giveQty, setGiveQty] = useState(1);
  const [giving, setGiving] = useState(false);
  const [giveResult, setGiveResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    async function fetchItem() {
      try {
        const res = await fetch(`/api/items/${id}`);
        if (!res.ok) throw new Error("Failed to fetch item");
        const data = await res.json();
        setItem(data);
      } catch {
        setError("Could not load item data.");
      } finally {
        setLoading(false);
      }
    }
    fetchItem();
  }, [id]);

  const copyId = async () => {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(String(item.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const handleGive = useCallback(async () => {
    if (!item || !charInput.trim()) return;
    setGiving(true);
    setGiveResult(null);
    try {
      // If input is a number, use it as character ID directly; otherwise look up by name
      const isId = /^\d+$/.test(charInput.trim());
      let charId: number;

      if (isId) {
        charId = parseInt(charInput.trim());
      } else {
        const searchRes = await fetch(`/api/characters?q=${encodeURIComponent(charInput.trim())}`);
        if (!searchRes.ok) throw new Error("Character search failed");
        const chars = await searchRes.json();
        if (!chars.length) {
          setGiveResult({ ok: false, msg: `No character found matching "${charInput.trim()}"` });
          return;
        }
        charId = chars[0].id;
      }

      const res = await fetch(`/api/characters/${charId}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, quantity: giveQty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to give item");
      setGiveResult({ ok: true, msg: data.message });
      setCharInput("");
      setGiveQty(1);
    } catch (err: any) {
      setGiveResult({ ok: false, msg: err.message });
    } finally {
      setGiving(false);
    }
  }, [item, charInput, giveQty]);

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-32 rounded bg-bg-card-hover animate-pulse" />
        <div className="rounded-xl border border-border bg-bg-card p-8 animate-pulse">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-lg bg-bg-card-hover" />
            <div className="space-y-3 flex-1">
              <div className="h-7 w-48 rounded bg-bg-card-hover" />
              <div className="h-4 w-64 rounded bg-bg-card-hover" />
              <div className="h-5 w-16 rounded bg-bg-card-hover" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-bg-card p-6 animate-pulse">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-full rounded bg-bg-card-hover" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !item) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => router.push("/items")}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <span>&larr;</span> Back to Items
        </button>
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4">📦</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Item Not Found
          </h2>
          <p className="text-text-secondary">{error || "This item does not exist."}</p>
        </div>
      </div>
    );
  }

  // Separate stats into groups
  const requirementStats = Object.entries(item.stats || {}).filter(([k]) => k.startsWith("req"));
  const bonusStats = Object.entries(item.stats || {}).filter(([k]) => k.startsWith("inc"));
  const otherStats = Object.entries(item.stats || {}).filter(
    ([k]) => !k.startsWith("req") && !k.startsWith("inc")
  );

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => router.push("/items")}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <span>&larr;</span> Back to Items
      </button>

      {/* Item Header */}
      <div className="rounded-xl border border-border bg-bg-card p-6 shadow-[0_0_30px_rgba(42,42,69,0.2)]">
        <div className="flex items-start gap-6">
          <div className="shrink-0 rounded-lg border border-border bg-bg-primary p-3">
            <SpriteImage type="item" id={item.id} size={64} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-text-primary">{item.name}</h1>
            {item.description && (
              <p className="mt-1.5 text-sm text-text-secondary leading-relaxed">
                {item.description}
              </p>
            )}
            <div className="mt-3 flex items-center gap-3">
              <span
                className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${getCategoryBadge(item.category)}`}
              >
                {item.category}
              </span>
              <button
                onClick={copyId}
                className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-2.5 py-1 text-xs text-text-muted hover:text-text-primary hover:border-border-light transition-colors"
              >
                {copied ? "Copied!" : `ID: ${item.id}`}
                <span className="text-text-muted">{copied ? "✓" : "📋"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bonus Stats */}
        {bonusStats.length > 0 && (
          <Card title="Bonuses">
            <div className="space-y-2.5">
              {bonusStats.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    {STAT_LABELS[key] || key}
                  </span>
                  <span className="text-sm font-semibold text-accent-green">
                    +{typeof value === "number" ? value.toLocaleString() : value}
                  </span>
                </div>
              ))}
            </div>

            {/* Visual bars for bonus stats */}
            <div className="mt-4 space-y-2">
              {bonusStats.map(([key, value]) => {
                const numVal = typeof value === "number" ? value : 0;
                const maxVal = key.includes("PAD") || key.includes("MAD") ? 200 : 100;
                return (
                  <div key={`bar-${key}`}>
                    <div className="h-1.5 w-full rounded-full bg-bg-primary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent-green transition-all duration-500"
                        style={{ width: `${Math.min((numVal / maxVal) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Requirements */}
        {requirementStats.length > 0 && (
          <Card title="Requirements">
            <div className="space-y-2.5">
              {requirementStats.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    {STAT_LABELS[key] || key}
                  </span>
                  <span className="text-sm font-semibold text-accent-orange">
                    {typeof value === "number" ? value.toLocaleString() : value}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Other Stats */}
        {otherStats.length > 0 && (
          <Card title="Properties">
            <div className="space-y-2.5">
              {otherStats.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">
                    {STAT_LABELS[key] || key}
                  </span>
                  <span className={`text-sm font-semibold ${getStatColor(key)}`}>
                    {typeof value === "number" ? value.toLocaleString() : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* No stats at all */}
        {bonusStats.length === 0 && requirementStats.length === 0 && otherStats.length === 0 && (
          <Card title="Properties">
            <p className="text-sm text-text-muted">No stat data available for this item.</p>
          </Card>
        )}

        {/* Give to Character */}
        <Card title="Give to Character">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">
                Character Name or ID
              </label>
              <input
                type="text"
                value={charInput}
                onChange={(e) => setCharInput(e.target.value)}
                placeholder="Enter character name or ID..."
                className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors duration-200 focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(74,158,255,0.1)]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-muted mb-1 block">
                Quantity
              </label>
              <input
                type="number"
                value={giveQty}
                onChange={(e) => setGiveQty(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                className="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2.5 text-sm text-text-primary outline-none transition-colors duration-200 focus:border-accent-blue focus:shadow-[0_0_0_2px_rgba(74,158,255,0.1)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <button
              onClick={handleGive}
              disabled={giving || !charInput.trim()}
              className="w-full rounded-lg bg-accent-green px-4 py-2.5 text-sm font-semibold text-bg-primary transition-all duration-200 hover:bg-accent-green/80 hover:shadow-[0_0_20px_rgba(66,211,146,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {giving ? "Giving..." : "Give Item"}
            </button>
            {giveResult && (
              <p className={`text-xs font-medium ${giveResult.ok ? "text-accent-green" : "text-accent-red"}`}>
                {giveResult.msg}
              </p>
            )}
            <p className="text-xs text-text-muted">
              Item will be added to the character&apos;s inventory.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
