/**
 * Client-safe instant prescan. Deliberately imports only the pure detector
 * functions, never the `scanner/index.ts` barrel — that module pulls in
 * `node:crypto` for cache keys, which breaks a browser bundle.
 */
import {
  detectApiKeys,
  detectCreditCards,
  detectEmails,
  detectInjectionHeuristics,
  detectPasswords,
  detectPhones,
} from "@/lib/firewall/scanner/detectors";
import { mergeOverlapping } from "@/lib/firewall/scanner/redact";
import { SEVERITY_WEIGHT } from "@/lib/types";
import type { Finding, Severity } from "@/lib/types";

export interface PrescanResult {
  findings: Finding[];
  riskLevel: Severity;
  hasInjectionSignal: boolean;
}

export function prescan(text: string): PrescanResult {
  const findings = mergeOverlapping([
    ...detectEmails(text),
    ...detectPhones(text),
    ...detectCreditCards(text),
    ...detectApiKeys(text),
    ...detectPasswords(text),
  ]);

  let riskLevel: Severity = "none";
  for (const f of findings) {
    if (SEVERITY_WEIGHT[f.severity] > SEVERITY_WEIGHT[riskLevel]) riskLevel = f.severity;
  }

  const hasInjectionSignal = detectInjectionHeuristics(text).length > 0;

  return { findings, riskLevel, hasInjectionSignal };
}
