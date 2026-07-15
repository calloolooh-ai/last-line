/**
 * Locates ChatGPT's prompt composer. `#prompt-textarea` is the contenteditable
 * div ChatGPT has used for its composer since the Nov 2023 UI redesign — it's
 * the most stable hook available, but DOM-scraping is inherently fragile to
 * upstream markup changes (see ARCHITECTURE plan's verification notes). The
 * generic contenteditable fallback exists so a selector-only change doesn't
 * silently kill the extension.
 */
export function findComposer(): HTMLElement | null {
  const byId = document.querySelector<HTMLElement>("#prompt-textarea");
  if (byId) return byId;

  const fallback = document.querySelector<HTMLElement>(
    'form [contenteditable="true"], form textarea',
  );
  return fallback;
}

/** Resolves once the composer first appears, then keeps calling back on remounts (ChatGPT replaces it on navigation between conversations). */
export function watchForComposer(onFound: (el: HTMLElement) => void): () => void {
  let current: HTMLElement | null = null;

  const check = () => {
    const el = findComposer();
    if (el && el !== current) {
      current = el;
      onFound(el);
    }
  };

  check();

  // ChatGPT's page generates a constant flood of unrelated DOM mutations
  // (streaming text, telemetry, decorations) — observing document.body's
  // whole subtree means this callback fires on every single one of them.
  // Coalescing to at most once per animation frame keeps findComposer()'s
  // querySelector off the hot path of every keystroke/mutation instead of
  // running it hundreds of times a second, which was starving React's own
  // render of the composer overlay badge.
  let scheduled = false;
  const scheduleCheck = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      check();
    });
  };

  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
