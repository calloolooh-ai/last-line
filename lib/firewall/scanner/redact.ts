/**
 * Turns a set of Findings into a redacted version of the original prompt.
 */

import type { Finding, FindingType } from "@/lib/types";
import { SEVERITY_WEIGHT } from "@/lib/types";

const PLACEHOLDER: Record<FindingType, string> = {
  email: "[REDACTED_EMAIL]",
  phone: "[REDACTED_PHONE]",
  api_key: "[REDACTED_API_KEY]",
  password: "[REDACTED_PASSWORD]",
  credit_card: "[REDACTED_CREDIT_CARD]",
  injection: "[REDACTED_INJECTION]",
};

/**
 * Collapses overlapping findings into a non-overlapping set, keeping the
 * higher-severity finding wherever two spans overlap. Input order is not
 * assumed; output is sorted by span.start ascending.
 */
export function mergeOverlapping(findings: Finding[]): Finding[] {
  if (findings.length === 0) return [];

  // Sort by start ascending, then by longest span first so the widest
  // candidate at a given start is considered first.
  const sorted = [...findings].sort((a, b) => {
    if (a.span.start !== b.span.start) return a.span.start - b.span.start;
    return b.span.end - a.span.end;
  });

  const result: Finding[] = [];
  for (const finding of sorted) {
    const last = result[result.length - 1];
    if (last && finding.span.start < last.span.end) {
      // Overlaps the previous kept finding — keep whichever is more severe.
      if (SEVERITY_WEIGHT[finding.severity] > SEVERITY_WEIGHT[last.severity]) {
        result[result.length - 1] = finding;
      }
      continue;
    }
    result.push(finding);
  }
  return result;
}

/**
 * Replaces every finding's span with a typed placeholder.
 *
 * Overlapping findings are resolved via mergeOverlapping first. Replacements
 * are then applied right-to-left (descending span.start): once we splice a
 * replacement into the string, every span to its right shifts, but every span
 * still to its left (lower start offset) is untouched — so working backwards
 * means we never have to recompute offsets.
 */
export function redact(text: string, findings: Finding[]): string {
  const merged = mergeOverlapping(findings);
  const rightToLeft = [...merged].sort((a, b) => b.span.start - a.span.start);

  let result = text;
  for (const finding of rightToLeft) {
    const placeholder = PLACEHOLDER[finding.type];
    result = result.slice(0, finding.span.start) + placeholder + result.slice(finding.span.end);
  }
  return result;
}
