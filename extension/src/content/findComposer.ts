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
  const observer = new MutationObserver(check);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
