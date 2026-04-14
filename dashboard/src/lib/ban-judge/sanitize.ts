// Wrap player-controlled strings so the model treats them as data, not instructions.
// cheat_flags.details, reports.chatlog, character names — any field a hacker can write.

const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function sanitize(raw: unknown, maxLen = 500): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).replace(CONTROL_CHARS, "").slice(0, maxLen);
  // Neutralize closing tag so a player can't escape the wrapper.
  return s.replace(/<\/?untrusted_player_input>/gi, "[TAG_STRIPPED]");
}

export function wrapUntrusted(raw: unknown, maxLen = 500): string {
  const clean = sanitize(raw, maxLen);
  if (!clean) return "<untrusted_player_input></untrusted_player_input>";
  return `<untrusted_player_input>${clean}</untrusted_player_input>`;
}

// Walk an object and wrap the named keys in place. Mutates a copy and returns it.
export function wrapFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[],
  maxLen = 500
): T {
  const out: any = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const f of fields) {
    if (out[f] !== undefined && out[f] !== null) {
      out[f] = wrapUntrusted(out[f], maxLen);
    }
  }
  return out;
}
