import { Redis } from "@upstash/redis";
import type { CacheProvider } from "@/lib/types";

/**
 * Upstash Redis (REST) backed cache. Never throws — a cache miss (or a dead
 * Redis) is always an acceptable degradation, never a crash.
 */
class RedisCache implements CacheProvider {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get<T>(key);
      return value ?? null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.redis.set(key, value, { ex: ttlSeconds });
      } else {
        await this.redis.set(key, value);
      }
    } catch {
      // A failed write degrades to "not cached" — never surfaces to callers.
    }
  }
}

interface MemoryEntry {
  value: unknown;
  expiresAt: number | null;
}

/**
 * In-memory Map-based fallback so local dev and the demo work with zero
 * config when Upstash env vars are absent. Not shared across serverless
 * invocations — fine for a hackathon MVP, explicitly not a production cache.
 */
export class MemoryCache implements CacheProvider {
  private readonly store = new Map<string, MemoryEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }
}

let instance: CacheProvider | null = null;

/**
 * Returns the process-wide cache singleton. Uses Upstash Redis when
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set, otherwise
 * transparently falls back to an in-memory cache.
 */
export function getCache(): CacheProvider {
  if (instance) return instance;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  instance = url && token ? new RedisCache(url, token) : new MemoryCache();
  return instance;
}

/** Test-only: clears the singleton so getCache() re-evaluates env vars. */
export function __resetCacheForTests(): void {
  instance = null;
}
