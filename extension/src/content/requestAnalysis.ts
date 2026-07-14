import type { AnalysisEvent } from "@/lib/types";
import type { AnalyzeRequest } from "../background/analyze";

/** Content-script side of the analyze Port protocol (see service-worker.ts). */
export function requestAnalysis(
  input: AnalyzeRequest,
  onEvent: (event: AnalysisEvent) => void,
): void {
  let settled = false;
  const port = chrome.runtime.connect({ name: "analyze" });

  port.onMessage.addListener((event: AnalysisEvent) => {
    if (event.type === "done" || event.type === "error") settled = true;
    onEvent(event);
    if (settled) port.disconnect();
  });

  // If the background worker is killed/reloaded mid-stream, the port closes
  // without ever sending "done" or "error" — surface that instead of
  // leaving the panel stuck on "analyzing…" forever.
  port.onDisconnect.addListener(() => {
    if (!settled) onEvent({ type: "error", message: "Lost connection to the analysis worker." });
  });

  port.postMessage(input);
}
