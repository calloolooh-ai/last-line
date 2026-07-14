/**
 * Claim extraction — turns an assistant response into a list of discrete,
 * self-contained, independently checkable factual assertions.
 *
 * Pure over its injected LLMProvider. No network calls of its own, no Prisma,
 * no Next. NEVER THROWS: any LLM failure degrades to an empty claim list,
 * which downstream (score/index.ts) is treated as "nothing factual to check"
 * rather than an error.
 */

import { z } from "zod";
import type { Claim, LLMProvider } from "@/lib/types";

const EXTRACTION_SYSTEM_PROMPT = `You extract factual claims from an AI assistant's response so they can be
independently fact-checked against external sources.

A claim is a single, self-contained, checkable factual assertion. Rules:

1. DECONTEXTUALIZE every claim. Resolve pronouns and implicit references so each
   claim stands alone. "He was born in 1856" is useless in isolation — rewrite it
   as "Nikola Tesla was born in 1856" using context from the rest of the response.
2. Split compound sentences into separate atomic claims when they assert more than
   one fact.
3. DO NOT extract: opinions ("I think X is great"), hedged statements ("X might be
   true", "possibly", "I'm not sure but"), questions, instructions or requests,
   code snippets, or purely creative/fictional content.
4. If the response contains no checkable factual assertions at all (e.g. it's a
   poem, a chit-chat reply, a piece of code, or pure opinion), return an empty
   claims array. This is the correct output for most creative or conversational
   text — do not force claims out of it.
5. Each claim's "text" field must be the full decontextualized sentence, not a
   fragment.

Return only claims that a reasonable person could look up and confirm or refute.`;

const claimsSchema = z.object({
  claims: z.array(
    z.object({
      text: z.string().min(1),
    })
  ),
});

type ExtractionResult = z.infer<typeof claimsSchema>;

/**
 * A claim "looks specific" when it contains a number, a date, or what's likely a
 * named entity (a capitalized multi-word run). Unsourced specifics are the
 * primary hallucination tell, so we compute this deterministically instead of
 * trusting the model's self-report.
 */
function computeIsSpecific(text: string): boolean {
  const hasNumber = /\d/.test(text);
  const hasNamedEntity = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(text);
  // A single capitalized word mid-sentence (not just sentence-initial) also
  // suggests a proper noun, e.g. "Tesla" or "Paris".
  const words = text.split(/\s+/);
  const hasMidSentenceCapital = words
    .slice(1)
    .some((w) => /^[A-Z][a-z]{2,}/.test(w));
  return hasNumber || hasNamedEntity || hasMidSentenceCapital;
}

export async function extractClaims(
  responseText: string,
  llm: LLMProvider
): Promise<Claim[]> {
  const trimmed = responseText.trim();
  if (!trimmed) return [];

  try {
    const result = await llm.classify<ExtractionResult>({
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: trimmed,
      schema: claimsSchema,
    });

    if (!result || !Array.isArray(result.claims)) return [];

    return result.claims
      .filter((c) => typeof c.text === "string" && c.text.trim().length > 0)
      .map((c, i) => ({
        id: `claim-${i}`,
        text: c.text.trim(),
        isSpecific: computeIsSpecific(c.text),
      }));
  } catch {
    // Never throw — an LLM outage degrades to "no claims found", not a crash.
    return [];
  }
}
