import { describe, it, expect, vi } from "vitest";
import { verifyClaim, verifyClaims } from "@/lib/firewall/verify";
import type { CacheProvider, Claim, LLMProvider, SearchProvider } from "@/lib/types";
import { MAX_VERIFIED_CLAIMS } from "@/lib/firewall/weights";

function makeLLM(classifyImpl: LLMProvider["classify"]): LLMProvider {
  return {
    classify: classifyImpl,
    streamChat: async function* () {
      yield "";
    },
  };
}

function makeSearch(searchImpl: SearchProvider["search"]): SearchProvider {
  return { search: searchImpl };
}

function makeInMemoryCache(): CacheProvider {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => (store.has(key) ? (store.get(key) as never) : null)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  };
}

const claim: Claim = { id: "claim-0", text: "The Eiffel Tower is in Paris.", isSpecific: true };

describe("verifyClaim", () => {
  it("returns 'unverified' (NOT 'contradicted') when search yields zero results", async () => {
    const search = makeSearch(vi.fn().mockResolvedValue([]));
    const llm = makeLLM(vi.fn());
    const result = await verifyClaim(claim, { search, llm });
    expect(result.verdict).toBe("unverified");
    expect(result.verdict).not.toBe("contradicted");
    expect(result.evidence).toEqual([]);
  });

  it("returns 'unverified' when search throws", async () => {
    const search = makeSearch(vi.fn().mockRejectedValue(new Error("search down")));
    const llm = makeLLM(vi.fn());
    const result = await verifyClaim(claim, { search, llm });
    expect(result.verdict).toBe("unverified");
    expect(result.confidence).toBe(0);
  });

  it("never throws when the judge LLM fails", async () => {
    const search = makeSearch(
      vi.fn().mockResolvedValue([
        { url: "https://x.com", title: "Eiffel Tower", content: "Located in Paris.", score: 0.9 },
      ])
    );
    const llm = makeLLM(vi.fn().mockRejectedValue(new Error("llm down")));
    const result = await verifyClaim(claim, { search, llm });
    expect(result.verdict).toBe("unverified");
    expect(result.confidence).toBe(0);
  });

  it("returns a verified verdict when evidence supports the claim", async () => {
    const search = makeSearch(
      vi.fn().mockResolvedValue([
        { url: "https://x.com", title: "Eiffel Tower", content: "Located in Paris, France.", score: 0.9 },
      ])
    );
    const llm = makeLLM(
      vi.fn().mockResolvedValue({
        verdict: "verified",
        confidence: 0.95,
        reasoning: "Source confirms the Eiffel Tower is in Paris.",
        stances: ["supports"],
      })
    );
    const result = await verifyClaim(claim, { search, llm });
    expect(result.verdict).toBe("verified");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].stance).toBe("supports");
  });

  it("downgrades a 'contradicted' verdict to 'unverified' if no source actually contradicts", async () => {
    // Guards against a misbehaving judge model asserting contradiction without support.
    const search = makeSearch(
      vi.fn().mockResolvedValue([
        { url: "https://x.com", title: "Eiffel Tower", content: "Located in Paris.", score: 0.9 },
      ])
    );
    const llm = makeLLM(
      vi.fn().mockResolvedValue({
        verdict: "contradicted",
        confidence: 0.8,
        reasoning: "hallucinated contradiction",
        stances: ["neutral"],
      })
    );
    const result = await verifyClaim(claim, { search, llm });
    expect(result.verdict).toBe("unverified");
  });

  it("returns the cached value without calling search on a second identical call", async () => {
    const searchFn = vi.fn().mockResolvedValue([
      { url: "https://x.com", title: "Eiffel Tower", content: "Located in Paris.", score: 0.9 },
    ]);
    const search = makeSearch(searchFn);
    const llm = makeLLM(
      vi.fn().mockResolvedValue({
        verdict: "verified",
        confidence: 0.9,
        reasoning: "confirmed",
        stances: ["supports"],
      })
    );
    const cache = makeInMemoryCache();

    const first = await verifyClaim(claim, { search, llm, cache });
    const second = await verifyClaim(claim, { search, llm, cache });

    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });
});

describe("verifyClaims", () => {
  const makeClaims = (n: number, specificFrom = 0): Claim[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `claim-${i}`,
      text: `Fact number ${i}`,
      isSpecific: i >= specificFrom,
    }));

  it("fans out in parallel and preserves output length equal to input length", async () => {
    const claims = makeClaims(3);
    const search = makeSearch(vi.fn().mockResolvedValue([]));
    const llm = makeLLM(vi.fn());
    const result = await verifyClaims(claims, { search, llm });
    expect(result).toHaveLength(3);
  });

  it("respects MAX_VERIFIED_CLAIMS and marks over-cap claims unverified rather than dropping them", async () => {
    const claims = makeClaims(MAX_VERIFIED_CLAIMS + 3);
    const search = makeSearch(
      vi.fn().mockResolvedValue([
        { url: "https://x.com", title: "T", content: "evidence", score: 0.5 },
      ])
    );
    const llm = makeLLM(
      vi.fn().mockResolvedValue({
        verdict: "verified",
        confidence: 0.9,
        reasoning: "ok",
        stances: ["supports"],
      })
    );
    const result = await verifyClaims(claims, { search, llm });

    expect(result).toHaveLength(claims.length);
    // All claims are isSpecific=true here (specificFrom defaults to 0), so the
    // cap simply takes the first MAX_VERIFIED_CLAIMS in ranked order.
    const overCapCount = result.filter((r) =>
      r.reasoning.includes("outside the per-message verification cap")
    ).length;
    expect(overCapCount).toBe(3);
    expect(result.every((r) => r.verdict !== undefined)).toBe(true);
  });

  it("prioritizes isSpecific claims when over the cap", async () => {
    const total = MAX_VERIFIED_CLAIMS + 2;
    // First two claims are NOT specific, the rest are specific.
    const claims: Claim[] = Array.from({ length: total }, (_, i) => ({
      id: `claim-${i}`,
      text: `Fact ${i}`,
      isSpecific: i >= 2,
    }));
    const search = makeSearch(
      vi.fn().mockResolvedValue([
        { url: "https://x.com", title: "T", content: "evidence", score: 0.5 },
      ])
    );
    const llm = makeLLM(
      vi.fn().mockResolvedValue({
        verdict: "verified",
        confidence: 0.9,
        reasoning: "ok",
        stances: ["supports"],
      })
    );
    const result = await verifyClaims(claims, { search, llm });
    const nonSpecificResults = result.filter((r) => !r.isSpecific);
    // The two non-specific claims should have been bumped over the cap.
    expect(
      nonSpecificResults.every((r) => r.reasoning.includes("outside the per-message verification cap"))
    ).toBe(true);
  });

  it("survives one claim rejecting (allSettled) without failing the batch", async () => {
    const claims = makeClaims(2);
    const search = makeSearch(
      vi
        .fn()
        .mockResolvedValueOnce([{ url: "https://x.com", title: "T", content: "evidence", score: 0.5 }])
        .mockRejectedValueOnce(new Error("boom"))
    );
    const llm = makeLLM(
      vi.fn().mockResolvedValue({
        verdict: "verified",
        confidence: 0.9,
        reasoning: "ok",
        stances: ["supports"],
      })
    );
    const result = await verifyClaims(claims, { search, llm });
    expect(result).toHaveLength(2);
    // Neither entry should be undefined/missing, regardless of which one failed.
    expect(result.every((r) => r.verdict === "verified" || r.verdict === "unverified")).toBe(true);
  });

  it("returns [] for an empty claims list", async () => {
    const search = makeSearch(vi.fn());
    const llm = makeLLM(vi.fn());
    const result = await verifyClaims([], { search, llm });
    expect(result).toEqual([]);
  });
});
