"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type ServerAction = "start" | "stop" | "restart" | "rebuild";
type ServiceFilter = "maplestory" | "db" | "";

interface Container {
  name: string;
  status: string;
}

interface ServerStatus {
  status: string;
  containers: Container[];
}

export default function ServerControls() {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [logs, setLogs] = useState("");
  const [lineLimit, setLineLimit] = useState(100);
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("");
  const [loadingAction, setLoadingAction] = useState<ServerAction | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actionResult, setActionResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/server");
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch {
      setServerStatus(null);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams({ lines: String(lineLimit) });
      if (serviceFilter) params.set("service", serviceFilter);
      const res = await fetch(`/api/server/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || "");
      }
    } catch {
      setLogs("Failed to fetch logs.");
    } finally {
      setLoadingLogs(false);
    }
  }, [lineLimit, serviceFilter]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  async function handleAction(action: ServerAction) {
    setLoadingAction(action);
    setActionResult(null);
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setActionResult({
          type: "success",
          message: `Server ${action} successful`,
        });
        setTimeout(fetchStatus, 2000);
        setTimeout(fetchLogs, 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setActionResult({
          type: "error",
          message: data.error || `Failed to ${action} server`,
        });
      }
    } catch {
      setActionResult({ type: "error", message: `Failed to ${action} server` });
    } finally {
      setLoadingAction(null);
    }
  }

  const isOnline = serverStatus?.status === "running";

  const actionButtons: { action: ServerAction; label: string; color: string }[] =
    [
      {
        action: "start",
        label: "Start",
        color: "bg-accent-green/15 text-accent-green border-accent-green/30 hover:bg-accent-green/25",
      },
      {
        action: "stop",
        label: "Stop",
        color: "bg-accent-red/15 text-accent-red border-accent-red/30 hover:bg-accent-red/25",
      },
      {
        action: "restart",
        label: "Restart",
        color: "bg-accent-blue/15 text-accent-blue border-accent-blue/30 hover:bg-accent-blue/25",
      },
      {
        action: "rebuild",
        label: "Rebuild",
        color: "bg-accent-purple/15 text-accent-purple border-accent-purple/30 hover:bg-accent-purple/25",
      },
    ];

  return (
    <div className="space-y-5">
      {/* Status + Actions */}
      <div className="rounded-xl border border-border bg-bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              {isOnline && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-40" />
              )}
              <span
                className={`relative inline-flex h-3 w-3 rounded-full ${
                  isOnline
                    ? "bg-accent-green shadow-[0_0_8px_rgba(66,211,146,0.5)]"
                    : "bg-accent-red shadow-[0_0_8px_rgba(255,92,92,0.5)]"
                }`}
              />
            </span>
            <span className="text-sm font-semibold text-text-primary">
              {isOnline ? "Server Online" : "Server Offline"}
            </span>
          </div>
          <div className="flex gap-2">
            {actionButtons.map(({ action, label, color }) => (
              <button
                key={action}
                onClick={() => handleAction(action)}
                disabled={loadingAction !== null}
                className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 disabled:opacity-40 ${color}`}
              >
                {loadingAction === action ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {label}...
                  </span>
                ) : (
                  label
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Containers */}
        {serverStatus?.containers && serverStatus.containers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {serverStatus.containers.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-1.5 rounded-md bg-bg-secondary px-2.5 py-1 text-xs text-text-secondary"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    c.status.includes("Up")
                      ? "bg-accent-green"
                      : "bg-accent-red"
                  }`}
                />
                {c.name}
              </span>
            ))}
          </div>
        )}

        {actionResult && (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
              actionResult.type === "success"
                ? "border-accent-green/30 bg-accent-green/10 text-accent-green"
                : "border-accent-red/30 bg-accent-red/10 text-accent-red"
            }`}
          >
            {actionResult.message}
          </div>
        )}
      </div>

      {/* Log Viewer */}
      <div className="rounded-xl border border-border bg-bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide text-text-secondary uppercase">
            Server Logs
          </h3>
          <div className="flex items-center gap-2">
            {/* Service filter */}
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value as ServiceFilter)}
              className="rounded-md border border-border bg-bg-secondary px-2.5 py-1 text-xs text-text-primary outline-none focus:border-accent-blue"
            >
              <option value="">All Services</option>
              <option value="maplestory">Game Server</option>
              <option value="db">Database</option>
            </select>

            {/* Line limit */}
            <select
              value={lineLimit}
              onChange={(e) => setLineLimit(Number(e.target.value))}
              className="rounded-md border border-border bg-bg-secondary px-2.5 py-1 text-xs text-text-primary outline-none focus:border-accent-blue"
            >
              <option value={50}>50 lines</option>
              <option value={100}>100 lines</option>
              <option value={500}>500 lines</option>
            </select>

            {/* Refresh */}
            <button
              onClick={fetchLogs}
              disabled={loadingLogs}
              className="rounded-md border border-border bg-bg-secondary px-2.5 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
            >
              {loadingLogs ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        <pre
          ref={logRef}
          className="h-72 overflow-auto rounded-lg bg-bg-primary p-4 font-mono text-xs leading-5 text-text-secondary"
        >
          {logs || "No logs available."}
        </pre>
      </div>
    </div>
  );
}
