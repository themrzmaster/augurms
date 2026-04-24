// Custom hair / face IDs live above the v83 stock ranges to avoid collisions
// with built-in WZ entries. Hair stock is 30000–39999, face is 20000–29999;
// our custom ranges sit one decade above each.
export const ASSET_RANGES = {
  hair: { start: 60000, end: 69999 },
  face: { start: 40000, end: 49999 },
} as const;

export type AssetType = keyof typeof ASSET_RANGES;
