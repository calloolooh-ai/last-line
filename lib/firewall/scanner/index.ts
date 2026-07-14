/**
 * Prompt Scanner orchestration: runs every deterministic detector plus the
 * injection classifier, merges overlaps, computes the overall risk, and
 * produces a redacted copy of the prompt.
 */

import { createHash } from "node:crypto";
import type { CacheProvider, Finding, LLMProvider, ScanResult, Severity } from "@/lib/types";
import { SEVERITY_WEIGHT } from "@/lib/types";
import { CACHE_TTL } from "@/lib/firewall/weights";
import {
  detectApiKeys,
  detectCreditCards,
  detectEmails,
  detectPasswords,
  detectPhones,
} from "./detectors";
import { classifyInjection, heuristicInjectionAssessment } from "./injection";
import { mergeOverlapping, redact } from "./redact";

export * from "./detectors";
export * from "./redact";
export * from "./injection";

function worstSeverity(findings: Finding[]): Severity {
  let worst: Severity = "none";
  for (const finding of findings) {
    if (SEVERITY_WEIGHT[finding.severity] > SEVERITY_WEIGHT[worst]) {
      worst = finding.severity;
    }
  }
  return worst;
}

function cacheKeyFor(text: string): string {
  return `scan:${createHash("sha256").update(text).digest("hex")}`;
}

export async function scanPrompt(
  text: string,
  deps: { llm?: LLMProvider; cache?: CacheProvider },
): Promise<ScanResult> {
  const key = deps.cache ? cacheKeyFor(text) : null;
  if (deps.cache && key) {
    const cached = await deps.cache.get<ScanResult>(key);
    if (cached) return cached;
  }

  const rawFindings: Finding[] = [
    ...detectEmails(text),
    ...detectPhones(text),
    ...detectCreditCards(text),
    ...detectApiKeys(text),
    ...detectPasswords(text),
  ];

  const injection = deps.llm
    ? await classifyInjection(text, deps.llm)
    : heuristicInjectionAssessment(text);

  const findings = mergeOverlapping(rawFindings);
  const riskLevel = worstSeverity(findings);
  const redacted = redact(text, findings);
  const blocked = riskLevel === "critical" || injection.confidence > 0.8;

  const result: ScanResult = { findings, injection, riskLevel, redacted, blocked };

  if (deps.cache && key) {
    await deps.cache.set(key, result, CACHE_TTL.scan);
  }

  return result;
}
