"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/Card";

interface AdminUser {
  id: number;
  username: string;
  role: string;
  disabled: number;
  created_by: string | null;
  created_at: string;
  last_login_at: string | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onToggleDisabled = async (u: AdminUser) => {
    const action = u.disabled ? "enable" : "disable";
    if (!confirm(`${action} ${u.username}?`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: !u.disabled }),
    });
    if (!res.ok) {
      alert((await res.json()).error || `HTTP ${res.status}`);
      return;
    }
    load();
  };

  const onResetPassword = async (u: AdminUser) => {
    const pw = prompt(`New password for ${u.username} (min 8 chars):`);
    if (!pw) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (!res.ok) {
      alert((await res.json()).error || `HTTP ${res.status}`);
      return;
    }
    alert(`Password updated for ${u.username}.`);
  };

  const onDelete = async (u: AdminUser) => {
    if (!confirm(`Permanently delete ${u.username}? (Must be disabled first.)`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert((await res.json()).error || `HTTP ${res.status}`);
      return;
    }
    load();
  };

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Admin Users</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Dashboard logins. The bootstrap admin (set via{" "}
            <code className="rounded bg-bg-card px-1 text-xs">ADMIN_USER</code> env) always
            works as a fallback and isn&apos;t listed here.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-card-hover"
        >
          Refresh
        </button>
      </header>

      <CreateUserForm onCreated={load} />

      {error && (
        <Card className="mt-4 border-accent-red/30 bg-accent-red/5">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No DB-backed admin users yet. Create one above.
          </p>
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="pb-2">Username</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Created by</th>
                  <th className="pb-2">Last login</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="py-2 font-medium text-text-primary">{u.username}</td>
                    <td className="py-2 text-text-secondary">{u.role}</td>
                    <td className="py-2">
                      {u.disabled ? (
                        <span className="rounded-full bg-text-muted/10 px-2 py-0.5 text-[10px] text-text-muted">
                          disabled
                        </span>
                      ) : (
                        <span className="rounded-full bg-accent-green/10 px-2 py-0.5 text-[10px] text-accent-green">
                          active
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-text-muted">{u.created_by || "—"}</td>
                    <td className="py-2 text-text-muted">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleString()
                        : "never"}
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => onResetPassword(u)}
                          className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-border-light hover:text-text-primary"
                        >
                          Reset password
                        </button>
                        <button
                          onClick={() => onToggleDisabled(u)}
                          className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-border-light hover:text-text-primary"
                        >
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                        {u.disabled === 1 && (
                          <button
                            onClick={() => onDelete(u)}
                            className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent-red/50 hover:text-accent-red"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("admin");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUsername("");
      setPassword("");
      onCreated();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Create User">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span>Username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="babieskye"
            minLength={3}
            maxLength={64}
            required
            className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span>Password (min 8)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span>Role</span>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={32}
            className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg border border-accent-gold bg-accent-gold/10 px-3 py-1.5 text-sm font-medium text-accent-gold hover:bg-accent-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
      <p className="mt-2 text-xs text-text-muted">
        Note: roles aren&apos;t enforced yet — every logged-in user has full admin access. The
        field is recorded for later RBAC.
      </p>
    </Card>
  );
}
