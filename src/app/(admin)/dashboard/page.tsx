import Link from "next/link";
import Card from "@/components/Card";

const STAT_CARDS = [
  {
    label: "Total Characters",
    value: "—",
    icon: "⚔️",
    color: "text-accent-blue",
    glow: "shadow-[0_0_20px_rgba(74,158,255,0.08)]",
  },
  {
    label: "Total Accounts",
    value: "—",
    icon: "👥",
    color: "text-accent-purple",
    glow: "shadow-[0_0_20px_rgba(167,139,250,0.08)]",
  },
  {
    label: "Server Status",
    value: "Online",
    icon: "🟢",
    color: "text-accent-green",
    glow: "shadow-[0_0_20px_rgba(66,211,146,0.08)]",
  },
  {
    label: "Current Rates",
    value: "1x / 1x / 1x",
    icon: "⚡",
    color: "text-accent-gold",
    glow: "shadow-[0_0_20px_rgba(245,197,66,0.08)]",
  },
];

const QUICK_LINKS = [
  {
    href: "/maps",
    label: "Maps",
    icon: "🗺️",
    description: "Browse and search all game maps, spawns, and portals",
    borderColor: "hover:border-accent-blue/40",
  },
  {
    href: "/characters",
    label: "Characters",
    icon: "⚔️",
    description: "View player characters, stats, inventories, and skills",
    borderColor: "hover:border-accent-purple/40",
  },
  {
    href: "/items",
    label: "Items",
    icon: "🎒",
    description: "Search equipment, consumables, and all item data",
    borderColor: "hover:border-accent-green/40",
  },
  {
    href: "/mobs",
    label: "Mobs",
    icon: "👾",
    description: "Monster database with stats, drops, and spawn info",
    borderColor: "hover:border-accent-red/40",
  },
  {
    href: "/config",
    label: "Config",
    icon: "⚙️",
    description: "Server configuration, rates, and global settings",
    borderColor: "hover:border-accent-gold/40",
  },
  {
    href: "/scripts",
    label: "Scripts",
    icon: "📜",
    description: "NPC, portal, quest, and event script editor",
    borderColor: "hover:border-accent-orange/40",
  },
  {
    href: "/drops",
    label: "Drops",
    icon: "💎",
    description: "Drop tables, global drops, and loot configuration",
    borderColor: "hover:border-accent-blue/40",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Cosmic Dashboard
        </h1>
        <p className="mt-1.5 text-text-secondary">
          MapleStory v83 server administration panel
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-xl border border-border bg-bg-card p-5 ${stat.glow}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider text-text-muted uppercase">
                {stat.label}
              </span>
              <span className="text-lg">{stat.icon}</span>
            </div>
            <p className={`mt-3 text-2xl font-bold ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-text-primary">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="group">
              <div
                className={`h-full rounded-xl border border-border bg-bg-card p-5 transition-all duration-200 group-hover:bg-bg-card-hover group-hover:shadow-[0_0_30px_rgba(42,42,69,0.4)] ${link.borderColor}`}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl transition-transform duration-200 group-hover:scale-110">
                    {link.icon}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-text-primary group-hover:text-accent-gold transition-colors duration-200">
                      {link.label}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                      {link.description}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-border-light to-transparent" />
    </div>
  );
}
