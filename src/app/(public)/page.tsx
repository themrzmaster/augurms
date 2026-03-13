"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ServerStatus {
  docker?: { maplestory?: string };
}

export default function LandingPage() {
  const [status, setStatus] = useState<"online" | "offline" | "loading">("loading");
  const [rates, setRates] = useState({ exp: "1x", drop: "1x", meso: "1x" });

  useEffect(() => {
    fetch("/api/server")
      .then((r) => r.json())
      .then((data: ServerStatus) => {
        setStatus(data.docker?.maplestory === "running" ? "online" : "offline");
      })
      .catch(() => setStatus("offline"));

    fetch("/api/config")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.config?.server) {
          const s = data.config.server;
          setRates({
            exp: (s.EXP_RATE || 1) + "x",
            drop: (s.DROP_RATE || 1) + "x",
            meso: (s.MESO_RATE || 1) + "x",
          });
        }
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
      <nav className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl text-accent-gold drop-shadow-[0_0_8px_rgba(245,197,66,0.4)]">
            &#10022;
          </span>
          <span className="text-xl font-bold tracking-wide">AugurMS</span>
        </div>
        <div className="flex items-center gap-4">
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
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5">
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
            {status === "loading" ? "Checking..." : status === "online" ? "Server Online" : "Server Offline"}
          </span>
        </div>

        <h1 className="max-w-3xl text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
          MapleStory v83
          <br />
          <span className="bg-gradient-to-r from-accent-gold via-accent-orange to-accent-gold bg-clip-text text-transparent">
            Guided by AI
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
          A classic MapleStory experience with an AI Game Master that reads the
          pulse of the server and tunes the world in real time. The Augur sees all.
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
              title: "AI Game Master",
              desc: "An autonomous AI that monitors player activity and dynamically adjusts rates, events, and drops.",
              icon: "\uD83E\uDDE0",
            },
            {
              title: "Classic v83",
              desc: "The beloved MapleStory experience. 4th job, PQs, bossing, and all the nostalgia.",
              icon: "\uD83C\uDF41",
            },
            {
              title: "Active Development",
              desc: "Constant updates, custom content, and a responsive dev team. Built with care.",
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

        {/* Download section */}
        <div id="download" className="mt-20 w-full max-w-2xl scroll-mt-20">
          <h2 className="mb-4 text-2xl font-bold">Download</h2>
          <div className="rounded-xl border border-border bg-bg-card/50 p-8 backdrop-blur-sm">
            <p className="mb-4 text-text-secondary">
              Download the patched v83 client to connect to AugurMS. Extract and run
              the launcher &mdash; no additional setup required.
            </p>
            <a
              href="#"
              className="inline-flex items-center gap-2 rounded-lg bg-accent-blue px-6 py-3 font-semibold text-white transition hover:bg-accent-blue/90"
            >
              Download Client
              <span className="text-sm opacity-70">(~1.5 GB)</span>
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mt-20 border-t border-border px-8 py-8 text-center text-sm text-text-muted">
        AugurMS &mdash; MapleStory v83 private server. Not affiliated with Nexon.
      </footer>
    </div>
  );
}
