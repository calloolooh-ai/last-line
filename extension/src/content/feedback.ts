/**
 * Lightweight local "this was wrong" feedback loop. Not a full retraining
 * system — just persistent per-signature suppression so a finding or claim
 * the user has already dismissed as a false positive stops re-flagging
 * identically, without ever leaving the browser (chrome.storage.local only).
 */

const STORAGE_KEY = "last-line-dismissed-signatures";

let cache: Set<string> | null = null;

async function load(): Promise<Set<string>> {
  if (cache) return cache;
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  cache = new Set<string>(stored[STORAGE_KEY] ?? []);
  return cache;
}

/** Deterministic, short signature for a finding or claim — same input always dismisses the same future match. */
export function signatureFor(...parts: string[]): string {
  const joined = parts.join("|");
  let hash = 0;
  for (let i = 0; i < joined.length; i++) {
    hash = (hash * 31 + joined.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

export async function isDismissed(signature: string): Promise<boolean> {
  const set = await load();
  return set.has(signature);
}

export async function markDismissed(signature: string): Promise<void> {
  const set = await load();
  set.add(signature);
  await chrome.storage.local.set({ [STORAGE_KEY]: Array.from(set) });
}
