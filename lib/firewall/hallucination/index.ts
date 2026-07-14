/**
 * Hallucination risk estimation.
 *
 * PURE, SYNCHRONOUS, NO LLM CALLS. Everything here is derived arithmetic over
 * already-verified claims plus the model's self-reported confidence (used only
 * as a weak tiebreaker, per the spec — contradictions and unsourced specifics
 * are the real signal).
 */

import type { HallucinationEstimate, VerifiedClaim } from "@/lib/types";

/** Risk assigned to a claimless response: not 0 (we didn't verify anything, so
 * we can't vouch for it), not 1 (there was nothing false to catch either). */
const CLAIMLESS_RISK = 0.15;

/** Relative weight of each signal in the combined risk. Contradictions dominate
 * because a claim actively refuted by evidence is worse than one merely
 * unchecked. */
const CONTRADICTION_WEIGHT = 0.65;
const UNVERIFIED_SPECIFIC_WEIGHT = 0.3;
const MODEL_CONFIDENCE_WEIGHT = 0.05;

export function estimateHallucination(
  claims: VerifiedClaim[],
  modelConfidence: number
): HallucinationEstimate {
  const clampedModelConfidence = Math.min(1, Math.max(0, modelConfidence));

  if (claims.length === 0) {
    return {
      risk: CLAIMLESS_RISK,
      signals: {
        contradictionRate: 0,
        unverifiedSpecificRate: 0,
        modelConfidence: clampedModelConfidence,
      },
      explanation:
        "The response contained no checkable factual claims, so there was nothing to verify. Risk is reported as low but not zero, since nothing was actually confirmed either.",
    };
  }

  const total = claims.length;
  const contradicted = claims.filter((c) => c.verdict === "contradicted").length;
  const unverifiedSpecific = claims.filter(
    (c) => c.verdict === "unverified" && c.isSpecific
  ).length;

  const contradictionRate = contradicted / total;
  const unverifiedSpecificRate = unverifiedSpecific / total;

  // The model's self-reported confidence is inverted into a risk-flavored
  // term (low confidence -> higher risk contribution) and weighted lightly,
  // since it's the weakest of the three signals per the shared contract.
  const modelConfidenceRisk = 1 - clampedModelConfidence;

  const risk =
    CONTRADICTION_WEIGHT * contradictionRate +
    UNVERIFIED_SPECIFIC_WEIGHT * unverifiedSpecificRate +
    MODEL_CONFIDENCE_WEIGHT * modelConfidenceRisk;

  const clampedRisk = Math.min(1, Math.max(0, risk));

  const parts: string[] = [];
  if (contradicted > 0) {
    parts.push(
      `${contradicted} of ${total} claim${total === 1 ? "" : "s"} directly contradicted by evidence`
    );
  }
  if (unverifiedSpecific > 0) {
    parts.push(
      `${unverifiedSpecific} unsourced specific claim${unverifiedSpecific === 1 ? "" : "s"} (numbers, dates, or named entities) could not be verified`
    );
  }
  if (parts.length === 0) {
    parts.push("all claims were either verified or unverified without being specific");
  }

  const explanation = `Hallucination risk ${(clampedRisk * 100).toFixed(0)}%: ${parts.join("; ")}.`;

  return {
    risk: clampedRisk,
    signals: {
      contradictionRate,
      unverifiedSpecificRate,
      modelConfidence: clampedModelConfidence,
    },
    explanation,
  };
}
