/**
 * Highlights verified claims directly inside the ChatGPT response DOM, so
 * risk is visible in place instead of only summarized in the side panel.
 *
 * Runs after the turn is stable (STABLE_MS has already elapsed by the time
 * callers have claims to highlight), so ChatGPT's own reconciliation is not
 * actively re-rendering this subtree — wrapping text nodes here does not
 * fight a live React tree the way injecting into the composer's still-active
 * form would.
 */

import type { VerifiedClaim } from "@/lib/types";

const VERDICT_COLOR: Record<VerifiedClaim["verdict"], string> = {
  verified: "#2f7a3d",
  unverified: "#a86a00",
  contradicted: "#b3261e",
};

const HIGHLIGHT_CLASS = "last-line-claim-highlight";

/** Finds the first text node whose content contains `needle`, splitting it so the match can be wrapped alone. */
function findAndWrapMatch(root: Element, needle: string, verdict: VerifiedClaim["verdict"]): boolean {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const idx = node.textContent?.indexOf(needle) ?? -1;
    if (idx === -1) continue;

    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + needle.length);

    const mark = document.createElement("mark");
    mark.className = HIGHLIGHT_CLASS;
    mark.style.background = "transparent";
    mark.style.color = "inherit";
    mark.style.borderBottom = `2px solid ${VERDICT_COLOR[verdict]}`;
    mark.title = `Last Line: ${verdict}`;

    try {
      range.surroundContents(mark);
      return true;
    } catch {
      // Range spans multiple elements (can't surroundContents) — skip this
      // claim rather than corrupt ChatGPT's own markup.
      return false;
    }
  }
  return false;
}

/** Removes any highlight marks from a previous analysis run on this element (re-analysis, or a claim that no longer applies). */
export function clearHighlights(root: Element): void {
  for (const mark of Array.from(root.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`))) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}

/** Highlights every claim's text in place within the response element. Best-effort: a claim whose exact text can't be found (paraphrased by rendering, split across nodes) is silently skipped. */
export function highlightClaims(root: Element, claims: VerifiedClaim[]): void {
  clearHighlights(root);
  // Longer claims first so a short claim's text isn't consumed as a
  // substring match before its longer, more specific sibling claim runs.
  const ordered = [...claims].sort((a, b) => b.text.length - a.text.length);
  for (const claim of ordered) {
    const needle = claim.text.trim();
    if (needle.length < 8) continue; // too short to safely match uniquely
    findAndWrapMatch(root, needle, claim.verdict);
  }
}
