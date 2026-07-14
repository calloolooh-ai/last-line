import type { LLMProvider } from "@/lib/types";
import { GroqProvider } from "@/lib/gateway/groq";
import { OpenAIProvider } from "@/lib/gateway/openai";

/**
 * Deterministic offline provider. Used in tests and as the last-resort fallback
 * so the demo never hard-fails just because GROQ_API_KEY is missing on stage.
 */
export class MockLLMProvider implements LLMProvider {
  async classify<T>(args: { system: string; prompt: string; schema: unknown }): Promise<T> {
    // Best-effort deterministic stub: firewall callers only rely on shape via
    // their own zod schemas at the call site, so we return a minimal, honest
    // "nothing detected" object. Callers that need specific shapes should
    // prefer injecting their own provider in tests rather than relying on this.
    void args;
    return {} as T;
  }

  async *streamChat(args: {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }): AsyncIterable<string> {
    const last = args.messages[args.messages.length - 1];
    const canned =
      `[offline demo mode — no GROQ_API_KEY configured] ` +
      `I can't reach Groq right now, but here's a canned response so the UI keeps working. ` +
      `You asked: "${last?.content ?? ""}".`;
    const words = canned.split(" ");
    for (const word of words) {
      yield word + " ";
    }
  }
}

/**
 * Selects the LLM provider by env `LLM_PROVIDER` (default "groq"). Falls back
 * to MockLLMProvider when the selected provider has no API key configured, so
 * the demo never hard-fails on a missing key.
 *
 * Deliberately uncached — construction is cheap (just wraps an SDK factory
 * call) and re-reading env on every call keeps this testable and hot-reload
 * safe.
 */
export function getLLM(): LLMProvider {
  const selected = (process.env.LLM_PROVIDER ?? "groq").toLowerCase();

  if (selected === "openai") {
    if (!process.env.OPENAI_API_KEY) return new MockLLMProvider();
    return new OpenAIProvider();
  }

  // default: groq
  if (!process.env.GROQ_API_KEY) return new MockLLMProvider();
  return new GroqProvider();
}
