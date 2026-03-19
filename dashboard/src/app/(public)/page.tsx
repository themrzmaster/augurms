"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function LandingPage() {
  const [status, setStatus] = useState<"online" | "offline" | "loading">("loading");
  const [rates, setRates] = useState({ exp: "1x", drop: "1x", meso: "1x" });
  const [installTab, setInstallTab] = useState<"launcher" | "manual">("launcher");
  const [augurLog, setAugurLog] = useState<Array<{ type: string; text: string; date: string }>>([]);
  const [gmModel, setGmModel] = useState("");
  const [stats, setStats] = useState({ players: 0, accounts: 0, characters: 0, maxLevel: 0 });

  useEffect(() => {
    fetch("/api/server")
      .then((r) => r.json())
      .then((data: any) => {
        setStatus(data.status === "running" ? "online" : "offline");
        if (data.gmModel) setGmModel(data.gmModel);
        if (data.rates) {
          setRates({
            exp: (data.rates.exp || 1) + "x",
            drop: (data.rates.drop || 1) + "x",
            meso: (data.rates.meso || 1) + "x",
          });
        }
        setStats({
          players: data.players || 0,
          accounts: data.accounts || 0,
          characters: data.characters || 0,
          maxLevel: data.maxLevel || 0,
        });
      })
      .catch(() => setStatus("offline"));

    fetch("/api/launcher/news")
      .then((r) => r.json())
      .then((data) => {
        if (data?.news) setAugurLog(data.news.slice(0, 5));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Background effect */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-accent-gold/[0.03] blur-3xl" />
        <div className="absolute top-1/3 -left-1/4 h-[600px] w-[600px] rounded-full bg-accent-purple/[0.03] blur-3xl" />
        <div className="absolute -right-1/4 bottom-0 h-[600px] w-[600px] rounded-full bg-accent-blue/[0.03] blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="AugurMS" width={44} height={44} className="drop-shadow-[0_0_12px_rgba(245,197,66,0.3)]" />
          <span className="text-xl font-bold tracking-wide">AugurMS</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/themrzmaster/augurms"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
          >
            GitHub
          </a>
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
          >
            Admin
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-accent-gold px-5 py-2 text-sm font-bold text-bg-primary transition hover:bg-accent-gold/90 hover:shadow-[0_0_20px_rgba(245,197,66,0.3)]"
          >
            Create Account
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* Logo */}
        <div className="relative mb-6">
          <div className="absolute inset-0 scale-150 rounded-full bg-accent-gold/[0.06] blur-3xl" />
          <Image
            src="/logo.png"
            alt="AugurMS"
            width={220}
            height={220}
            priority
            className="relative drop-shadow-[0_0_40px_rgba(245,197,66,0.25)]"
          />
        </div>

        {/* Stats bar */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                status === "online"
                  ? "bg-accent-green shadow-[0_0_8px_rgba(66,211,146,0.5)]"
                  : status === "offline"
                  ? "bg-accent-red"
                  : "bg-text-muted animate-pulse"
              }`}
            />
            <span className="text-xs font-medium text-text-secondary">
              {status === "loading"
                ? "Checking..."
                : status === "online"
                ? `${stats.players} Online`
                : "Server Offline"}
            </span>
          </div>
          {status !== "loading" && (
            <>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5">
                <span className="text-xs text-text-muted">Accounts</span>
                <span className="text-xs font-bold text-text-primary">{stats.accounts}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5">
                <span className="text-xs text-text-muted">Characters</span>
                <span className="text-xs font-bold text-text-primary">{stats.characters}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5">
                <span className="text-xs text-text-muted">Top Level</span>
                <span className="text-xs font-bold text-accent-gold">{stats.maxLevel}</span>
              </div>
            </>
          )}
        </div>

        <h1 className="max-w-3xl text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
          MapleStory v83
          <br />
          <span className="bg-gradient-to-r from-accent-gold via-accent-orange to-accent-gold bg-clip-text text-transparent">
            Guided by AI
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
          Something ancient watches over this world. It reads every kill, every
          trade, every quiet hour. It shifts the rules before you notice and
          reshapes the game while you sleep. Welcome to the server that plays back.
        </p>

        {/* Rates */}
        <div className="mt-8 flex items-center gap-6">
          {[
            { label: "EXP", value: rates.exp, color: "text-accent-blue" },
            { label: "DROP", value: rates.drop, color: "text-accent-green" },
            { label: "MESO", value: rates.meso, color: "text-accent-gold" },
          ].map((r) => (
            <div key={r.label} className="text-center">
              <div className={`text-2xl font-bold ${r.color}`}>{r.value}</div>
              <div className="text-xs font-semibold tracking-wider text-text-muted uppercase">
                {r.label}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href="/register"
            className="rounded-xl bg-accent-gold px-8 py-3.5 text-base font-bold text-bg-primary transition hover:bg-accent-gold/90 hover:shadow-[0_0_30px_rgba(245,197,66,0.3)]"
          >
            Play Now
          </Link>
          <a
            href="#download"
            className="rounded-xl border border-border px-8 py-3.5 text-base font-medium text-text-secondary transition hover:border-border-light hover:text-text-primary"
          >
            Download Client
          </a>
        </div>

        {/* Features */}
        <div className="mt-20 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            {
              title: "The Augur",
              desc: `An omniscient AI oracle that watches player activity, economy, and progression \u2014 then autonomously tunes drop rates, EXP curves, and spawns events when the world needs them.${gmModel ? `\n\nCurrently powered by ${gmModel.split("/").pop()}.` : ""}`,
              icon: "\uD83E\uDDE0",
            },
            {
              title: "Classic v83",
              desc: "The golden era, preserved. 4th job, party quests, bossing \u2014 every mechanic you remember, running on a world that remembers you back.",
              icon: "\uD83C\uDF41",
            },
            {
              title: "Living World",
              desc: "No two weeks play the same. The Augur shifts the economy, rebalances monsters, and introduces events no one predicted. The game is never solved.",
              icon: "\u26A1",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-bg-card/50 p-6 text-left backdrop-blur-sm transition hover:border-border-light"
            >
              <div className="mb-3 text-2xl">{f.icon}</div>
              <h3 className="mb-2 font-semibold text-text-primary">{f.title}</h3>
              <p className="text-sm leading-relaxed text-text-secondary">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Augur's Log */}
        {augurLog.length > 0 && (
          <div className="mt-20 w-full max-w-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-accent-gold shadow-[0_0_8px_rgba(245,197,66,0.5)] animate-pulse" />
              <h2 className="text-lg font-bold text-text-primary">The Augur&apos;s Log</h2>
              <span className="text-xs text-text-muted">Live AI Game Master activity</span>
            </div>
            <div className="space-y-2">
              {augurLog.map((entry, i) => {
                const typeColors: Record<string, string> = {
                  rates: "border-accent-gold/20 text-accent-gold",
                  drops: "border-accent-green/20 text-accent-green",
                  event: "border-accent-purple/20 text-accent-purple",
                  update: "border-accent-blue/20 text-accent-blue",
                };
                const typeLabels: Record<string, string> = {
                  rates: "RATES",
                  drops: "DROPS",
                  event: "EVENT",
                  update: "UPDATE",
                };
                const colors = typeColors[entry.type] || typeColors.update;
                const label = typeLabels[entry.type] || "UPDATE";
                const ago = getTimeAgo(entry.date);

                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-border bg-bg-card/30 px-4 py-3 backdrop-blur-sm"
                  >
                    <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${colors}`}>
                      {label}
                    </span>
                    <p className="flex-1 text-sm text-text-secondary leading-relaxed">{entry.text}</p>
                    <span className="shrink-0 text-xs text-text-muted">{ago}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Download section */}
        <div id="download" className="mt-20 w-full max-w-3xl scroll-mt-20">
          <h2 className="mb-2 text-2xl font-bold">Download &amp; Play</h2>
          <p className="mb-8 text-sm text-text-secondary">
            Two ways to get started: use our <strong className="text-text-primary">Launcher</strong> (recommended) for automatic updates, or install manually.
          </p>

          {/* Tab toggle */}
          <div className="mb-6 flex rounded-lg border border-border bg-bg-card/50 p-1">
            <button
              onClick={() => setInstallTab("launcher")}
              className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                installTab === "launcher"
                  ? "bg-accent-gold/10 text-accent-gold"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Launcher (Recommended)
            </button>
            <button
              onClick={() => setInstallTab("manual")}
              className={`flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                installTab === "manual"
                  ? "bg-accent-gold/10 text-accent-gold"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              Manual Install
            </button>
          </div>

          {installTab === "launcher" ? (
            <div className="space-y-4">
              {/* Launcher Step 1 */}
              <div className="rounded-xl border border-border bg-bg-card/50 p-6 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-gold/10 text-sm font-bold text-accent-gold">1</span>
                  <div className="flex-1">
                    <h3 className="mb-1 font-semibold text-text-primary">Install MapleStory v83 (base game)</h3>
                    <p className="mb-3 text-sm text-text-secondary">
                      Download the original v83 installer and run it. Use the default path (<code className="rounded bg-bg-primary/80 px-1.5 py-0.5 text-xs">C:\Nexon\MapleStory</code>) or any folder you prefer. Then <strong>delete</strong> these from the install folder:
                    </p>
                    <div className="mb-3 rounded-lg bg-bg-primary/50 px-4 py-2.5 font-mono text-xs text-text-secondary">
                      <span className="text-accent-red">HShield/</span>{" "}<span className="text-text-muted">&middot;</span>{" "}
                      <span className="text-accent-red">ASPLnchr.exe</span>{" "}<span className="text-text-muted">&middot;</span>{" "}
                      <span className="text-accent-red">MapleStory.exe</span>{" "}<span className="text-text-muted">&middot;</span>{" "}
                      <span className="text-accent-red">Patcher.exe</span>
                    </div>
                    <a
                      href="https://github.com/P0nk/Cosmic-client/raw/main/MapleGlobal-v83-setup.exe"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-border"
                    >
                      Download v83 Installer
                      <span className="text-xs text-text-muted">(452 MB)</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Launcher Step 2 */}
              <div className="rounded-xl border border-border bg-bg-card/50 p-6 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-gold/10 text-sm font-bold text-accent-gold">2</span>
                  <div className="flex-1">
                    <h3 className="mb-1 font-semibold text-text-primary">Install AugurMS Launcher</h3>
                    <p className="mb-3 text-sm text-text-secondary">
                      Download and run the launcher installer. It will auto-detect your MapleStory folder (or let you browse to it). The launcher <strong>automatically downloads and updates</strong> all game files &mdash; no manual file copying needed.
                    </p>
                    <a
                      href="https://github.com/themrzmaster/augurms/releases/download/launcher-v1.0.2/AugurMS.Setup.1.0.2.exe"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-accent-gold px-5 py-2.5 font-semibold text-bg-primary transition hover:bg-accent-gold/90 hover:shadow-[0_0_20px_rgba(245,197,66,0.3)]"
                    >
                      Download AugurMS Launcher
                      <span className="text-sm opacity-70">(.exe)</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Launcher Step 3 */}
              <div className="rounded-xl border border-border bg-bg-card/50 p-6 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-green/10 text-sm font-bold text-accent-green">3</span>
                  <div className="flex-1">
                    <h3 className="mb-1 font-semibold text-text-primary">Create account &amp; play</h3>
                    <p className="text-sm text-text-secondary">
                      <a href="/register" className="font-medium text-accent-gold underline underline-offset-2">Create an account</a> on this site, then open the launcher and hit <strong>Play</strong>. The launcher shows live server status, current rates, and keeps your game files synced with the latest updates from the AI Game Master.
                    </p>
                  </div>
                </div>
              </div>

              {/* Launcher features callout */}
              <div className="rounded-xl border border-accent-gold/15 bg-accent-gold/[0.03] p-5">
                <h4 className="mb-2 text-sm font-semibold text-accent-gold">What the Launcher does</h4>
                <ul className="space-y-1.5 text-xs leading-relaxed text-text-secondary">
                  <li><strong className="text-text-primary">Auto-updates:</strong> When the AI Game Master changes game files, the launcher downloads them on your next launch. No re-downloading zips.</li>
                  <li><strong className="text-text-primary">Server status:</strong> See if the server is online, how many players are on, and current EXP/DROP/MESO rates.</li>
                  <li><strong className="text-text-primary">The Augur&apos;s Log:</strong> Live feed of what the AI is doing &mdash; rate changes, events, drop adjustments &mdash; right in the launcher.</li>
                  <li><strong className="text-text-primary">File integrity:</strong> Checks your game files against the server manifest using SHA-256. Corrupted or missing files get re-downloaded.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Manual Step 1 */}
              <div className="rounded-xl border border-border bg-bg-card/50 p-6 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-gold/10 text-sm font-bold text-accent-gold">1</span>
                  <div className="flex-1">
                    <h3 className="mb-1 font-semibold text-text-primary">Install MapleStory v83 (base game)</h3>
                    <p className="mb-3 text-sm text-text-secondary">
                      Download the original v83 installer and run it. Install to any folder (default: <code className="rounded bg-bg-primary/80 px-1.5 py-0.5 text-xs">C:\Nexon\MapleStory</code>).
                    </p>
                    <a
                      href="https://github.com/P0nk/Cosmic-client/raw/main/MapleGlobal-v83-setup.exe"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-border"
                    >
                      Download v83 Installer
                      <span className="text-xs text-text-muted">(452 MB)</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Manual Step 2 */}
              <div className="rounded-xl border border-border bg-bg-card/50 p-6 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-gold/10 text-sm font-bold text-accent-gold">2</span>
                  <div className="flex-1">
                    <h3 className="mb-1 font-semibold text-text-primary">Clean the install folder</h3>
                    <p className="text-sm text-text-secondary">
                      Go to your MapleStory install folder and <strong>delete</strong> these files:
                    </p>
                    <div className="mt-2 rounded-lg bg-bg-primary/50 px-4 py-3 font-mono text-xs text-text-secondary">
                      <div className="text-accent-red">HShield/</div>
                      <div className="text-accent-red">ASPLnchr.exe</div>
                      <div className="text-accent-red">MapleStory.exe</div>
                      <div className="text-accent-red">Patcher.exe</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Manual Step 3 */}
              <div className="rounded-xl border border-border bg-bg-card/50 p-6 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-gold/10 text-sm font-bold text-accent-gold">3</span>
                  <div className="flex-1">
                    <h3 className="mb-1 font-semibold text-text-primary">Download AugurMS client files</h3>
                    <p className="mb-3 text-sm text-text-secondary">
                      Download the client pack and extract <strong>everything</strong> (AugurMS.exe + all .wz files) into your MapleStory install folder. Replace existing .wz files when prompted.
                    </p>
                    <a
                      href="https://github.com/themrzmaster/augurms/releases/tag/client-v1.0.1"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-5 py-2.5 font-semibold text-white transition hover:bg-accent-blue/90 hover:shadow-[0_0_20px_rgba(96,165,250,0.3)]"
                    >
                      Download AugurMS Client Files
                      <span className="text-sm opacity-70">(~1 GB)</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Manual Step 4 */}
              <div className="rounded-xl border border-border bg-bg-card/50 p-6 backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-green/10 text-sm font-bold text-accent-green">4</span>
                  <div className="flex-1">
                    <h3 className="mb-1 font-semibold text-text-primary">Create account &amp; play</h3>
                    <p className="text-sm text-text-secondary">
                      <a href="/register" className="font-medium text-accent-gold underline underline-offset-2">Create an account</a> on this site, then double-click <strong>AugurMS.exe</strong> in your install folder. Log in and enjoy!
                    </p>
                  </div>
                </div>
              </div>

              {/* Note about updates */}
              <div className="rounded-xl border border-accent-blue/15 bg-accent-blue/[0.03] p-4">
                <p className="text-xs leading-relaxed text-text-secondary">
                  <strong className="text-accent-blue">Tip:</strong> With manual install, you&apos;ll need to re-download the client pack when the AI Game Master pushes updates. Use the <strong>Launcher</strong> instead for automatic updates.
                </p>
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="mt-4 rounded-xl border border-accent-orange/20 bg-accent-orange/5 p-4">
            <p className="text-xs leading-relaxed text-text-secondary">
              <strong className="text-accent-orange">Windows Security:</strong> AugurMS.exe may be flagged as a virus &mdash; this is a false positive common with all modified game clients. Add your MapleStory install folder as an exclusion in <em>Windows Security &gt; Virus &amp; threat protection settings &gt; Exclusions &gt; Add a folder</em>.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-20 border-t border-border px-8 py-8 text-center text-sm text-text-muted">
        <p>AugurMS &mdash; MapleStory v83 private server. Not affiliated with Nexon.</p>
        <a href="https://discord.gg/aEE3zpFY" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-accent hover:underline">Join our Discord</a>
      </footer>
    </div>
  );
}
