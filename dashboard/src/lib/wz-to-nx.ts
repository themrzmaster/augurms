// Fire-and-forget dispatch of the `wz-to-nx` GitHub Actions workflow.
// Called after a publish endpoint uploads patched WZ file(s) to R2 so the
// browser client at play.augurms.com picks up fresh .nx files.
//
// Intentionally non-blocking: publish endpoints should not fail or stall if
// the dispatch can't reach GitHub. The workflow's own concurrency group
// coalesces rapid successive dispatches into a single active + single queued
// run, so spamming this is safe.

const GH_OWNER = "themrzmaster";
const GH_REPO = "augurms";
const GH_WORKFLOW = "wz-to-nx.yml";
// We deliberately use the workflow_dispatch endpoint, not repository_dispatch
// (`POST /repos/.../dispatches`). Fine-grained PATs need `Contents: write` for
// repository_dispatch but only `Actions: write` for workflow_dispatch — and
// the only scope GH_DISPATCH_TOKEN carries is `actions:write`. The previous
// `/dispatches` call returned 403 silently, so every publish quietly failed
// to refresh the NX files for play.augurms.com.

export async function dispatchWzToNx(files: string[]): Promise<void> {
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    console.warn("[wz-to-nx] GH_DISPATCH_TOKEN not set — skipping dispatch");
    return;
  }
  if (!Array.isArray(files) || files.length === 0) {
    console.warn("[wz-to-nx] no files to dispatch");
    return;
  }
  try {
    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        // Workflow expects a single space-separated string in `inputs.files`
        // (see .github/workflows/wz-to-nx.yml) — must match that contract.
        inputs: { files: files.join(" ") },
      }),
    });
    if (res.ok) {
      console.log(`[wz-to-nx] dispatched for: ${files.join(", ")}`);
    } else {
      console.warn(`[wz-to-nx] dispatch failed (${res.status}): ${await res.text().catch(() => "")}`);
    }
  } catch (err: any) {
    console.warn(`[wz-to-nx] dispatch error: ${err?.message || err}`);
  }
}
