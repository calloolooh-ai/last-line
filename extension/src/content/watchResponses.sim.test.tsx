import { describe, it, expect, beforeEach } from "vitest";
import { watchForFinishedTurns } from "./watchResponses";

describe("watchForFinishedTurns against nested (non-sibling) turn wrappers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds the preceding user message even when each turn is wrapped in its own container (real ChatGPT structure)", async () => {
    // Real ChatGPT nests each turn in its own <article>-like wrapper rather
    // than laying user/assistant messages out as flat siblings - this
    // reproduces that shape (the bug: previousElementSibling from the
    // assistant div never reaches the user div, because they're each
    // wrapped one level deep in separate turn containers).
    document.body.innerHTML = `
      <div id="conversation">
        <div class="turn-wrapper">
          <div data-message-author-role="user">what's 2+2?</div>
        </div>
        <div class="turn-wrapper">
          <div data-message-author-role="assistant" id="assistant-turn">4</div>
        </div>
      </div>
    `;

    const captured: { prompt: string; response: string }[] = [];
    watchForFinishedTurns((turn) => captured.push(turn));

    // Trigger detection by touching the assistant node (simulates the
    // MutationObserver firing on ChatGPT's own streaming updates).
    const assistant = document.getElementById("assistant-turn")!;
    assistant.textContent = "4";
    assistant.dispatchEvent(new Event("dummy"));
    // Force a mutation so the observer's callback runs.
    assistant.setAttribute("data-touch", "1");

    await new Promise((r) => setTimeout(r, 1400));

    expect(captured).toHaveLength(1);
    expect(captured[0].prompt).toBe("what's 2+2?");
    expect(captured[0].response).toBe("4");
  });
});
