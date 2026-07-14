/**
 * Minimal SSE frame parser for the `data: {...}\n\n` framing `/api/analyze`
 * emits. Browser-safe (no Node APIs) so it's shared verbatim between the
 * Next.js client (app/page.tsx) and the Chrome extension's background
 * worker, which both consume the same stream.
 */
export async function* parseSSEStream<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      yield JSON.parse(line.slice(5).trim()) as T;
    }
  }
}
