// ID ranges for custom assets, kept clear of v83 stock IDs and aligned with
// the widened ItemConstants.isFace/isHair classifiers PR #4 introduces:
//   isHair  = id/10000 ∈ {3,4,6,7}    →  custom hair lives in 6xxxx
//   isFace  = id/10000 ∈ {2,5}        →  custom face lives in 5xxxx
//
//   hair: stock is 30000–34999 → custom 60000–69999
//   face: stock is 20000–21999 → custom 50000–59999
//   npc:  stock tops out around 9_300_000 → custom 9_901_000–9_901_999
//   etc:  4090.img bucket is empty in v83 → 4_090_000–4_090_999
//
// Note: 40000–49999 is *also* classified as hair after PR #4, so it is NOT
// safe to use for face IDs even though it sits above the v83 face range.
export const ASSET_RANGES = {
  hair: { start: 60000, end: 69999 },
  face: { start: 50000, end: 59999 },
  npc: { start: 9901000, end: 9901999 },
  etc: { start: 4090000, end: 4090999 },
} as const;

export type AssetType = keyof typeof ASSET_RANGES;
