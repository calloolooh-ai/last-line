import { describe, it, expect } from "vitest";
import { computeTrustScore } from "@/lib/firewall/score";
import { estimateHallucination } from "@/lib/firewall/hallucination";
import type { HallucinationEstimate, ScanResult, VerifiedClaim } from "@/lib/types";

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

function cleanScan(): ScanResult {
  return {
    findings: [],
    injection: { isInjection: false, confidence: 0, technique: null, rationale: "clean" },
    riskLevel: "none",
    redacted: "hello",
    blocked: false,
  };
}

function criticalPrivacyScan(): ScanResult {
  return {
    findings: [
      {
        type: "api_key",
        severity: "critical",
        span: { start: 0, end: 10 },
        excerpt: "sk-****",
        suggestion: "Remove the API key.",
        confidence: 1,
      },
    ],
    injection: { isInjection: false, confidence: 0, technique: null, rationale: "clean" },
    riskLevel: "critical",
    redacted: "hello [API_KEY]",
    blocked: true,
  };
}

describe("computeTrustScore", () => {
  it("scores >= 80 and bands 'verified' when all claims verified and scan is clean", () => {
    const claims = [claim({ id: "c0" }), claim({ id: "c1" })];
    const hallucination = estimateHallucination(claims, 0.9);
    const result = computeTrustScore({ claims, hallucination, scan: cleanScan() });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.band).toBe("verified");
    expect(result.components.verification).toBe(1);
  });

  it("scores low and bands 'risk' when all claims are contradicted", () => {
    const claims = [
      claim({ id: "c0", verdict: "contradicted", confidence: 0.9 }),
      claim({ id: "c1", verdict: "contradicted", confidence: 0.9 }),
    ];
    const hallucination = estimateHallucination(claims, 0.9);
    const result = computeTrustScore({ claims, hallucination, scan: cleanScan() });
    expect(result.score).toBeLessThan(50);
    expect(result.band).toBe("risk");
    expect(result.components.verification).toBe(0);
  });

  it("redistributes weight when claims are empty: verification null, weights sum to ~1, score >= 70", () => {
    const hallucination = estimateHallucination([], 0.9);
    const result = computeTrustScore({ claims: [], hallucination, scan: cleanScan() });

    expect(result.components.verification).toBeNull();
    expect(result.weights.verification).toBe(0);

    const weightSum =
      result.weights.verification +
      result.weights.hallucination +
      result.weights.injection +
      result.weights.privacy;
    expect(weightSum).toBeCloseTo(1, 5);

    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("a critical privacy finding drags the score down measurably vs a clean scan", () => {
    const claims = [claim({ id: "c0" })];
    const hallucination = estimateHallucination(claims, 0.9);
    const cleanResult = computeTrustScore({ claims, hallucination, scan: cleanScan() });
    const dirtyResult = computeTrustScore({
      claims,
      hallucination,
      scan: criticalPrivacyScan(),
    });
    expect(dirtyResult.score).toBeLessThan(cleanResult.score);
    expect(cleanResult.score - dirtyResult.score).toBeGreaterThanOrEqual(10);
    expect(dirtyResult.components.privacy).toBe(0);
  });

  it("clamps score to [0, 100]", () => {
    const claims = [claim({ id: "c0", verdict: "verified" })];
    const hallucination: HallucinationEstimate = {
      risk: 0,
      signals: { contradictionRate: 0, unverifiedSpecificRate: 0, modelConfidence: 1 },
      explanation: "none",
    };
    const result = computeTrustScore({ claims, hallucination, scan: cleanScan() });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("includes an honest human-readable summary", () => {
    const claims = [
      claim({ id: "c0", verdict: "verified" }),
      claim({ id: "c1", verdict: "unverified", isSpecific: true }),
    ];
    const hallucination = estimateHallucination(claims, 0.8);
    const result = computeTrustScore({ claims, hallucination, scan: cleanScan() });
    expect(result.summary).toMatch(/1 of 2 claim/);
  });
});
