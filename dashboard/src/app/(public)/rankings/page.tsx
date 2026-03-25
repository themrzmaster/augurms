"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { JOB_NAMES } from "@/lib/cosmic";

interface RankedCharacter {
  id: number;
  name: string;
  level: number;
  exp: number;
  job: number;
  fame: number;
  meso: number;
  guild: string | null;
  skincolor: number;
  hair: number;
  face: number;
  gender: number;
  equips: number[];
}

const JOB_FAMILIES = [
  { id: null, label: "All" },
  { id: "0", label: "Beginner" },
  { id: "1", label: "Warrior" },
  { id: "2", label: "Magician" },
  { id: "3", label: "Bowman" },
  { id: "4", label: "Thief" },
  { id: "5", label: "Pirate" },
];

const SORT_OPTIONS = [
  { id: "level", label: "Level" },
  { id: "fame", label: "Fame" },
];

function buildAvatarUrl(char: RankedCharacter): string {
  const items: string[] = [];
  const add = (id: number) =>
    items.push(`{"ItemId":${id},"Region":"GMS","Version":"83"}`);

  // Body: skin + head
  add(2000 + (char.skincolor || 0));
  add(12000);

  // Face & hair
  if (char.face) add(char.face);
  if (char.hair) add(char.hair);

  // Equipped gear
  for (const itemId of char.equips) {
    // Only include visible equips (weapons, armor, accessories)
    // Skip things like medals (18xxxxx), mount items, etc. that may not render
    if (itemId >= 1000000 && itemId < 1900000) {
      add(itemId);
    }
  }

  return `https://maplestory.io/api/character/${items.join(",")}/stand1?resize=2`;
}

function getJobColor(job: number): string {
  const family = Math.floor(job / 100);
  switch (family) {
    case 1:
      return "text-accent-red";
    case 2:
      return "text-accent-purple";
    case 3:
      return "text-accent-green";
    case 4:
      return "text-accent-orange";
    case 5:
      return "text-accent-blue";
    default:
      return "text-text-secondary";
  }
}

function getRankBadge(rank: number) {
  if (rank === 1)
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5c542]/20 text-lg font-bold text-[#f5c542] shadow-[0_0_12px_rgba(245,197,66,0.3)]">
        1
      </span>
    );
  if (rank === 2)
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#c0c0c0]/15 text-lg font-bold text-[#c0c0c0]">
        2
      </span>
    );
  if (rank === 3)
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#cd7f32]/15 text-lg font-bold text-[#cd7f32]">
        3
      </span>
    );
  return (
    <span className="flex h-8 w-8 items-center justify-center text-sm text-text-muted">
      {rank}
    </span>
  );
}

function formatMeso(meso: number): string {
  if (meso >= 1_000_000_000) return (meso / 1_000_000_000).toFixed(1) + "b";
  if (meso >= 1_000_000) return (meso / 1_000_000).toFixed(1) + "m";
  if (meso >= 1_000) return (meso / 1_000).toFixed(0) + "k";
  return meso.toString();
}

export default function RankingsPage() {
  const [rankings, setRankings] = useState<RankedCharacter[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("level");
  const [jobFilter, setJobFilter] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ sort, limit: "50" });
    if (jobFilter) params.set("job", jobFilter);

    fetch(`/api/rankings?${params}`)
      .then((r) => r.json())
      .then((data) => setRankings(data.rankings || []))
      .catch(() => setRankings([]))
      .finally(() => setLoading(false));
  }, [sort, jobFilter]);

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Background effect */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-accent-gold/[0.03] blur-3xl" />
        <div className="absolute top-1/3 -left-1/4 h-[600px] w-[600px] rounded-full bg-accent-purple/[0.03] blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="AugurMS"
            width={44}
            height={44}
            className="drop-shadow-[0_0_12px_rgba(245,197,66,0.3)]"
          />
          <span className="text-xl font-bold tracking-wide">AugurMS</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
          >
            Home
          </Link>
          <Link
            href="/vote"
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
          >
            Vote
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-accent-gold px-5 py-2 text-sm font-bold text-bg-primary transition hover:bg-accent-gold/90 hover:shadow-[0_0_20px_rgba(245,197,66,0.3)]"
          >
            Create Account
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight">
          Rankings
        </h1>
        <p className="mb-8 text-sm text-text-secondary">
          Top adventurers of AugurMS, ranked by their achievements.
        </p>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {/* Sort */}
          <div className="flex rounded-lg border border-border bg-bg-card/50 p-0.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSort(opt.id)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  sort === opt.id
                    ? "bg-accent-gold/10 text-accent-gold"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-border" />

          {/* Job filter */}
          <div className="flex flex-wrap gap-1.5">
            {JOB_FAMILIES.map((jf) => (
              <button
                key={jf.label}
                onClick={() => setJobFilter(jf.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  jobFilter === jf.id
                    ? "bg-accent-blue/15 text-accent-blue"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {jf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-bg-card/50"
              />
            ))}
          </div>
        ) : rankings.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-card/30 py-20 text-center">
            <p className="text-text-muted">No characters found.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            {/* Header */}
            <div className="hidden border-b border-border bg-bg-card/80 px-4 py-2.5 text-xs font-semibold tracking-wider text-text-muted uppercase sm:grid sm:grid-cols-[3rem_4.5rem_1fr_8rem_5rem_5rem_5rem]">
              <span className="text-center">#</span>
              <span />
              <span>Character</span>
              <span>Class</span>
              <span className="text-center">Level</span>
              <span className="text-center">Fame</span>
              <span className="text-right">Meso</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/50">
              {rankings.map((char, i) => (
                <RankingRow key={char.id} char={char} rank={i + 1} sort={sort} />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-12 border-t border-border px-8 py-6 text-center text-sm text-text-muted">
        <p>
          AugurMS &mdash; MapleStory v83 private server. Not affiliated with
          Nexon.
        </p>
      </footer>
    </div>
  );
}

function RankingRow({
  char,
  rank,
  sort,
}: {
  char: RankedCharacter;
  rank: number;
  sort: string;
}) {
  const [imgStatus, setImgStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

  const avatarUrl = buildAvatarUrl(char);
  const jobName = JOB_NAMES[char.job] || `Job ${char.job}`;
  const isTop3 = rank <= 3;

  return (
    <div
      className={`group grid grid-cols-[3rem_4.5rem_1fr] items-center gap-0 px-4 py-2 transition sm:grid-cols-[3rem_4.5rem_1fr_8rem_5rem_5rem_5rem] ${
        isTop3
          ? "bg-accent-gold/[0.02] hover:bg-accent-gold/[0.05]"
          : "hover:bg-bg-card/50"
      }`}
    >
      {/* Rank */}
      <div className="flex justify-center">{getRankBadge(rank)}</div>

      {/* Avatar */}
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden">
        {imgStatus === "error" ? (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-bg-card text-text-muted">
            <span className="text-lg">?</span>
          </div>
        ) : (
          <div className="relative h-14 w-14">
            {imgStatus === "loading" && (
              <div className="absolute inset-0 animate-pulse rounded bg-bg-card-hover" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl}
              alt={char.name}
              className={`h-14 w-14 object-contain transition-opacity duration-300 ${
                imgStatus === "loaded" ? "opacity-100" : "opacity-0"
              }`}
              style={{ imageRendering: "pixelated" }}
              onLoad={() => setImgStatus("loaded")}
              onError={() => setImgStatus("error")}
              draggable={false}
            />
          </div>
        )}
      </div>

      {/* Name + Guild (always visible) */}
      <div className="min-w-0 pl-2">
        <div className="flex items-center gap-2">
          <span
            className={`truncate font-semibold ${
              isTop3 ? "text-accent-gold" : "text-text-primary"
            }`}
          >
            {char.name}
          </span>
        </div>
        {char.guild && (
          <span className="text-xs text-text-muted">{char.guild}</span>
        )}
        {/* Mobile-only stats */}
        <div className="mt-0.5 flex items-center gap-3 text-xs text-text-muted sm:hidden">
          <span className={getJobColor(char.job)}>{jobName}</span>
          <span>
            Lv.{" "}
            <span className="font-semibold text-text-primary">
              {char.level}
            </span>
          </span>
          {sort === "fame" && (
            <span>
              Fame{" "}
              <span className="font-semibold text-accent-purple">
                {char.fame}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Class - desktop */}
      <span
        className={`hidden truncate text-sm font-medium sm:block ${getJobColor(char.job)}`}
      >
        {jobName}
      </span>

      {/* Level - desktop */}
      <span
        className={`hidden text-center text-sm font-bold sm:block ${
          isTop3 ? "text-accent-gold" : "text-text-primary"
        }`}
      >
        {char.level}
      </span>

      {/* Fame - desktop */}
      <span className="hidden text-center text-sm text-accent-purple sm:block">
        {char.fame}
      </span>

      {/* Meso - desktop */}
      <span className="hidden text-right text-sm text-text-secondary sm:block">
        {formatMeso(char.meso)}
      </span>
    </div>
  );
}
