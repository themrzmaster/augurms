"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Card from "@/components/Card";

interface ManifestFile {
  name: string;
  hash: string;
  size: number;
  url: string;
  hd?: boolean;
}

interface ManifestSnapshot {
  version: string;
  updatedAt?: string;
  files: ManifestFile[];
  source: "volume" | "bundled";
}

const SERVER_TARBALL = "server-wz.tar.gz";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function shortHash(hash: string): string {
  return hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : "—";
}

export default function WzRawUploadPage() {
  const [manifest, setManifest] = useState<ManifestSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/wz/list");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ManifestSnapshot;
      setManifest(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tarballEntry: ManifestFile = {
    name: SERVER_TARBALL,
    hash: "",
    size: 0,
    url: "",
  };

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Raw WZ Upload</h1>
          <p className="mt-1 max-w-3xl text-sm text-text-secondary">
            Replace any launcher-distributed file (or the server WZ tarball) with a pre-built binary.
            Use this when the asset pipeline can't produce what you need — e.g. patching a stock{" "}
            <code className="rounded bg-bg-card px-1 text-xs">Item.wz</code> bucket, or shipping a
            new <code className="rounded bg-bg-card px-1 text-xs">Map.wz</code>.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-card-hover"
        >
          Refresh
        </button>
      </header>

      {error && (
        <Card className="mb-4 border-accent-red/30 bg-accent-red/5">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      <Card className="mb-6 border-accent-gold/30 bg-accent-gold/5">
        <p className="text-xs text-accent-gold">
          ⚠ Raw upload bypasses every audit and patcher in the dashboard. The file you upload is what
          players (or the game server) will receive verbatim. A wrong file here means broken WZ on
          every client; treat each upload like editing prod state.
        </p>
      </Card>

      {loading ? (
        <p className="text-sm text-text-secondary">Loading manifest…</p>
      ) : manifest ? (
        <>
          <p className="mb-3 text-xs text-text-muted">
            Manifest <code className="rounded bg-bg-card px-1">{manifest.source}</code> at version{" "}
            <span className="font-medium text-text-secondary">{manifest.version}</span>
            {manifest.updatedAt ? ` (updated ${new Date(manifest.updatedAt).toLocaleString()})` : ""}
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-bg-card text-left text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Hash (sha256)</th>
                  <th className="px-3 py-2 w-1"></th>
                </tr>
              </thead>
              <tbody>
                {manifest.files.map((f) => (
                  <tr key={f.name} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium text-text-primary">
                      {f.name}
                      {f.hd ? <span className="ml-2 rounded bg-bg-card px-1 text-[10px] text-text-muted">hd</span> : null}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{formatSize(f.size)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-text-muted">{shortHash(f.hash)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setTarget(f.name)}
                        className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-text-primary hover:border-accent-gold/40 hover:text-accent-gold"
                      >
                        Replace
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border/60 bg-bg-card/30">
                  <td className="px-3 py-2 font-medium text-text-primary">
                    {SERVER_TARBALL}
                    <span className="ml-2 rounded bg-bg-card px-1 text-[10px] text-text-muted">server only · triggers restart</span>
                  </td>
                  <td className="px-3 py-2 text-text-muted" colSpan={2}>
                    Not in launcher manifest. Replacing this drops a version marker and restarts the game server.
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setTarget(SERVER_TARBALL)}
                      className="rounded border border-border bg-bg-card px-2 py-1 text-xs text-text-primary hover:border-accent-gold/40 hover:text-accent-gold"
                    >
                      Replace
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {target && (
        <UploadModal
          name={target}
          current={
            target === SERVER_TARBALL
              ? tarballEntry
              : manifest?.files.find((f) => f.name === target) || null
          }
          onClose={() => setTarget(null)}
          onDone={() => {
            setTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function UploadModal({
  name,
  current,
  onClose,
  onDone,
}: {
  name: string;
  current: ManifestFile | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPick = (f: File) => {
    setFile(f);
    setError(null);
    setResult(null);
  };

  const sizeDelta = file && current ? file.size - current.size : null;
  const sizeChangePct =
    file && current && current.size > 0
      ? ((file.size - current.size) / current.size) * 100
      : null;

  // Flag any upload that's <50% or >200% of current size — likely a wrong file.
  const sizeSuspicious =
    sizeChangePct !== null && (sizeChangePct < -50 || sizeChangePct > 100);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("file", file);
      const res = await fetch("/api/admin/wz/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(
        data.version
          ? `Uploaded. Manifest now v${data.version} (${formatSize(data.size)})`
          : data.serverRestart
            ? data.serverRestart.success
              ? `Uploaded. Server restart triggered (machine ${data.serverRestart.machineId}).`
              : `Uploaded, but server restart failed: ${data.serverRestart.error}. Restart manually.`
            : `Uploaded (${formatSize(data.size)}).`
      );
      // Wait a beat so the user can see the result, then refresh.
      setTimeout(onDone, 1200);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="w-full max-w-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Replace {name}</h2>
            {current && current.size > 0 ? (
              <p className="mt-1 text-xs text-text-muted">
                Current: {formatSize(current.size)} · {shortHash(current.hash)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-text-muted">No prior version known to dashboard.</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-text-muted hover:text-text-primary disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div
          className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border py-8 text-sm text-text-secondary"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onPick(f);
          }}
        >
          {file ? (
            <>
              <p className="font-medium text-text-primary">{file.name}</p>
              <p className="text-xs text-text-muted">{formatSize(file.size)}</p>
              <button
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs text-text-muted underline hover:text-text-secondary"
              >
                pick a different file
              </button>
            </>
          ) : (
            <>
              <p>Drop a file here, or</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded border border-border bg-bg-card px-3 py-1 text-xs text-text-primary hover:bg-bg-card-hover"
              >
                Browse…
              </button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />
        </div>

        {file && current && current.size > 0 && sizeDelta !== null && sizeChangePct !== null && (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
              sizeSuspicious
                ? "border-accent-red/40 bg-accent-red/5 text-accent-red"
                : "border-border bg-bg-card text-text-secondary"
            }`}
          >
            Size {sizeDelta >= 0 ? "+" : ""}
            {formatSize(Math.abs(sizeDelta))} ({(sizeChangePct ?? 0).toFixed(0)}% vs current)
            {sizeSuspicious ? " — that's a big swing, double-check this is the right file." : ""}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-accent-red/40 bg-accent-red/5 px-3 py-2 text-xs text-accent-red">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-3 rounded-lg border border-accent-green/40 bg-accent-green/5 px-3 py-2 text-xs text-accent-green">
            {result}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-card-hover disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!file || busy}
            className="rounded-lg border border-accent-gold bg-accent-gold/10 px-4 py-1.5 text-sm font-medium text-accent-gold hover:bg-accent-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Uploading…" : sizeSuspicious ? "Upload anyway" : "Upload"}
          </button>
        </div>
      </Card>
    </div>
  );
}
