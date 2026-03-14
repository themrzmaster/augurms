"use client";

import { useState, useEffect } from "react";

interface Account {
  id: number;
  name: string;
  loggedin: number;
  lastlogin: string | null;
  createdat: string;
  banned: number;
  banreason: string | null;
  nxCredit: number | null;
  maplePoint: number | null;
  nxPrepaid: number | null;
  characterslots: number;
  mute: number;
  charCount: number;
  maxLevel: number;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/accounts");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAccounts(data);
    } catch {
      setError("Could not load accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAccounts(); }, []);

  async function toggleBan(account: Account) {
    const newBanned = account.banned ? 0 : 1;
    const reason = newBanned ? prompt("Ban reason:") : null;
    if (newBanned && reason === null) return;

    await fetch("/api/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, banned: newBanned, banreason: reason || null }),
    });
    fetchAccounts();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Accounts</h1>
        <p className="mt-1.5 text-text-secondary">
          {accounts.length} registered account{accounts.length !== 1 ? "s" : ""}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-border bg-bg-card p-12 text-center">
          <span className="text-4xl mb-4 block">👤</span>
          <p className="text-text-secondary">{error}</p>
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-border bg-bg-card p-8 animate-pulse">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-bg-card-hover" />
            ))}
          </div>
        </div>
      )}

      {!loading && !error && accounts.length > 0 && (
        <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-secondary/50 text-left text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Characters</th>
                  <th className="px-4 py-3">Top Lv</th>
                  <th className="px-4 py-3">NX</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="transition hover:bg-bg-card-hover">
                    <td className="px-4 py-3 font-mono text-text-muted">{acc.id}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-text-primary">{acc.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {acc.banned ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent-red/10 px-2 py-0.5 text-xs font-medium text-accent-red">
                            Banned
                          </span>
                        ) : acc.loggedin > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent-green/10 px-2 py-0.5 text-xs font-medium text-accent-green">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-green" />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-muted">
                            Offline
                          </span>
                        )}
                        {acc.mute > 0 && (
                          <span className="rounded-full bg-accent-orange/10 px-2 py-0.5 text-xs font-medium text-accent-orange">
                            Muted
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{acc.charCount}</td>
                    <td className="px-4 py-3">
                      {acc.maxLevel > 0 ? (
                        <span className="font-semibold text-accent-gold">{acc.maxLevel}</span>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {(acc.nxCredit || 0) + (acc.maplePoint || 0) + (acc.nxPrepaid || 0) > 0
                        ? ((acc.nxCredit || 0) + (acc.maplePoint || 0) + (acc.nxPrepaid || 0)).toLocaleString()
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {acc.createdat ? new Date(acc.createdat).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {acc.lastlogin ? new Date(acc.lastlogin).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleBan(acc)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                          acc.banned
                            ? "bg-accent-green/10 text-accent-green hover:bg-accent-green/20"
                            : "bg-accent-red/10 text-accent-red hover:bg-accent-red/20"
                        }`}
                      >
                        {acc.banned ? "Unban" : "Ban"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
