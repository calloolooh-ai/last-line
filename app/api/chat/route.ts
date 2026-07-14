import { getLLM } from "@/lib/gateway";

export const runtime = "nodejs";

interface ChatRequestBody {
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}

/**
 * Streams the chat answer as plain text chunks. Deliberately separate from
 * /api/analyze — the answer must never wait on the firewall (see
 * ARCHITECTURE.md §4).
 */
export async function POST(req: Request) {
  const body = (await req.json()) as ChatRequestBody;

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response("messages is required", { status: 400 });
  }

  const llm = getLLM();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of llm.streamChat({ messages: body.messages })) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(`\n\n[stream error: ${err instanceof Error ? err.message : "unknown"}]`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
