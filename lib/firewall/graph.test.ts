/**
 * Integration test for the full firewall pipeline, with every provider mocked.
 * No network. This is the test that proves the modules actually compose.
 */

import { describe, it, expect, vi } from "vitest";
import { runFirewall, streamFirewall, type FirewallDeps } from "@/lib/firewall/graph";
import type { AnalysisEvent, CacheProvider, LLMProvider, SearchProvider } from "@/lib/types";

/**
 * A fake LLM that routes on the system prompt: the firewall calls classify()
 * for three different jobs, and each needs a differently-shaped response.
 */
function fakeLLM(overrides: { contradict?: boolean; noClaims?: boolean } = {}): LLMProvider {
  return {
    async classify<T>({ system }: { system: string; prompt: string; schema: unknown }): Promise<T> {
      const s = system.toLowerCase();

      if (s.includes("injection")) {
        return {
          isInjection: false,
          confidence: 0.05,
          technique: null,
          rationale: "No instruction-override language present.",
        } as T;
      }

      if (s.includes("claim") && !s.includes("verdict") && !s.includes("evidence")) {
        if (overrides.noClaims) return { claims: [] } as T;
        return {
          claims: [
            { text: "The Eiffel Tower is located in Paris, France." },
            { text: "The Eiffel Tower was completed in 1889." },
          ],
        } as T;
      }

      // Verdict / evidence judgment.
      return {
        verdict: overrides.contradict ? "contradicted" : "verified",
        confidence: 0.9,
        reasoning: overrides.contradict
          ? "Sources state a different completion date."
          : "Both sources directly support the claim.",
        stances: overrides.contradict ? ["contradicts", "contradicts"] : ["supports", "supports"],
      } as T;
    },

    async *streamChat() {
      yield "unused in these tests";
    },
  };
}

function fakeSearch(hits = 2): SearchProvider {
  return {
    search: vi.fn(async () =>
      Array.from({ length: hits }, (_, i) => ({
        url: `https://example.org/source-${i}`,
        title: `Source ${i}`,
        content: "The Eiffel Tower, in Paris, was completed in 1889.",
        score: 0.9 - i * 0.1,
      })),
    ),
  };
}

function memCache(): CacheProvider {
  const store = new Map<string, unknown>();
  return {
    async get<T>(k: string) {
      return (store.get(k) as T) ?? null;
    },
    async set<T>(k: string, v: T) {
      store.set(k, v);
    },
  };
}

const baseInput = {
  prompt: "When was the Eiffel Tower completed?",
  response: "The Eiffel Tower is in Paris, France. It was completed in 1889.",
  messageId: "msg-1",
};

describe("firewall graph", () => {
  it("runs end to end and produces a complete analysis", async () => {
    const deps: FirewallDeps = { llm: fakeLLM(), search: fakeSearch(), cache: memCache() };
    const analysis = await runFirewall(baseInput, deps);

    expect(analysis.messageId).toBe("msg-1");
    expect(analysis.claims.length).toBeGreaterThan(0);
    expect(analysis.claims.every((c) => c.verdict === "verified")).toBe(true);
    expect(analysis.trust.score).toBeGreaterThanOrEqual(80);
    expect(analysis.trust.band).toBe("verified");
    expect(analysis.scan.riskLevel).toBe("none");
    expect(analysis.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("scores a contradicted response into the risk band", async () => {
    const deps: FirewallDeps = {
      llm: fakeLLM({ contradict: true }),
      search: fakeSearch(),
      cache: memCache(),
    };
    const analysis = await runFirewall(baseInput, deps);

    expect(analysis.claims.every((c) => c.verdict === "contradicted")).toBe(true);
    expect(analysis.hallucination.risk).toBeGreaterThan(0.5);
    expect(analysis.trust.score).toBeLessThan(60);
  });

  it("does not penalize a response that makes no factual claims", async () => {
    const deps: FirewallDeps = {
      llm: fakeLLM({ noClaims: true }),
      search: fakeSearch(),
      cache: memCache(),
    };
    const analysis = await runFirewall(
      { ...baseInput, response: "Here's a haiku about the sea." },
      deps,
    );

    // The weight-redistribution path: no claims must not read as "unverified".
    expect(analysis.claims).toHaveLength(0);
    expect(analysis.trust.components.verification).toBeNull();
    expect(analysis.trust.score).toBeGreaterThanOrEqual(70);
  });

  it("flags a prompt carrying a secret and drags the trust score down", async () => {
    const deps: FirewallDeps = { llm: fakeLLM(), search: fakeSearch(), cache: memCache() };
    const clean = await runFirewall(baseInput, deps);
    const leaky = await runFirewall(
      {
        ...baseInput,
        prompt: "Use my key sk-proj-9aZbYcXdWeVfUgThSiRjQkPlOmNnMbVcXzAsDfGh to answer.",
      },
      deps,
    );

    expect(leaky.scan.findings.some((f) => f.type === "api_key")).toBe(true);
    expect(leaky.scan.blocked).toBe(true);
    expect(leaky.trust.score).toBeLessThan(clean.trust.score);
  });

  it("degrades to unverified rather than throwing when search is dead", async () => {
    const deadSearch: SearchProvider = { search: async () => [] };
    const deps: FirewallDeps = { llm: fakeLLM(), search: deadSearch, cache: memCache() };
    const analysis = await runFirewall(baseInput, deps);

    // Absence of evidence must never manufacture a contradiction.
    expect(analysis.claims.every((c) => c.verdict === "unverified")).toBe(true);
    expect(analysis.claims.every((c) => c.verdict !== "contradicted")).toBe(true);
    expect(analysis.trust.score).toBeGreaterThan(0);
  });

  it("streams events in pipeline order and terminates with done", async () => {
    const deps: FirewallDeps = { llm: fakeLLM(), search: fakeSearch(), cache: memCache() };
    const events: AnalysisEvent[] = [];
    for await (const e of streamFirewall(baseInput, deps)) events.push(e);

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("scan");
    expect(types).toContain("claims");
    expect(types).toContain("claim_verified");
    expect(types).toContain("hallucination");
    expect(types).toContain("trust");
    expect(types.at(-1)).toBe("done");

    const done = events.at(-1);
    expect(done?.type === "done" && done.analysis.trust.band).toBe("verified");
  });

  it("serves repeat claims from cache without re-searching", async () => {
    const search = fakeSearch();
    const cache = memCache();
    const deps: FirewallDeps = { llm: fakeLLM(), search, cache };

    await runFirewall(baseInput, deps);
    const callsAfterFirst = (search.search as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await runFirewall(baseInput, deps);
    // Second identical run is fully cached — this is the "ask it again, it's
    // instant" demo moment.
    expect((search.search as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
  });
});
