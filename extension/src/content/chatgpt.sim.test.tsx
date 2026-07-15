import { describe, it, expect, vi, beforeEach } from "vitest";

// jsdom has no `chrome` global — stub just enough of the runtime.connect
// port protocol for requestAnalysis() not to throw.
(globalThis as any).chrome = {
  runtime: {
    connect: () => ({
      onMessage: { addListener: () => {} },
      onDisconnect: { addListener: () => {} },
      postMessage: () => {},
      disconnect: () => {},
    }),
  },
};

function realComposerMarkup() {
  // Exact markup the user pasted from a live chatgpt.com page.
  return `
    <form>
      <div contenteditable="true" autocomplete="off" inputmode="text" autocorrect="on"
           autocapitalize="sentences" spellcheck="true" translate="no" class="ProseMirror"
           id="prompt-textarea" data-virtualkeyboard="true" role="textbox" aria-multiline="true"
           aria-label="Chat with ChatGPT">
        <p data-empty-paragraph="true" data-placeholder="Ask anything" class="placeholder">
          <br class="ProseMirror-trailingBreak">
        </p>
      </div>
    </form>
  `;
}

describe("content script against a simulated chatgpt.com DOM", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = realComposerMarkup();
  });

  it("mounts the panel host and composer overlay host on load", async () => {
    await import("./chatgpt");
    // MutationObserver callbacks + microtasks need a tick to flush.
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector("#last-line-panel-host")).not.toBeNull();
    expect(document.querySelector("#last-line-composer-overlay-host")).not.toBeNull();
  });

  it("shows a badge in the composer overlay shadow root when a secret is typed", async () => {
    await import("./chatgpt");
    await new Promise((r) => setTimeout(r, 0));

    const composer = document.querySelector<HTMLElement>("#prompt-textarea")!;
    const overlayHost = document.querySelector("#last-line-composer-overlay-host")!;
    const shadow = overlayHost.shadowRoot!;

    // Before typing: overlay renders null (React still leaves its empty <div>
    // mount point in the shadow root, so "no badge" means no text/no findings,
    // not an empty shadow root).
    expect(shadow.textContent?.trim()).toBe("");

    // Type a long random high-entropy string (same case the user tested).
    composer.textContent = "xK92mQp7vLwRt3nYb5cZ8hJf1sDg";
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(shadow.innerHTML).toMatch(/secret/i);
  });

  it("does NOT show a badge for ordinary short text (regression guard)", async () => {
    await import("./chatgpt");
    await new Promise((r) => setTimeout(r, 0));

    const composer = document.querySelector<HTMLElement>("#prompt-textarea")!;
    const overlayHost = document.querySelector("#last-line-composer-overlay-host")!;
    const shadow = overlayHost.shadowRoot!;

    composer.textContent = "hello, how are you today?";
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(shadow.textContent?.trim()).toBe("");
  });

  it("becomes visible after a NEW user+assistant turn is added to the DOM post-mount", async () => {
    await import("./chatgpt");
    await new Promise((r) => setTimeout(r, 0));

    const panelHost = document.querySelector("#last-line-panel-host")!;
    const shadow = panelHost.shadowRoot!;
    expect(shadow.textContent?.trim()).toBe(""); // not visible yet

    // Simulate ChatGPT inserting a fresh user message, then (after a delay,
    // as real streaming does) the assistant's finished response.
    const user = document.createElement("div");
    user.setAttribute("data-message-author-role", "user");
    user.textContent = "what's 2+2?";
    document.body.appendChild(user);
    await new Promise((r) => setTimeout(r, 0));

    const assistant = document.createElement("div");
    assistant.setAttribute("data-message-author-role", "assistant");
    assistant.textContent = "4";
    document.body.appendChild(assistant);

    // watchForFinishedTurns waits STABLE_MS (1200ms) of no further mutation
    // inside the assistant node before firing "turn finished".
    await new Promise((r) => setTimeout(r, 1400));

    expect(shadow.innerHTML).toMatch(/Last Line/);
  });

  it("does NOT treat pre-existing history (already in DOM before mount) as a new turn", async () => {
    // This reproduces what the user actually observed: 2 pre-existing
    // data-message-author-role nodes from old chat history were present
    // BEFORE the content script ran, and the panel never appeared.
    const user = document.createElement("div");
    user.setAttribute("data-message-author-role", "user");
    user.textContent = "old question";
    document.body.appendChild(user);

    const assistant = document.createElement("div");
    assistant.setAttribute("data-message-author-role", "assistant");
    assistant.textContent = "old answer";
    document.body.appendChild(assistant);

    await import("./chatgpt");
    await new Promise((r) => setTimeout(r, 1400));

    const panelHost = document.querySelector("#last-line-panel-host")!;
    const shadow = panelHost.shadowRoot!;
    // Confirms the bug: pre-existing messages never trigger the MutationObserver,
    // so startAnalysis() never fires and the panel stays invisible.
    expect(shadow.textContent?.trim()).toBe("");
  });
});
