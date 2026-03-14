"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    characters: "—",
    accounts: "—",
    status: "—",
    rates: "—",
    players: "—",
  });

  useEffect(() => {
    fetch("/api/server")
      .then((r) => r.json())
      .then((data: any) => {
        setStats({
          characters: String(data.characters ?? "—"),
          accounts: String(data.accounts ?? "—"),
          status: data.status === "running" ? "Online" : "Offline",
          rates: `${data.rates?.exp || 1}x / ${data.rates?.drop || 1}x / ${data.rates?.meso || 1}x`,
          players: String(data.players ?? 0),
        });
      })
      .catch(() => {});
  }, []);

  const STAT_CARDS = [
    {
      label: "Total Characters",
      value: stats.characters,
      icon: "\u2694\uFE0F",
      color: "text-accent-blue",
      glow: "shadow-[0_0_20px_rgba(74,158,255,0.08)]",
    },
    {
      label: "Total Accounts",
      value: stats.accounts,
      icon: "\uD83D\uDC65",
      color: "text-accent-purple",
      glow: "shadow-[0_0_20px_rgba(167,139,250,0.08)]",
    },
    {
      label: "Server Status",
      value: stats.status,
      sub: stats.players !== "0" ? `${stats.players} online` : undefined,
      icon: stats.status === "Online" ? "\uD83D\uDFE2" : "\uD83D\uDD34",
      color: stats.status === "Online" ? "text-accent-green" : "text-accent-red",
      glow: "shadow-[0_0_20px_rgba(66,211,146,0.08)]",
    },
    {
      label: "Rates (EXP/DROP/MESO)",
      value: stats.rates,
      icon: "\u26A1",
      color: "text-accent-gold",
      glow: "shadow-[0_0_20px_rgba(245,197,66,0.08)]",
    },
  ];

  const QUICK_LINKS = [
    { href: "/accounts", label: "Accounts", icon: "\uD83D\uDC64", description: "View and manage player accounts, bans, and status", borderColor: "hover:border-accent-purple/40" },
    { href: "/characters", label: "Characters", icon: "\u2694\uFE0F", description: "View player characters, stats, inventories, and skills", borderColor: "hover:border-accent-blue/40" },
    { href: "/maps", label: "Maps", icon: "\uD83D\uDDFA\uFE0F", description: "Browse and search all game maps, spawns, and portals", borderColor: "hover:border-accent-blue/40" },
    { href: "/items", label: "Items", icon: "\uD83C\uDF92", description: "Search equipment, consumables, and all item data", borderColor: "hover:border-accent-green/40" },
    { href: "/mobs", label: "Mobs", icon: "\uD83D\uDC7E", description: "Monster database with stats, drops, and spawn info", borderColor: "hover:border-accent-red/40" },
    { href: "/config", label: "Config", icon: "\u2699\uFE0F", description: "Server configuration, rates, and global settings", borderColor: "hover:border-accent-gold/40" },
    { href: "/scripts", label: "Scripts", icon: "\uD83D\uDCDC", description: "NPC, portal, quest, and event script editor", borderColor: "hover:border-accent-orange/40" },
    { href: "/drops", label: "Drops", icon: "\uD83D\uDC8E", description: "Drop tables, global drops, and loot configuration", borderColor: "hover:border-accent-blue/40" },
    { href: "/gamemaster", label: "Game Master", icon: "\uD83E\uDDE0", description: "AI Game Master controls, schedule, and session history", borderColor: "hover:border-accent-gold/40" },
  ];

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          AugurMS Dashboard
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
            {"sub" in stat && stat.sub && (
              <p className="mt-1 text-xs text-text-muted">{stat.sub}</p>
            )}
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

      <div className="h-px bg-gradient-to-r from-transparent via-border-light to-transparent" />
    </div>
  );
}
