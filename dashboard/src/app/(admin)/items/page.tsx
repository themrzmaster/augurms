"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import SearchInput from "@/components/SearchInput";
import SpriteImage from "@/components/SpriteImage";

interface Item {
  id: number;
  name: string;
  category: string;
  quest?: boolean;
  tradeable?: boolean;
}

const CATEGORIES = [
  { key: "all", label: "All", color: "text-text-primary" },
  { key: "equip", label: "Equip", color: "text-accent-blue" },
  { key: "consume", label: "Consume", color: "text-accent-green" },
  { key: "etc", label: "Etc", color: "text-accent-purple" },
  { key: "cash", label: "Cash", color: "text-accent-orange" },
];

const FILTERS = [
  { key: "none", label: "No filter" },
  { key: "no_quest", label: "Non-quest only" },
  { key: "quest", label: "Quest items" },
  { key: "droppable", label: "Droppable (safe for spawn_drop)" },
];

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

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: 15 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-bg-card p-4 animate-pulse">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded bg-bg-card-hover" />
            <div className="h-4 w-20 rounded bg-bg-card-hover" />
            <div className="h-3 w-14 rounded bg-bg-card-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeFilter, setActiveFilter] = useState("none");
  const [searchTerm, setSearchTerm] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const router = useRouter();

  const fetchItems = useCallback(async (query: string, category: string, filter: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (category !== "all") params.set("category", category);
      if (filter !== "none") params.set("filter", filter);
      const res = await fetch(`/api/items?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(data);
    } catch {
      setError("Could not load items. Make sure the server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems("", "all", "none"); }, [fetchItems]);

  const handlePublish = useCallback(async () => {
    if (!confirm("Publish all custom items to the game server? This will restart the server.")) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch("/api/admin/items/publish", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setPublishResult({
          success: true,
          message: `Published ${data.items_published} item(s). Server restarting with new WZ files.`,
        });
      } else {
        setPublishResult({ success: false, message: data.error || "Publish failed" });
      }
    } catch {
      setPublishResult({ success: false, message: "Network error during publish" });
    } finally {
      setPublishing(false);
    }
  }, []);

  const handleLocalPublish = useCallback(async () => {
    if (!confirm("Local publish: patch client WZ files + server XML from DB items.\nOutput goes to dashboard/test-output/.")) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch("/api/admin/items/publish-local", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setPublishResult({
          success: true,
          message: data.actions.join("\n") + "\n\n" + (data.instructions || []).join("\n"),
        });
      } else {
        setPublishResult({ success: false, message: data.error || "Local publish failed" });
      }
    } catch {
      setPublishResult({ success: false, message: "Network error" });
    } finally {
      setPublishing(false);
    }
  }, []);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchTerm(value);
      fetchItems(value, activeCategory, activeFilter);
    },
    [activeCategory, activeFilter, fetchItems]
  );

  const handleCategoryChange = useCallback(
    (category: string) => {
      setActiveCategory(category);
      fetchItems(searchTerm, category, activeFilter);
    },
    [searchTerm, activeFilter, fetchItems]
  );

  const handleFilterChange = useCallback(
    (filter: string) => {
      setActiveFilter(filter);
      fetchItems(searchTerm, activeCategory, filter);
    },
    [searchTerm, activeCategory, fetchItems]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Items
          </h1>
          <p className="mt-1.5 text-text-secondary">
            Browse equipment, consumables, and all item data
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleLocalPublish}
            disabled={publishing}
            className="rounded-lg border border-accent-green/30 bg-accent-green/10 px-4 py-2 text-sm font-semibold text-accent-green hover:bg-accent-green/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {publishing ? "Publishing..." : "Local Publish"}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-4 py-2 text-sm font-semibold text-accent-blue hover:bg-accent-blue/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {publishing ? "Publishing..." : "Publish to Server"}
          </button>
          <button
            onClick={() => router.push("/items/create")}
            className="rounded-lg bg-accent-gold px-4 py-2 text-sm font-semibold text-bg-primary hover:bg-accent-gold/90 transition-colors shadow-lg shadow-accent-gold/20"
          >
            + Create Item
          </button>
        </div>
      </div>

      {/* Publish Result */}
      {publishResult && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            publishResult.success
              ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
              : "border-accent-red/30 bg-accent-red/10 text-accent-red"
          }`}
        >
          {publishResult.message}
          <button
            onClick={() => setPublishResult(null)}
            className="ml-3 underline opacity-70 hover:opacity-100"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="space-y-4">
        <SearchInput
          placeholder="Search items by name..."
          onChange={handleSearch}
        />

        {/* Category Tabs */}
        <div className="flex gap-1 rounded-lg bg-bg-secondary p-1 border border-border">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => handleCategoryChange(cat.key)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                activeCategory === cat.key
                  ? "bg-bg-card text-text-primary shadow-sm border border-border"
                  : "text-text-secondary hover:text-text-primary border border-transparent"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Property Filters */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => handleFilterChange(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 border ${
                activeFilter === f.key
                  ? "bg-accent-gold/10 text-accent-gold border-accent-gold/30"
                  : "bg-bg-secondary text-text-muted border-border hover:text-text-primary hover:border-border-light"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4">🎒</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Error Loading Items
          </h2>
          <p className="text-text-secondary max-w-md">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && <SkeletonGrid />}

      {/* No Results */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4">📦</span>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            No Items Found
          </h2>
          <p className="text-text-secondary max-w-md">
            Try a different search term or category.
          </p>
        </div>
      )}

      {/* Item Grid */}
      {!loading && !error && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <Card
              key={item.id}
              hover
              onClick={() => router.push(`/items/${item.id}`)}
              className="group flex flex-col items-center text-center"
            >
              <SpriteImage type="item" id={item.id} size={40} className="mb-3" />
              <h3 className="text-sm font-semibold text-text-primary group-hover:text-accent-gold transition-colors duration-200 leading-tight">
                {item.name}
              </h3>
              <p className="text-xs text-text-muted mt-1">ID: {item.id}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getCategoryBadge(item.category)}`}
                >
                  {item.category}
                </span>
                {item.quest && (
                  <span className="inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-accent-red/10 text-accent-red border-accent-red/20">
                    Quest
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
