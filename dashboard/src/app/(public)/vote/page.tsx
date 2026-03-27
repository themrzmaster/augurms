"use client";

import { useState } from "react";
import Link from "next/link";

const GTOP100_SITE_ID = "105823";
const TOPG_SITE_ID = "680931";

interface SiteStatus {
  lastVote: string | null;
  canVote: boolean;
  nextVoteAt: string | null;
}

interface VoteStatus {
  username: string;
  votePoints: number;
  sites: {
    gtop100: SiteStatus;
    topg: SiteStatus;
  };
}

function getTimeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "now";
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default function VotePage() {
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<VoteStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/vote/status?username=${encodeURIComponent(username)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to check status");
        return;
      }

      setStatus(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function getVoteUrl(site: string) {
    if (site === "gtop100") {
      return `https://gtop100.com/MapleStory/server-${GTOP100_SITE_ID}?vote=1&pingUsername=${encodeURIComponent(username)}`;
    }
    if (site === "topg") {
      return `https://topg.org/maplestory-private-servers/server-${TOPG_SITE_ID}-${encodeURIComponent(username)}#vote`;
    }
    return "#";
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-2xl text-accent-gold drop-shadow-[0_0_8px_rgba(245,197,66,0.4)]">
              &#10022;
            </span>
            <span className="text-xl font-bold tracking-wide">AugurMS</span>
          </Link>
          <h1 className="mt-3 text-lg font-semibold">Vote for AugurMS</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Vote daily to earn Vote Points — spend them at Fredrick in the FM!
          </p>
        </div>

        <form onSubmit={handleCheck} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Account Name
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setStatus(null);
              }}
              placeholder="Enter your account name"
              className="w-full rounded-lg border border-border bg-bg-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted outline-none transition focus:border-accent-gold/50 focus:ring-1 focus:ring-accent-gold/30"
              required
              minLength={4}
              maxLength={12}
              pattern="[a-zA-Z0-9]{4,12}"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent-gold py-2.5 text-sm font-bold text-bg-primary transition hover:bg-accent-gold/90 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Check Vote Status"}
          </button>
        </form>

        {status && (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-border bg-bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Your Vote Points</span>
                <span className="text-lg font-bold text-accent-gold">{status.votePoints} VP</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">GTop100</h3>
              {status.sites.gtop100.canVote ? (
                <a
                  href={getVoteUrl("gtop100")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-lg bg-green-600 py-2.5 text-center text-sm font-bold text-white transition hover:bg-green-500"
                >
                  Vote Now (+1 VP)
                </a>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-text-muted">Already voted today</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Next vote in {getTimeUntil(status.sites.gtop100.nextVoteAt!)}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">TopG</h3>
              {status.sites.topg.canVote ? (
                <a
                  href={getVoteUrl("topg")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full rounded-lg bg-green-600 py-2.5 text-center text-sm font-bold text-white transition hover:bg-green-500"
                >
                  Vote Now (+1 VP)
                </a>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-text-muted">Already voted today</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Next vote in {getTimeUntil(status.sites.topg.nextVoteAt!)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-text-muted">
          Use <span className="font-mono text-text-secondary">@points</span> in-game to check your balance
        </p>

        <p className="mt-4 text-center text-xs text-text-muted">
          <Link href="/" className="transition hover:text-text-secondary">
            &larr; Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
