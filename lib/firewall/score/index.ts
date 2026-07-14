/**
 * Trust score — PURE, SYNCHRONOUS combination of verification, hallucination,
 * injection, and privacy signals into a single 0-100 score.
 *
 * Formula (ARCHITECTURE.md §5):
 *   score = 100 × (0.40·V + 0.25·H + 0.20·I + 0.15·P)
 *
 * V is null when the response contains no factual claims (creative writing,
 * chit-chat, code). In that case V's 0.40 weight is redistributed
 * proportionally across H, I, and P — otherwise a claimless "write me a poem"
 * response would score a flat 60/100 (100 × 0.60) regardless of how safe it
 * actually was, which reads as a bug rather than a deliberate design choice.
 */

import type { HallucinationEstimate, ScanResult, TrustScore, VerifiedClaim } from "@/lib/types";
import { TRUST_WEIGHTS, VERDICT_SCORE, bandFor, privacyScore } from "@/lib/firewall/weights";

interface ComputeTrustScoreInput {
  claims: VerifiedClaim[];
  hallucination: HallucinationEstimate;
  scan: ScanResult;
}

type WeightKey = "verification" | "hallucination" | "injection" | "privacy";

function meanVerification(claims: VerifiedClaim[]): number | null {
  if (claims.length === 0) return null;
  const sum = claims.reduce((acc, c) => acc + VERDICT_SCORE[c.verdict], 0);
  return sum / claims.length;
}

/**
 * Redistribute the verification weight proportionally across the remaining
 * components when there's nothing to verify, keeping their relative
 * proportions to each other intact.
 */
function effectiveWeights(hasVerification: boolean): Record<WeightKey, number> {
  if (hasVerification) {
    return { ...TRUST_WEIGHTS };
  }

  const remaining = TRUST_WEIGHTS.hallucination + TRUST_WEIGHTS.injection + TRUST_WEIGHTS.privacy;
  return {
    verification: 0,
    hallucination: TRUST_WEIGHTS.hallucination / remaining,
    injection: TRUST_WEIGHTS.injection / remaining,
    privacy: TRUST_WEIGHTS.privacy / remaining,
  };
}

function summarize(
  claims: VerifiedClaim[],
  verification: number | null,
  scan: ScanResult
): string {
  const parts: string[] = [];

  if (verification === null) {
    parts.push("No factual claims were found to verify");
  } else {
    const total = claims.length;
    const verified = claims.filter((c) => c.verdict === "verified").length;
    const contradicted = claims.filter((c) => c.verdict === "contradicted").length;
    const unverified = claims.filter((c) => c.verdict === "unverified").length;

    let claimSummary = `${verified} of ${total} claim${total === 1 ? "" : "s"} verified against external sources`;
    if (contradicted > 0) {
      claimSummary += `; ${contradicted} contradicted by evidence`;
    }
    const unverifiedSpecific = claims.filter(
      (c) => c.verdict === "unverified" && c.isSpecific
    ).length;
    if (unverifiedSpecific > 0) {
      claimSummary += `; ${unverifiedSpecific} unverified specific figure${unverifiedSpecific === 1 ? "" : "s"}`;
    } else if (unverified > 0) {
      claimSummary += `; ${unverified} unverified`;
    }
    parts.push(claimSummary);
  }

  if (scan.riskLevel !== "none") {
    parts.push(`prompt privacy risk was ${scan.riskLevel}`);
  }
  if (scan.injection.isInjection) {
    parts.push(`a possible prompt injection (${scan.injection.technique ?? "unknown technique"}) was detected`);
  }

  return parts.join("; ") + ".";
}

export function computeTrustScore(input: ComputeTrustScoreInput): TrustScore {
  const { claims, hallucination, scan } = input;

  const verification = meanVerification(claims);
  const weights = effectiveWeights(verification !== null);

  const H = 1 - hallucination.risk;
  const I = 1 - scan.injection.confidence;
  const P = privacyScore(scan.riskLevel);
  const V = verification ?? 0; // weight is 0 when null, so this term drops out

  const raw =
    100 *
    (weights.verification * V +
      weights.hallucination * H +
      weights.injection * I +
      weights.privacy * P);

  const score = Math.min(100, Math.max(0, Math.round(raw)));

  return {
    score,
    band: bandFor(score),
    components: {
      verification,
      hallucination: H,
      injection: I,
      privacy: P,
    },
    weights,
    summary: summarize(claims, verification, scan),
  };
}
