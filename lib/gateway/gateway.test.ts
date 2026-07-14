import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock the AI SDKs — no network in this test file, ever.
// ---------------------------------------------------------------------------

vi.mock("@ai-sdk/groq", () => ({
  createGroq: vi.fn(() => {
    const model = vi.fn((id: string) => ({ modelId: id }));
    return model;
  }),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(async () => ({ object: { mocked: true } })),
  streamText: vi.fn(() => ({
    textStream: (async function* () {
      yield "hello ";
      yield "world";
    })(),
  })),
}));

import { GroqProvider } from "@/lib/gateway/groq";
import { OpenAIProvider } from "@/lib/gateway/openai";
import { getLLM, MockLLMProvider } from "@/lib/gateway/index";
import { TavilyProvider, MockSearchProvider } from "@/lib/providers/tavily";
import { getCache, MemoryCache, __resetCacheForTests } from "@/lib/cache/index";

describe("gateway/index getLLM", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns Groq by default when GROQ_API_KEY is set", () => {
    process.env.GROQ_API_KEY = "test-key";
    delete process.env.LLM_PROVIDER;
    const provider = getLLM();
    expect(provider).toBeInstanceOf(GroqProvider);
  });

  it("falls back to MockLLMProvider when GROQ_API_KEY is missing, never hard-fails", () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.LLM_PROVIDER;
    const provider = getLLM();
    expect(provider).toBeInstanceOf(MockLLMProvider);
  });

  it("selects OpenAIProvider when LLM_PROVIDER=openai and a key is present", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const provider = getLLM();
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });
});

describe("GroqProvider", () => {
  it("classify() delegates to generateObject on the FAST_MODEL", async () => {
    const provider = new GroqProvider("test-key");
    const result = await provider.classify<{ mocked: boolean }>({
      system: "sys",
      prompt: "prompt",
      schema: {},
    });
    expect(result).toEqual({ mocked: true });
  });

  it("streamChat() yields deltas from streamText's textStream", async () => {
    const provider = new GroqProvider("test-key");
    const chunks: string[] = [];
    for await (const delta of provider.streamChat({ messages: [{ role: "user", content: "hi" }] })) {
      chunks.push(delta);
    }
    expect(chunks.join("")).toBe("hello world");
  });
});

describe("MockLLMProvider", () => {
  it("satisfies the LLMProvider interface and streams a canned response", async () => {
    const provider = new MockLLMProvider();
    const chunks: string[] = [];
    for await (const delta of provider.streamChat({
      messages: [{ role: "user", content: "ping" }],
    })) {
      chunks.push(delta);
    }
    const joined = chunks.join("");
    expect(joined.length).toBeGreaterThan(0);
    expect(joined).toContain("ping");

    const classified = await provider.classify<Record<string, unknown>>({
      system: "s",
      prompt: "p",
      schema: {},
    });
    expect(classified).toBeTypeOf("object");
  });
});

describe("TavilyProvider", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.TAVILY_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("returns [] when fetch rejects (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const provider = new TavilyProvider();
    const hits = await provider.search("test query");
    expect(hits).toEqual([]);
  });

  it("returns [] on a non-200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("server error", { status: 500 }))
    );
    const provider = new TavilyProvider();
    const hits = await provider.search("test query");
    expect(hits).toEqual([]);
  });

  it("maps a successful response to SearchHit[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              results: [
                { url: "https://example.com", title: "Example", content: "content", score: 0.5 },
              ],
            }),
            { status: 200 }
          )
      )
    );
    const provider = new TavilyProvider();
    const hits = await provider.search("test query");
    expect(hits).toEqual([
      { url: "https://example.com", title: "Example", content: "content", score: 0.5 },
    ]);
  });

  it("returns [] when no API key is configured, never throws", async () => {
    delete process.env.TAVILY_API_KEY;
    const provider = new TavilyProvider();
    const hits = await provider.search("test query");
    expect(hits).toEqual([]);
  });
});

describe("MockSearchProvider", () => {
  it("returns deterministic canned hits", async () => {
    const provider = new MockSearchProvider();
    const hits = await provider.search("test query", { maxResults: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toMatch(/^https:\/\//);
  });
});

describe("cache fallback (no Upstash env)", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    __resetCacheForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    __resetCacheForTests();
  });

  it("getCache() returns an in-memory cache when Upstash env is absent", () => {
    expect(getCache()).toBeInstanceOf(MemoryCache);
  });

  it("get/set round-trips a value", async () => {
    const cache = getCache();
    await cache.set("key", { a: 1 });
    const value = await cache.get<{ a: number }>("key");
    expect(value).toEqual({ a: 1 });
  });

  it("get() returns null for a missing key", async () => {
    const cache = getCache();
    const value = await cache.get("missing");
    expect(value).toBeNull();
  });

  it("respects TTL expiry", async () => {
    vi.useFakeTimers();
    const cache = getCache();
    await cache.set("expiring", "value", 1); // 1 second TTL
    expect(await cache.get("expiring")).toBe("value");
    vi.advanceTimersByTime(1500);
    expect(await cache.get("expiring")).toBeNull();
    vi.useRealTimers();
  });
});
