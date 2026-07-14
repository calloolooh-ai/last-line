import { describe, it, expect } from "vitest";
import { estimateHallucination } from "@/lib/firewall/hallucination";
import type { VerifiedClaim } from "@/lib/types";

function claim(overrides: Partial<VerifiedClaim>): VerifiedClaim {
  return {
    id: "claim-0",
    text: "Some claim",
    isSpecific: true,
    verdict: "verified",
    confidence: 0.9,
    reasoning: "",
    evidence: [],
    ...overrides,
  };
}

describe("estimateHallucination", () => {
  it("returns moderate-low, non-zero, non-one risk for an empty claim list", () => {
    const result = estimateHallucination([], 0.9);
    expect(result.risk).toBeGreaterThan(0);
    expect(result.risk).toBeLessThan(1);
    expect(result.risk).toBeCloseTo(0.15, 5);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("produces higher risk for contradictions than for unverified specifics", () => {
    const contradicted = estimateHallucination(
      [claim({ verdict: "contradicted", isSpecific: true })],
      0.9
    );
    const unverifiedSpecific = estimateHallucination(
      [claim({ verdict: "unverified", isSpecific: true })],
      0.9
    );
    expect(contradicted.risk).toBeGreaterThan(unverifiedSpecific.risk);
  });

  it("gives low risk when all claims are verified", () => {
    const result = estimateHallucination(
      [claim({ verdict: "verified" }), claim({ id: "claim-1", verdict: "verified" })],
      0.9
    );
    expect(result.risk).toBeLessThan(0.2);
  });

  it("unverified non-specific claims contribute less risk than unverified specific claims", () => {
    const specific = estimateHallucination(
      [claim({ verdict: "unverified", isSpecific: true })],
      0.9
    );
    const nonSpecific = estimateHallucination(
      [claim({ verdict: "unverified", isSpecific: false })],
      0.9
    );
    expect(specific.risk).toBeGreaterThan(nonSpecific.risk);
  });

  it("computes signals directly as contradiction/unverified-specific rates", () => {
    const claims = [
      claim({ id: "c0", verdict: "contradicted", isSpecific: true }),
      claim({ id: "c1", verdict: "unverified", isSpecific: true }),
      claim({ id: "c2", verdict: "verified", isSpecific: true }),
      claim({ id: "c3", verdict: "verified", isSpecific: false }),
    ];
    const result = estimateHallucination(claims, 0.5);
    expect(result.signals.contradictionRate).toBeCloseTo(0.25, 5);
    expect(result.signals.unverifiedSpecificRate).toBeCloseTo(0.25, 5);
    expect(result.signals.modelConfidence).toBeCloseTo(0.5, 5);
  });

  it("clamps risk to [0, 1] and clamps modelConfidence input", () => {
    const claims = Array.from({ length: 5 }, (_, i) =>
      claim({ id: `c${i}`, verdict: "contradicted", isSpecific: true })
    );
    const result = estimateHallucination(claims, -5);
    expect(result.risk).toBeLessThanOrEqual(1);
    expect(result.risk).toBeGreaterThanOrEqual(0);
    expect(result.signals.modelConfidence).toBe(0);
  });
});
