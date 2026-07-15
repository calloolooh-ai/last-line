/**
 * Detects a finished ChatGPT assistant turn and pairs it with the user
 * message that prompted it.
 *
 * ChatGPT tags every turn with `data-message-author-role="user"|"assistant"`
 * — that attribute has been stable across ChatGPT's UI redesigns and is the
 * hook other extensions rely on too, so it's the least-fragile selector
 * available. There's no equally stable "generation finished" event exposed
 * to the DOM (the stop-generating button's testid changes across releases),
 * so "done" is inferred from the assistant turn's content going idle — no
 * mutations inside it for STABLE_MS. That's a heuristic, not a hook into
 * ChatGPT's internal state, and is the one part of this adapter that will
 * need re-tuning if ChatGPT's rendering cadence changes.
 */

const STABLE_MS = 1200;
const MESSAGE_SELECTOR = "[data-message-author-role]";

export interface CapturedTurn {
  prompt: string;
  response: string;
  messageId: string;
  /** The live assistant message element, so callers can highlight risky spans in place. */
  element: Element;
}

function textOf(el: Element): string {
  return (el.textContent ?? "").trim();
}

/**
 * Walks backward through document order across ALL message elements (not
 * `previousElementSibling`) to find the user turn preceding this assistant
 * turn. ChatGPT nests each turn in its own wrapper rather than laying user
 * and assistant messages out as flat DOM siblings, so a sibling-only walk
 * never reaches back far enough and silently returns null forever.
 */
function findPrecedingUserMessage(assistantEl: Element): string | null {
  const all = document.querySelectorAll(MESSAGE_SELECTOR);
  const idx = Array.prototype.indexOf.call(all, assistantEl);
  if (idx === -1) return null;
  for (let i = idx - 1; i >= 0; i--) {
    const el = all[i];
    if (el.getAttribute("data-message-author-role") === "user") {
      return textOf(el);
    }
  }
  return null;
}

export function watchForFinishedTurns(onTurn: (turn: CapturedTurn) => void): () => void {
  const processed = new WeakSet<Element>();
  const pending = new Map<Element, ReturnType<typeof setTimeout>>();

  function scheduleCheck(assistantEl: Element) {
    if (processed.has(assistantEl)) return;

    const existing = pending.get(assistantEl);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      pending.delete(assistantEl);
      if (processed.has(assistantEl) || !assistantEl.isConnected) return;

      const response = textOf(assistantEl);
      if (!response) return;

      const prompt = findPrecedingUserMessage(assistantEl);
      if (!prompt) return;

      processed.add(assistantEl);
      onTurn({
        prompt,
        response,
        messageId:
          assistantEl.getAttribute("data-message-id") ??
          `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        element: assistantEl,
      });
    }, STABLE_MS);

    pending.set(assistantEl, timer);
  }

  // ChatGPT's page fires this observer constantly (streaming text, telemetry,
  // unrelated re-renders elsewhere on the page) — buffering mutation records
  // and processing them at most once per animation frame keeps the
  // closest()/querySelectorAll() work below from running on every single
  // microtask-batched callback, which was adding to overall main-thread
  // contention during typing/streaming.
  let bufferedMutations: MutationRecord[] = [];
  let scheduled = false;
  const processBuffered = () => {
    scheduled = false;
    const mutations = bufferedMutations;
    bufferedMutations = [];
    for (const mutation of mutations) {
      const target =
        mutation.target instanceof Element ? mutation.target.closest(MESSAGE_SELECTOR) : null;
      if (target && target.getAttribute("data-message-author-role") === "assistant") {
        scheduleCheck(target);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        const assistantEls =
          node.getAttribute("data-message-author-role") === "assistant"
            ? [node]
            : Array.from(node.querySelectorAll('[data-message-author-role="assistant"]'));
        for (const el of assistantEls) scheduleCheck(el);
      }
    }
  };

  const observer = new MutationObserver((mutations) => {
    bufferedMutations.push(...mutations);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(processBuffered);
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  return () => {
    observer.disconnect();
    for (const timer of pending.values()) clearTimeout(timer);
  };
}
