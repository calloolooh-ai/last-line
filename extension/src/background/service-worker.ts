import { runAnalysis, type AnalyzeRequest } from "./analyze";

/**
 * The content script opens a long-lived Port named "analyze" per request and
 * posts one AnalyzeRequest into it. We stream AnalysisEvents back over the
 * same port as they arrive, then close it — mirrors the SSE shape the Next
 * app itself consumes (see lib/sse.ts).
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "analyze") return;

  port.onMessage.addListener((message: AnalyzeRequest) => {
    void runAnalysis(message, (event) => {
      try {
        port.postMessage(event);
      } catch {
        // Port closed on the content-script side (e.g. tab navigated away)
        // before the stream finished — nothing to do, just stop posting.
      }
    });
  });
});
