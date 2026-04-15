# Web client (browser WASM) — remaining work

Context: `web-client/` hosts the browser-playable MapleStory WASM client. Users visit
`https://play.augurms.com`, the page serves static HTML + WASM + a combined WebSocket
TCP proxy (to the augur-ms-game Fly app at 213.188.212.103:8484). NX game assets stream
from Cloudflare R2 at `https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev/nx/` via
HTTPS Range requests cached in the browser's IndexedDB.

## What's done

- [x] All 16 NX files uploaded to R2 under `nx/` prefix (~4.2 GB, free tier).
- [x] R2 bucket CORS configured for `http://localhost:8000`, `augurms.com`, `play.augurms.com`.
- [x] WASM client rewritten to fetch chunks via HTTPS Range when `NxBaseUrl` is set
  (`src/client/LazyFS/lazyfs.js`). WebSocket path preserved as fallback. Committed to
  `themrzmaster/maplestory-wasm@master` (SHA `cde7764`).
- [x] Augur-branded loading screen (`web/index.html`) with foreground prefetch of
  ~108 MB of NX metadata before WASM boots, plus a corner indicator driving a
  background prefill that caches the remaining ~4.1 GB while the user plays.
- [x] Combined aiohttp static + WS TCP proxy (`web-client/server.py`). Target allow-list
  covers augur login + 3 channels. Single port (8080).
- [x] First Fly deploy using artifact-copy approach. App running at
  `https://augur-ms-web.fly.dev` (machine id `1851d7dc295d38`, iad, shared-cpu-1x@256MB).
- [x] Submodule `web-client/vendor/maplestory-wasm` pinned at `cde7764`.
- [x] Multi-stage Dockerfile: emscripten/emsdk builds WASM from the submodule, then
  python:3.11-slim runtime copies the artifacts + `config.prod.json → config.json`.
- [x] `deploy-web` job in `.github/workflows/deploy.yml` with `submodules: recursive`.
  Dispatch via `gh workflow run deploy.yml -f web=true`.

- [x] Local Dockerfile build verified end-to-end (`docker build -t augur-ms-web:submodule .`
  → full emscripten compile ~26 s; runtime container serves `/healthz`, `/`,
  `/web/config.json`, and `/build/JourneyClient.{js,wasm}` with correct content types).
  Dropped the `apt-get install git` step — not needed (CMake doesn't invoke git, and
  the source is COPY'd in, not cloned).

## What's left (in order)

### 1. DNS + TLS for `play.augurms.com`

Nothing here requires my code — it's all user actions in Cloudflare + one flyctl call.

1. Cloudflare DNS: add record
   - Type: CNAME
   - Name: `play`
   - Target: `augur-ms-web.fly.dev`
   - Proxy: orange cloud ON (Cloudflare terminates TLS, passes to Fly; WebSockets
     work on Cloudflare free plan)
2. Fly cert:
   ```
   flyctl certs create play.augurms.com --app augur-ms-web
   flyctl certs check play.augurms.com --app augur-ms-web
   ```
   Wait until "Certificate Status: Ready".
3. Browse `https://play.augurms.com/`. Loading screen should appear → prefetch →
   login.

### 2. WZ → NX conversion workflow  *(task #6 in the task board)*

Right now the NX files in R2 are static: last regenerated manually from
`maplestory-wasm/assets/`. Every time the dashboard's `/api/admin/items/publish`
endpoint repacks `Character.wz` / `String.wz` and re-uploads them to R2, the matching
`.nx` in R2 becomes stale for the browser client.

Plan:
- New workflow `.github/workflows/wz-to-nx.yml` in augurms.
- Triggers: `repository_dispatch` (type `wz-to-nx`) + `workflow_dispatch` (manual).
- Steps:
  1. Install `rclone` or AWS CLI, point at R2 S3-compat endpoint with the existing
     `R2_ACCESS_KEY` / `R2_SECRET_KEY` / `R2_ENDPOINT` secrets (already in GH).
  2. Download the 12 client WZ files from R2 to a scratch dir.
  3. Build `scripts/wz-converter/Dockerfile` from `themrzmaster/maplestory-wasm`
     (already headless, debian:bookworm-slim + g++ + NoLifeWzToNx). Run it over
     the scratch dir.
  4. Upload the resulting `.nx` files to `nx/` in R2. **CRITICAL: skip `UI.nx`**
     — the v83 `UI.wz` converts to a UI.nx without login fields (known-broken);
     the v154+ `UI.nx` must stay as-is. Either skip the input or drop the output.
  5. Concurrency group to prevent overlapping runs.
- Expected runtime: 30–60 min on free GHA runner.

### 3. Wire publish → conversion trigger  *(task #7)*

In `dashboard/src/app/api/admin/items/publish/route.ts`, after the final R2 upload of
the patched WZ files (around line 586 per the exploration), dispatch the `wz-to-nx`
workflow:

```ts
await fetch(
  'https://api.github.com/repos/themrzmaster/augurms/dispatches',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GH_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ event_type: 'wz-to-nx' }),
  }
);
```

Same token used by `delegate_code_change` (GH_DISPATCH_TOKEN); already has
`actions:write`. Add rate-limiting (e.g. debounce to once per 10 min) to prevent
conversion storms. Mirror the same dispatch in the GM tool
`publish_client_update` (`dashboard/src/lib/gamemaster/engine.ts`).

### 4. Monitoring + ops polish  *(nice-to-have)*

- Add `/healthz` to Fly health check (already done via `[[http_service.checks]]`).
- Log WS proxy target rejections separately for abuse metrics.
- Consider a `/metrics` endpoint exposing R2 hit ratio from LazyFS stats.
- Decide on Cloudflare cache-control headers for `/build/JourneyClient.wasm` — right
  now aiohttp sends `no-store` by default which defeats CDN caching.

## Gotchas captured this session

- **Wrangler CLI caps single-PUT at 300 MiB**. Use the dashboard's `uploadFileToR2`
  (in `dashboard/src/lib/r2.ts`) with UNSIGNED-PAYLOAD for big files — or
  `dashboard/scripts/upload-nx-r2.ts` already written for this.
- **CMake + `--pre-js`**: changes to `lazyfs.js` don't invalidate the build without the
  `set_target_properties(JourneyClient PROPERTIES LINK_DEPENDS …)` line added in
  `src/client/CMakeLists.txt`. Already upstreamed to maplestory-wasm master.
- **IndexedDB cache keys include chunk size**: prevents stale chunks from a previous
  build leaking oversized data into a new read and overflowing the result buffer.
  Format: `${filename}:v${etag}:c${chunkSize}:${chunkIndex}`. The prefetcher must
  match this format exactly.
- **UI.nx is v154+**, unlike every other NX file (which is v83). Do NOT regenerate
  UI.nx from v83 UI.wz — the result has no login fields and the browser can't log in.
- **Port 443 in WebSocket URL**: `wss://play.augurms.com:443/` works. The C++ URL
  builder always appends `:port`; 443 is harmless with `wss://`.
- **Fly `--ha=false`** pins one machine. Remove if you want multi-region failover.
