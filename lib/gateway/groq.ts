import { createGroq } from "@ai-sdk/groq";
import { generateObject, streamText } from "ai";
import type { z } from "zod";
import type { LLMProvider } from "@/lib/types";
import { CHAT_MODEL, FAST_MODEL } from "@/lib/gateway/models";

/**
 * Groq-backed implementation of LLMProvider. Two-tier: FAST_MODEL for every
 * firewall internal call (classify), CHAT_MODEL for the user-facing answer
 * (streamChat). See ARCHITECTURE.md §2 for why Groq is load-bearing here.
 */
export class GroqProvider implements LLMProvider {
  private readonly groq: ReturnType<typeof createGroq>;

  constructor(apiKey?: string) {
    this.groq = createGroq({
      apiKey: apiKey ?? process.env.GROQ_API_KEY,
    });
  }

  async classify<T>(args: {
    system: string;
    prompt: string;
    schema: unknown;
  }): Promise<T> {
    const { object } = await generateObject({
      model: this.groq(FAST_MODEL),
      system: args.system,
      prompt: args.prompt,
      schema: args.schema as z.ZodType<T>,
    });
    return object;
  }

  async *streamChat(args: {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }): AsyncIterable<string> {
    const { textStream } = streamText({
      model: this.groq(CHAT_MODEL),
      messages: args.messages,
    });
    for await (const delta of textStream) {
      yield delta;
    }
  }
}
