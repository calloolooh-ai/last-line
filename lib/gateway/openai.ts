import type { LLMProvider } from "@/lib/types";

/**
 * Stub adapter demonstrating that LLMProvider is a real, swappable interface —
 * not just Groq with extra steps. Not wired for the demo; throws clearly if
 * selected without a key rather than silently no-oping.
 */
export class OpenAIProvider implements LLMProvider {
  constructor(private readonly apiKey: string | undefined = process.env.OPENAI_API_KEY) {}

  async classify<T>(_args: {
    system: string;
    prompt: string;
    schema: unknown;
  }): Promise<T> {
    this.assertConfigured();
    throw new Error("OpenAIProvider.classify: not implemented in this MVP");
  }

  async *streamChat(_args: {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }): AsyncIterable<string> {
    this.assertConfigured();
    throw new Error("OpenAIProvider.streamChat: not implemented in this MVP");
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error(
        "OpenAIProvider is not configured (missing OPENAI_API_KEY). This adapter " +
          "exists to prove LLMProvider is swappable, not because it's wired for the demo."
      );
    }
  }
}
