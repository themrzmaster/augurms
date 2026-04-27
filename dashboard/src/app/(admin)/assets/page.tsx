"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Card from "@/components/Card";

type AssetType = "hair" | "face" | "npc" | "etc";

interface Asset {
  id: number;
  asset_type: AssetType;
  in_game_id: number;
  name: string | null;
  source_version: string | null;
  file_key: string;
  file_hash: string | null;
  file_size: number | null;
  preview_url: string | null;
  status: "ready" | "published" | "rejected";
  notes: string | null;
  attrs: any;
  uploaded_by: string | null;
  uploaded_at: string;
  published_at: string | null;
}

interface PublishStatus {
  status: "idle" | "running" | "done" | "error";
  step?: string;
  actions?: string[];
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  assets_published?: number;
  version?: string;
}

const TYPE_TABS: { key: AssetType; label: string; icon: string }[] = [
  { key: "hair", label: "Hair", icon: "💇" },
  { key: "face", label: "Face", icon: "😊" },
  { key: "npc", label: "NPC", icon: "🧙" },
  { key: "etc", label: "ETC item", icon: "📦" },
];

const FILE_INPUT_ACCEPT: Record<AssetType, string> = {
  hair: ".img,application/octet-stream",
  face: ".img,application/octet-stream",
  npc: "image/png",
  etc: "image/png",
};

const FILE_HINT: Record<AssetType, string> = {
  hair: "binary .img file (GMS-encrypted, exported from HaRepacker)",
  face: "binary .img file (GMS-encrypted, exported from HaRepacker)",
  npc: "PNG sprite (single standing frame; auto-trimmed)",
  etc: "PNG icon (typically 32×32; auto-trimmed)",
};

const PUBLISH_TARGET: Record<AssetType, string> = {
  hair: "Character.wz + String.wz",
  face: "Character.wz + String.wz",
  npc: "Npc.wz + String.wz + server tarball",
  etc: "Item.wz + String.wz + server tarball",
};

const STATUS_BADGE: Record<Asset["status"], string> = {
  ready: "bg-accent-blue/10 text-accent-blue",
  published: "bg-accent-green/10 text-accent-green",
  rejected: "bg-text-muted/10 text-text-muted",
};

export default function AssetsPage() {
  const [type, setType] = useState<AssetType>("hair");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nextIdSuggested, setNextIdSuggested] = useState<number | null>(null);
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);

  const [publishStatus, setPublishStatus] = useState<PublishStatus>({ status: "idle" });
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, idRes] = await Promise.all([
        fetch(`/api/admin/assets?type=${type}`),
        fetch(`/api/admin/assets/next-id?type=${type}&count=1`),
      ]);
      if (!listRes.ok) throw new Error((await listRes.json()).error || `HTTP ${listRes.status}`);
      const listData = await listRes.json();
      setAssets(listData.assets);

      if (idRes.ok) {
        const idData = await idRes.json();
        setNextIdSuggested(idData.suggested?.[0] ?? null);
        setRange(idData.range);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll publish status while running
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        const res = await fetch("/api/admin/assets/publish");
        if (!res.ok) return;
        const data: PublishStatus = await res.json();
        setPublishStatus(data);
        if (data.status !== "running" && timer) {
          clearInterval(timer);
          timer = null;
          setPublishing(false);
          load();
        }
      } catch {}
    };
    tick();
    if (publishing) {
      timer = setInterval(tick, 2000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [publishing, load]);

  const onPublish = async () => {
    if (
      !confirm(
        `Publish all ready assets across all types? Each affected WZ file (Character.wz, Npc.wz, Item.wz, String.wz, server tarball) gets patched and uploaded; the launcher version bumps and players redownload only the files that changed.`
      )
    )
      return;
    setPublishing(true);
    setPublishStatus({ status: "running", step: "Starting..." });
    try {
      const res = await fetch("/api/admin/assets/publish", { method: "POST" });
      if (!res.ok) {
        setPublishing(false);
        const data = await res.json().catch(() => ({}));
        alert(data.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      setPublishing(false);
      alert(e.message);
    }
  };

  const onReject = async (id: number) => {
    if (!confirm("Mark this asset as rejected? It will stay in the list but won't be published.")) return;
    const res = await fetch(`/api/admin/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    if (!res.ok) {
      alert((await res.json()).error || `HTTP ${res.status}`);
      return;
    }
    load();
  };

  const onDelete = async (id: number) => {
    if (!confirm("Delete this asset row? (R2 file remains; only the DB row is removed.)")) return;
    const res = await fetch(`/api/admin/assets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert((await res.json()).error || `HTTP ${res.status}`);
      return;
    }
    load();
  };

  const readyCount = assets.filter((a) => a.status === "ready").length;

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Custom Assets</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Stage hair/face <code className="rounded bg-bg-card px-1 text-xs">.img</code> blobs, NPC sprites, and ETC item icons.
            Publish patches the right WZ files ({PUBLISH_TARGET[type]}) and bumps the launcher manifest.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="rounded-lg border border-border bg-bg-card px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-card-hover"
          >
            Refresh
          </button>
          <button
            onClick={onPublish}
            disabled={publishing || readyCount === 0}
            className="rounded-lg border border-accent-gold bg-accent-gold/10 px-3 py-1.5 text-sm font-medium text-accent-gold hover:bg-accent-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
            title={readyCount === 0 ? "No ready assets to publish" : ""}
          >
            {publishing ? "Publishing…" : `Publish ${readyCount} ready`}
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setType(tab.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              type === tab.key
                ? "border-accent-gold bg-accent-gold/10 text-accent-gold"
                : "border-border text-text-secondary hover:border-border-light"
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {publishStatus.status === "running" && (
        <Card className="mb-4 border-accent-gold/30 bg-accent-gold/5">
          <p className="text-sm font-medium text-accent-gold">Publishing… {publishStatus.step}</p>
          {publishStatus.actions && publishStatus.actions.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-text-secondary">
                {publishStatus.actions.length} actions
              </summary>
              <ul className="mt-1 space-y-0.5 text-xs text-text-muted">
                {publishStatus.actions.slice(-10).map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      {publishStatus.status === "done" && publishStatus.finishedAt && (
        <Card className="mb-4 border-accent-green/30 bg-accent-green/5">
          <p className="text-sm text-accent-green">
            Published {publishStatus.assets_published} asset(s) — manifest now v{publishStatus.version}.
          </p>
        </Card>
      )}

      {publishStatus.status === "error" && (
        <Card className="mb-4 border-accent-red/30 bg-accent-red/5">
          <p className="text-sm text-accent-red">Publish failed: {publishStatus.error}</p>
        </Card>
      )}

      <UploadForm
        type={type}
        suggestedId={nextIdSuggested}
        range={range}
        onUploaded={load}
      />

      {error && (
        <Card className="mt-4 border-accent-red/30 bg-accent-red/5">
          <p className="text-sm text-accent-red">{error}</p>
        </Card>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : assets.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No {type} assets uploaded yet. Drop a {FILE_INPUT_ACCEPT[type].includes("png") ? "PNG" : ".img"} file above to start.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assets.map((a) => (
              <Card key={a.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {a.name || `${a.asset_type} ${a.in_game_id}`}
                    </p>
                    <p className="text-xs text-text-muted">
                      ID {a.in_game_id}
                      {a.source_version ? ` • from ${a.source_version}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[a.status]}`}>
                    {a.status}
                  </span>
                </div>
                {a.notes && <p className="text-xs text-text-secondary">{a.notes}</p>}
                <p className="text-[10px] text-text-muted">
                  {a.file_size ? `${(a.file_size / 1024).toFixed(1)} KB` : ""}
                  {a.uploaded_by ? ` • by ${a.uploaded_by}` : ""}
                </p>
                <div className="mt-1 flex gap-2">
                  {a.status === "ready" && (
                    <button
                      onClick={() => onReject(a.id)}
                      className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent-red/50 hover:text-accent-red"
                    >
                      Reject
                    </button>
                  )}
                  {a.status !== "published" && (
                    <button
                      onClick={() => onDelete(a.id)}
                      className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-accent-red/50 hover:text-accent-red"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UploadForm({
  type,
  suggestedId,
  range,
  onUploaded,
}: {
  type: AssetType;
  suggestedId: number | null;
  range: { start: number; end: number } | null;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [inGameId, setInGameId] = useState<string>("");
  const [name, setName] = useState("");
  const [sourceVersion, setSourceVersion] = useState("");
  const [uploadedBy, setUploadedBy] = useState("");
  const [notes, setNotes] = useState("");
  // NPC-only
  const [dialogue, setDialogue] = useState("");
  const [scriptName, setScriptName] = useState("");
  // ETC-only
  const [desc, setDesc] = useState("");
  const [slotMax, setSlotMax] = useState("");
  const [price, setPrice] = useState("");
  const [quest, setQuest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (suggestedId != null && inGameId === "") {
      setInGameId(String(suggestedId));
    }
  }, [suggestedId, inGameId]);

  // Auto-detect ID from a filename like "00030000.img" or "9901000.png"
  const onFile = (f: File) => {
    setFile(f);
    const m = f.name.match(/^0*(\d+)\.(img|png)$/i);
    if (m) setInGameId(m[1]);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const reset = () => {
    setFile(null);
    setName("");
    setNotes("");
    setDialogue("");
    setScriptName("");
    setDesc("");
    setSlotMax("");
    setPrice("");
    setQuest(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const expectedExt = FILE_INPUT_ACCEPT[type].includes("png") ? "PNG" : ".img";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      alert(`Pick a ${expectedExt} file first`);
      return;
    }
    const id = parseInt(inGameId, 10);
    if (!Number.isFinite(id)) {
      alert("Enter a numeric ID");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("in_game_id", String(id));
      fd.append("file", file);
      if (name.trim()) fd.append("name", name.trim());
      if (sourceVersion.trim()) fd.append("source_version", sourceVersion.trim());
      if (uploadedBy.trim()) fd.append("uploaded_by", uploadedBy.trim());
      if (notes.trim()) fd.append("notes", notes.trim());

      const attrs: Record<string, any> = {};
      if (type === "npc") {
        if (dialogue.trim()) attrs.dialogue = dialogue.trim();
        if (scriptName.trim()) attrs.script = scriptName.trim();
      } else if (type === "etc") {
        if (desc.trim()) attrs.desc = desc.trim();
        if (slotMax.trim()) attrs.slotMax = parseInt(slotMax, 10);
        if (price.trim()) attrs.price = parseInt(price, 10);
        if (quest) attrs.quest = 1;
      }
      if (Object.keys(attrs).length > 0) {
        fd.append("attrs", JSON.stringify(attrs));
      }

      const res = await fetch("/api/admin/assets", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      reset();
      onUploaded();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-dashed">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed py-8 text-sm transition ${
            dragOver
              ? "border-accent-gold bg-accent-gold/5 text-accent-gold"
              : "border-border text-text-secondary hover:border-border-light"
          }`}
        >
          {file ? (
            <>
              <p className="font-medium text-text-primary">{file.name}</p>
              <p className="text-xs text-text-muted">{(file.size / 1024).toFixed(1)} KB</p>
              <button
                type="button"
                onClick={reset}
                className="text-xs text-text-muted underline hover:text-text-secondary"
              >
                pick a different file
              </button>
            </>
          ) : (
            <>
              <p>Drop a {expectedExt} file here, or</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded border border-border bg-bg-card px-3 py-1 text-xs text-text-primary hover:bg-bg-card-hover"
              >
                Browse…
              </button>
              <p className="mt-1 text-xs text-text-muted">{FILE_HINT[type]}</p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={FILE_INPUT_ACCEPT[type]}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>
              {type} ID{" "}
              {range && (
                <span className="text-text-muted">({range.start}–{range.end})</span>
              )}
            </span>
            <input
              type="number"
              value={inGameId}
              onChange={(e) => setInGameId(e.target.value)}
              min={range?.start}
              max={range?.end}
              placeholder={suggestedId != null ? String(suggestedId) : ""}
              required
              className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>Name (optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                type === "npc"
                  ? "Royal Cosmetic Stylist"
                  : type === "etc"
                    ? "Royal Vote Shard"
                    : "Pink Twintails"
              }
              maxLength={255}
              className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>Source version</span>
            <input
              type="text"
              value={sourceVersion}
              onChange={(e) => setSourceVersion(e.target.value)}
              placeholder="GMS v95"
              maxLength={50}
              className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            <span>Uploaded by</span>
            <input
              type="text"
              value={uploadedBy}
              onChange={(e) => setUploadedBy(e.target.value)}
              placeholder="babieskye"
              maxLength={100}
              className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
            />
          </label>
        </div>

        {type === "npc" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span>
                Script name{" "}
                <span className="text-text-muted">(makes the NPC clickable; matches a server NPC script file)</span>
              </span>
              <input
                type="text"
                value={scriptName}
                onChange={(e) => setScriptName(e.target.value)}
                placeholder="RoyalStylist"
                pattern="[A-Za-z0-9_]*"
                className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span>Default dialogue (n0)</span>
              <input
                type="text"
                value={dialogue}
                onChange={(e) => setDialogue(e.target.value)}
                placeholder="Welcome to the Royal Salon..."
                maxLength={500}
                className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
              />
            </label>
          </div>
        )}

        {type === "etc" && (
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-text-secondary sm:col-span-4">
              <span>Description (optional)</span>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Used to redeem cosmetics at the Royal Salon."
                maxLength={500}
                className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span>Stack max (slotMax)</span>
              <input
                type="number"
                value={slotMax}
                onChange={(e) => setSlotMax(e.target.value)}
                placeholder="999"
                min={1}
                max={32767}
                className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              <span>Vendor price (mesos)</span>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                min={0}
                className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary sm:col-span-2">
              <span>Flags</span>
              <span className="flex items-center gap-2 rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={quest}
                  onChange={(e) => setQuest(e.target.checked)}
                  className="accent-accent-gold"
                />
                <span>Quest item (untradeable, stack-only)</span>
              </span>
            </label>
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything reviewers should know"
            className="rounded border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary focus:border-accent-gold focus:outline-none"
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy || !file}
            className="rounded-lg border border-accent-gold bg-accent-gold/10 px-4 py-1.5 text-sm font-medium text-accent-gold hover:bg-accent-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
    </Card>
  );
}
