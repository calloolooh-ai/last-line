/**
 * Trust score weights. Kept in one place because a judge will ask how they were
 * chosen, and the honest answer is "they're tunable — here's the file."
 */

import type { Severity, TrustBand } from "@/lib/types";
import { SEVERITY_WEIGHT } from "@/lib/types";

export const TRUST_WEIGHTS = {
  verification: 0.4,
  hallucination: 0.25,
  injection: 0.2,
  privacy: 0.15,
} as const;

export const BAND_THRESHOLDS = {
  /** >= 80 */
  verified: 80,
  /** >= 50 */
  caution: 50,
} as const;

export function bandFor(score: number): TrustBand {
  if (score >= BAND_THRESHOLDS.verified) return "verified";
  if (score >= BAND_THRESHOLDS.caution) return "caution";
  return "risk";
}

/** Verdict -> verification subscore contribution. */
export const VERDICT_SCORE = {
  verified: 1,
  unverified: 0.5,
  contradicted: 0,
} as const;

/** Privacy subscore: 1 - severity of the worst finding. */
export function privacyScore(worst: Severity): number {
  return 1 - SEVERITY_WEIGHT[worst];
}

/** Max claims verified per response. Caps latency and Tavily spend. */
export const MAX_VERIFIED_CLAIMS = 5;

/** Cache TTLs, seconds. */
export const CACHE_TTL = {
  claim: 60 * 60 * 24,
  scan: 60 * 60,
} as const;
