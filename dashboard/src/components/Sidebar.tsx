"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

type NavItem = { href: string; label: string; icon: string };
type NavSection = { title: string; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "🏠" }],
  },
  {
    title: "Players",
    items: [
      { href: "/accounts", label: "Accounts", icon: "👤" },
      { href: "/characters", label: "Characters", icon: "⚔️" },
      { href: "/cheats", label: "Cheat Flags", icon: "🚩" },
      { href: "/ban-judge", label: "Ban Judge", icon: "⚖️" },
    ],
  },
  {
    title: "World",
    items: [
      { href: "/maps", label: "Maps", icon: "🗺️" },
      { href: "/worldmap", label: "World Map", icon: "🌏" },
      { href: "/mobs", label: "Mobs", icon: "👾" },
      { href: "/items", label: "Items", icon: "🎒" },
      { href: "/assets", label: "Custom Assets", icon: "💇" },
      { href: "/reactors", label: "Reactors", icon: "💥" },
      { href: "/drops", label: "Drops", icon: "💎" },
      { href: "/scripts", label: "Scripts", icon: "📜" },
      { href: "/wz", label: "Raw WZ Upload", icon: "📦" },
      { href: "/explorer", label: "WZ Explorer", icon: "🔍" },
    ],
  },
  {
    title: "AI",
    items: [
      { href: "/gamemaster", label: "Game Master", icon: "🧠" },
      { href: "/augur", label: "Augur NPC", icon: "🔮" },
      { href: "/items/generated", label: "AI Items", icon: "✨" },
    ],
  },
  {
    title: "Operations",
    items: [
      { href: "/config", label: "Config", icon: "⚙️" },
      { href: "/events", label: "Events", icon: "🎉" },
      { href: "/tracking", label: "Tracking", icon: "📊" },
      { href: "/users", label: "Admin Users", icon: "🔑" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  // Pick the single most-specific match so /items/generated lights up
  // AI Items and not also Items.
  const activeHref = useMemo(() => {
    let best = "";
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (pathname === item.href || pathname.startsWith(item.href + "/")) {
          if (item.href.length > best.length) best = item.href;
        }
      }
    }
    return best;
  }, [pathname]);

  return (
    <aside className="fixed top-0 left-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-bg-secondary/80 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4">
        <Image src="/logo.png" alt="AugurMS" width={36} height={36} className="drop-shadow-[0_0_8px_rgba(245,197,66,0.3)]" />
        <span className="text-lg font-bold tracking-wide text-text-primary">
          AugurMS
        </span>
      </div>

      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border-light to-transparent" />

      {/* Navigation */}
      <nav className="mt-3 flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section, sectionIdx) => (
          <div key={section.title} className={sectionIdx > 0 ? "mt-4" : ""}>
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted/70">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const isActive = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-accent-gold/10 text-accent-gold shadow-[inset_0_0_0_1px_rgba(245,197,66,0.15)]"
                        : "text-text-secondary hover:bg-bg-card hover:text-text-primary"
                    }`}
                  >
                    <span
                      className={`text-base transition-transform duration-200 group-hover:scale-110 ${
                        isActive ? "drop-shadow-[0_0_6px_rgba(245,197,66,0.3)]" : ""
                      }`}
                    >
                      {item.icon}
                    </span>
                    {item.label}
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-gold shadow-[0_0_6px_rgba(245,197,66,0.5)]" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border-light to-transparent" />

      {/* Server Status */}
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-50" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-green shadow-[0_0_8px_rgba(66,211,146,0.4)]" />
        </span>
        <span className="text-xs font-medium text-text-secondary">Server Online</span>
      </div>
    </aside>
  );
}
