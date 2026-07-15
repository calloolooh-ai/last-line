/**
 * Scans code blocks in the ASSISTANT's response for unsafe patterns —
 * hardcoded secrets, SQL injection via string building, eval/exec usage,
 * command injection, and unguarded innerHTML writes. Runs entirely locally,
 * synchronously, no LLM — same "instant, free, local" model as prescan().
 * ChatGPT is used heavily for coding help, and this is currently a blind
 * spot: the firewall only scans the outbound prompt, never the code it
 * hands back.
 */

import { detectApiKeys } from "@/lib/firewall/scanner/detectors";

export type CodeRiskType =
  | "hardcoded_secret"
  | "sql_injection"
  | "eval_usage"
  | "command_injection"
  | "unsafe_dom_write";

export interface CodeRisk {
  type: CodeRiskType;
  severity: "low" | "medium" | "high" | "critical";
  excerpt: string;
  suggestion: string;
}

const CODE_FENCE_RE = /```[\w-]*\n([\s\S]*?)```/g;

const SQL_CONCAT_RE =
  /\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,200}?(\+\s*[a-zA-Z_$][\w$]*|\$\{[^}]+\}|%s|f["'])/i;

const EVAL_RE = /\beval\s*\(/;

const COMMAND_INJECTION_RE =
  /\b(child_process\.exec|exec\s*\(|os\.system\s*\(|subprocess\.call\s*\()[^)]*(\+|\$\{|f["'])/i;

const UNSAFE_INNERHTML_RE = /\.innerHTML\s*=\s*(?!["'`]\s*["'`]\s*[;)]|["'`]\s*[;)])/;

function excerptOf(text: string, matchIndex: number): string {
  const start = Math.max(0, matchIndex - 20);
  const end = Math.min(text.length, matchIndex + 60);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

function scanCodeBlock(code: string): CodeRisk[] {
  const risks: CodeRisk[] = [];

  for (const finding of detectApiKeys(code)) {
    // detectApiKeys always reports "critical" — Finding's Severity type is
    // just wider than what this detector ever actually produces.
    risks.push({
      type: "hardcoded_secret",
      severity: "critical",
      excerpt: finding.excerpt,
      suggestion: "This code hardcodes a secret. Use an environment variable or secrets manager instead.",
    });
  }

  const sqlMatch = SQL_CONCAT_RE.exec(code);
  if (sqlMatch) {
    risks.push({
      type: "sql_injection",
      severity: "critical",
      excerpt: excerptOf(code, sqlMatch.index),
      suggestion: "This builds a SQL query by concatenating/interpolating a variable. Use parameterized queries instead.",
    });
  }

  const evalMatch = EVAL_RE.exec(code);
  if (evalMatch) {
    risks.push({
      type: "eval_usage",
      severity: "high",
      excerpt: excerptOf(code, evalMatch.index),
      suggestion: "eval() executes arbitrary code. Avoid it, especially on any input that isn't fully trusted.",
    });
  }

  const cmdMatch = COMMAND_INJECTION_RE.exec(code);
  if (cmdMatch) {
    risks.push({
      type: "command_injection",
      severity: "critical",
      excerpt: excerptOf(code, cmdMatch.index),
      suggestion: "This builds a shell command from a variable. Use an argument-array API instead of string concatenation.",
    });
  }

  const domMatch = UNSAFE_INNERHTML_RE.exec(code);
  if (domMatch) {
    risks.push({
      type: "unsafe_dom_write",
      severity: "medium",
      excerpt: excerptOf(code, domMatch.index),
      suggestion: "Assigning to innerHTML with dynamic content risks XSS. Use textContent or a sanitizer instead.",
    });
  }

  return risks;
}

/** Extracts every fenced code block from the response and scans each independently. */
export function detectCodeRisks(responseText: string): CodeRisk[] {
  const risks: CodeRisk[] = [];
  for (const match of responseText.matchAll(CODE_FENCE_RE)) {
    risks.push(...scanCodeBlock(match[1]));
  }
  return risks;
}
