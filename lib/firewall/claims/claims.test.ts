import { describe, it, expect, vi } from "vitest";
import { extractClaims } from "@/lib/firewall/claims";
import type { LLMProvider } from "@/lib/types";

function makeLLM(classifyImpl: LLMProvider["classify"]): LLMProvider {
  return {
    classify: classifyImpl,
    streamChat: async function* () {
      yield "";
    },
  };
}

describe("extractClaims", () => {
  it("returns [] for creative/chit-chat text", async () => {
    const llm = makeLLM(vi.fn().mockResolvedValue({ claims: [] }));
    const result = await extractClaims("Once upon a time, in a land of dreams...", llm);
    expect(result).toEqual([]);
  });

  it("returns [] (not a throw) when the LLM rejects", async () => {
    const llm = makeLLM(vi.fn().mockRejectedValue(new Error("provider down")));
    await expect(extractClaims("Some response text.", llm)).resolves.toEqual([]);
  });

  it("returns [] for empty input without calling the LLM", async () => {
    const classify = vi.fn();
    const llm = makeLLM(classify);
    const result = await extractClaims("   ", llm);
    expect(result).toEqual([]);
    expect(classify).not.toHaveBeenCalled();
  });

  it("extracts decontextualized claims with stable ids and computed isSpecific", async () => {
    const llm = makeLLM(
      vi.fn().mockResolvedValue({
        claims: [
          { text: "Nikola Tesla was born in 1856." },
          { text: "Cats are generally independent animals." },
        ],
      })
    );
    const result = await extractClaims(
      "He was born in 1856. Cats are generally independent animals.",
      llm
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "claim-0",
      text: "Nikola Tesla was born in 1856.",
      isSpecific: true,
    });
    expect(result[1].id).toBe("claim-1");
    expect(result[1].isSpecific).toBe(false);
  });

  it("filters out empty-text claims returned by the model", async () => {
    const llm = makeLLM(
      vi.fn().mockResolvedValue({
        claims: [{ text: "" }, { text: "  " }, { text: "Paris is the capital of France." }],
      })
    );
    const result = await extractClaims("some text", llm);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Paris is the capital of France.");
  });

  it("returns [] when the model result is malformed", async () => {
    const llm = makeLLM(vi.fn().mockResolvedValue({ notClaims: true } as never));
    const result = await extractClaims("some text", llm);
    expect(result).toEqual([]);
  });
});
