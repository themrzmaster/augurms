"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/maps", label: "Maps", icon: "🗺️" },
  { href: "/accounts", label: "Accounts", icon: "👤" },
  { href: "/characters", label: "Characters", icon: "⚔️" },
  { href: "/items", label: "Items", icon: "🎒" },
  { href: "/mobs", label: "Mobs", icon: "👾" },
  { href: "/config", label: "Config", icon: "⚙️" },
  { href: "/scripts", label: "Scripts", icon: "📜" },
  { href: "/drops", label: "Drops", icon: "💎" },
  { href: "/gamemaster", label: "Game Master", icon: "🧠" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-bg-secondary/80 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4">
        <Image src="/logo.png" alt="AugurMS" width={36} height={36} className="drop-shadow-[0_0_8px_rgba(245,197,66,0.3)]" />
        <span className="text-lg font-bold tracking-wide text-text-primary">
          AugurMS
        </span>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border-light to-transparent" />

      {/* Navigation */}
      <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
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
      </nav>

      {/* Divider */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-border-light to-transparent" />

      {/* Server Status */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-50" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-green shadow-[0_0_8px_rgba(66,211,146,0.4)]" />
        </span>
        <span className="text-xs font-medium text-text-secondary">Server Online</span>
      </div>
    </aside>
  );
}
