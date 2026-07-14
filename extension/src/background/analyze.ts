import { parseSSEStream } from "@/lib/sse";
import type { AnalysisEvent } from "@/lib/types";

const ANALYZE_URL = "https://last-line-two.vercel.app/api/analyze";

export interface AnalyzeRequest {
  prompt: string;
  response: string;
  messageId: string;
}

/**
 * Runs on the background service worker, not the content script — content
 * scripts share the host page's CSP in some Chrome versions, which can
 * silently block a fetch() to an external domain. The background worker has
 * no such restriction.
 */
export async function runAnalysis(
  input: AnalyzeRequest,
  onEvent: (event: AnalysisEvent) => void,
): Promise<void> {
  try {
    const res = await fetch(ANALYZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok || !res.body) {
      onEvent({ type: "error", message: `/api/analyze returned ${res.status}` });
      return;
    }

    for await (const event of parseSSEStream<AnalysisEvent>(res.body)) {
      onEvent(event);
    }
  } catch (err) {
    onEvent({
      type: "error",
      message: err instanceof Error ? err.message : "Could not reach the analysis server.",
    });
  }
}
