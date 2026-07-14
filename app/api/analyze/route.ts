import { getLLM } from "@/lib/gateway";
import { getSearch } from "@/lib/providers/tavily";
import { getCache } from "@/lib/cache";
import { streamFirewall } from "@/lib/firewall/graph";

export const runtime = "nodejs";

interface AnalyzeRequestBody {
  prompt: string;
  response: string;
  messageId: string;
  modelConfidence?: number;
}

/**
 * The Chrome extension calls this cross-origin from a `chrome-extension://`
 * origin. Those origins are per-install (no fixed value to allowlist ahead
 * of time), so we echo back any `chrome-extension://` Origin rather than
 * using a static allowlist. This endpoint takes no cookies/credentials and
 * returns nothing sensitive beyond the analysis itself, so reflecting the
 * origin here doesn't expose anything a same-origin caller couldn't already
 * get.
 */
function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin");
  if (origin && origin.startsWith("chrome-extension://")) {
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  return {};
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * Streams firewall AnalysisEvents as Server-Sent Events so the
 * Explainability Panel fills in progressively. A separate stream from
 * /api/chat by design — see ARCHITECTURE.md §4.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as AnalyzeRequestBody;

  if (!body.prompt || !body.response || !body.messageId) {
    return new Response("prompt, response, and messageId are required", { status: 400 });
  }

  const deps = { llm: getLLM(), search: getSearch(), cache: getCache() };
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamFirewall(body, deps)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Firewall analysis failed.";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders(req),
    },
  });
}
