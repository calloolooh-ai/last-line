import type { SearchHit, SearchProvider } from "@/lib/types";

const TAVILY_URL = "https://api.tavily.com/search";

interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

/**
 * Tavily-backed SearchProvider. A dead search API must degrade to
 * "unverified", never crash the pipeline — so every failure path (network
 * error, non-200, malformed body) returns [] instead of throwing.
 */
export class TavilyProvider implements SearchProvider {
  constructor(private readonly apiKey: string | undefined = process.env.TAVILY_API_KEY) {}

  async search(query: string, opts?: { maxResults?: number }): Promise<SearchHit[]> {
    if (!this.apiKey) return [];

    try {
      const res = await fetch(TAVILY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: opts?.maxResults ?? 5,
          search_depth: "basic",
        }),
      });

      if (!res.ok) return [];

      const data = (await res.json()) as TavilyResponse;
      if (!Array.isArray(data.results)) return [];

      return data.results.map(
        (r): SearchHit => ({
          url: r.url,
          title: r.title,
          content: r.content,
          score: r.score,
        })
      );
    } catch {
      return [];
    }
  }
}

/** Deterministic canned hits for tests and offline demo. */
export class MockSearchProvider implements SearchProvider {
  async search(query: string, opts?: { maxResults?: number }): Promise<SearchHit[]> {
    const max = opts?.maxResults ?? 5;
    const hits: SearchHit[] = [
      {
        url: "https://en.wikipedia.org/wiki/Example",
        title: `Example reference for "${query}"`,
        content: `This is a deterministic canned excerpt discussing ${query} for offline demo mode.`,
        score: 0.92,
      },
      {
        url: "https://www.reuters.com/example-article",
        title: `Coverage related to "${query}"`,
        content: `A second canned source with independent phrasing about ${query}.`,
        score: 0.81,
      },
    ];
    return hits.slice(0, max);
  }
}

/** Selects the search provider. Falls back to MockSearchProvider with no key. */
export function getSearch(): SearchProvider {
  if (!process.env.TAVILY_API_KEY) return new MockSearchProvider();
  return new TavilyProvider();
}
