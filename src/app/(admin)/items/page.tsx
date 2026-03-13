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
}

const CATEGORIES = [
  { key: "all", label: "All", color: "text-text-primary" },
  { key: "equip", label: "Equip", color: "text-accent-blue" },
  { key: "consume", label: "Consume", color: "text-accent-green" },
  { key: "etc", label: "Etc", color: "text-accent-purple" },
  { key: "cash", label: "Cash", color: "text-accent-orange" },
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
  const [searchTerm, setSearchTerm] = useState("");
  const router = useRouter();

  const fetchItems = useCallback(async (query: string, category: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (category !== "all") params.set("category", category);
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

  useEffect(() => { fetchItems("", "all"); }, [fetchItems]);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchTerm(value);
      fetchItems(value, activeCategory);
    },
    [activeCategory, fetchItems]
  );

  const handleCategoryChange = useCallback(
    (category: string) => {
      setActiveCategory(category);
      fetchItems(searchTerm, category);
    },
    [searchTerm, fetchItems]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Items
        </h1>
        <p className="mt-1.5 text-text-secondary">
          Browse equipment, consumables, and all item data
        </p>
      </div>

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
              <span
                className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getCategoryBadge(item.category)}`}
              >
                {item.category}
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
