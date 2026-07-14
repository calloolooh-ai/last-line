/**
 * Deterministic, zero-dependency detectors for the Prompt Scanner.
 *
 * Every detector is a pure function: same input, same output, no I/O. They run
 * before the LLM injection classifier because they're instant, free, and have
 * zero false-negative tolerance for the things they *do* know how to find
 * (Luhn-valid card numbers, known API key prefixes, etc).
 *
 * All spans are character offsets into the original input string — the UI uses
 * them directly for inline highlighting and one-click redaction, so getting an
 * off-by-one wrong here breaks the most demo-able feature in the app.
 */

import type { Finding, Severity } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Masks a matched string for safe logging/rendering: first 3 chars, an
 * ellipsis, then the last 2 chars. Short strings are fully masked instead,
 * since "first 3 + last 2" of a 4-char string would leak the whole thing.
 */
function maskExcerpt(raw: string): string {
  if (raw.length <= 6) return "*".repeat(raw.length);
  return `${raw.slice(0, 3)}…${raw.slice(-2)}`;
}

function makeFinding(
  type: Finding["type"],
  severity: Severity,
  start: number,
  end: number,
  raw: string,
  suggestion: string,
  confidence = 1,
): Finding {
  return {
    type,
    severity,
    span: { start, end },
    excerpt: maskExcerpt(raw),
    suggestion,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function detectEmails(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of text.matchAll(EMAIL_RE)) {
    const start = m.index;
    const end = start + m[0].length;
    findings.push(
      makeFinding(
        "email",
        "medium",
        start,
        end,
        m[0],
        "Remove or redact the email address before sending to a third-party model.",
      ),
    );
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------

// Requires at least two separators (three digit groups) so bare 4-digit years
// ("2026"), ports ("8080"), or long undelimited digit runs (credit cards)
// never match — those either lack separators entirely or get caught by the
// (?<!\d)/(?!\d) boundary guards below.
const PHONE_RE =
  /(?<!\d)(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{2,4}[\s.-]\d{2,9}(?!\d)/g;

// ISO (YYYY-MM-DD) and common US (MM/DD/YYYY) date shapes accidentally match
// the phone grammar above (three separated digit groups). We exclude them by
// shape rather than trying to make the phone regex smarter, since a real
// phone number practically never uses "-" with a 4-digit leading group.
const ISO_DATE_RE = /^\d{4}[-/.]\d{2}[-/.]\d{2}$/;
const US_DATE_RE = /^\d{2}[-/.]\d{2}[-/.]\d{4}$/;

export function detectPhones(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of text.matchAll(PHONE_RE)) {
    const raw = m[0];
    if (ISO_DATE_RE.test(raw) || US_DATE_RE.test(raw)) continue;

    const digitCount = (raw.match(/\d/g) ?? []).length;
    // E.164 allows 7-15 digits total (national numbers can run as short as 7).
    if (digitCount < 7 || digitCount > 15) continue;

    const start = m.index;
    const end = start + raw.length;
    findings.push(
      makeFinding(
        "phone",
        "medium",
        start,
        end,
        raw,
        "Remove or redact the phone number before sending to a third-party model.",
      ),
    );
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Credit card
// ---------------------------------------------------------------------------

/** Real Luhn checksum. `digits` must already be a string of only [0-9]. */
export function luhn(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// 13-19 digits, optionally grouped with spaces or dashes.
const CARD_CANDIDATE_RE = /\b(?:\d[ -]?){12,18}\d\b/g;

export function detectCreditCards(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of text.matchAll(CARD_CANDIDATE_RE)) {
    const raw = m[0];
    const digits = raw.replace(/[ -]/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    // Luhn is the whole point: never emit a finding for a number that fails
    // the checksum, or the scanner cries wolf on every 16-digit phone/order
    // number and demo viewers stop trusting it within thirty seconds.
    if (!luhn(digits)) continue;

    const start = m.index;
    const end = start + raw.length;
    findings.push(
      makeFinding(
        "credit_card",
        "critical",
        start,
        end,
        raw,
        "Remove the card number. Card numbers should never be sent in a chat prompt.",
      ),
    );
  }
  return findings;
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

// Longer/more specific alternatives are listed before their prefixes (e.g.
// "sk-ant-" before "sk-") since regex alternation takes the first match at a
// given position.
const API_KEY_PREFIX_RE =
  /\b(?:sk-ant-[A-Za-z0-9_-]{10,}|sk-live-[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9]{10,}|pk_live_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{12,}|gsk_[A-Za-z0-9]{20,}|xoxb-[A-Za-z0-9-]{10,}|AIza[A-Za-z0-9_-]{30,}|glpat-[A-Za-z0-9_-]{15,}|npm_[A-Za-z0-9]{30,})\b/g;

// Fallback candidate tokens for the entropy check: 20+ chars of key-shaped
// characters with no whitespace. English prose essentially never produces a
// single unbroken token this long, so this stays low-noise.
const HIGH_ENTROPY_TOKEN_RE = /[A-Za-z0-9_-]{20,}/g;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENTROPY_THRESHOLD = 3.5;

/** Shannon entropy in bits/char over the string's character distribution. */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

export function detectApiKeys(text: string): Finding[] {
  const findings: Finding[] = [];
  const prefixSpans: Array<{ start: number; end: number }> = [];

  for (const m of text.matchAll(API_KEY_PREFIX_RE)) {
    const start = m.index;
    const end = start + m[0].length;
    prefixSpans.push({ start, end });
    findings.push(
      makeFinding(
        "api_key",
        "critical",
        start,
        end,
        m[0],
        "Revoke this key immediately and remove it from the prompt — it matches a known provider format.",
      ),
    );
  }

  // Entropy fallback catches keys with no recognizable prefix. UUIDs are
  // deliberately skipped: they're high-entropy over a 16-symbol alphabet and
  // would otherwise dominate false positives in any prompt that mentions a
  // record ID. The tradeoff favors not crying wolf on UUIDs over the (rare)
  // case of a secret that happens to be UUID-shaped.
  for (const m of text.matchAll(HIGH_ENTROPY_TOKEN_RE)) {
    const raw = m[0];
    const start = m.index;
    const end = start + raw.length;
    const span = { start, end };

    if (prefixSpans.some((p) => rangesOverlap(p, span))) continue;
    if (UUID_RE.test(raw)) continue;
    if (/^\d+$/.test(raw)) continue; // long digit runs (handled elsewhere / not key-shaped)

    const entropy = shannonEntropy(raw);
    if (entropy > ENTROPY_THRESHOLD) {
      findings.push(
        makeFinding(
          "api_key",
          "critical",
          start,
          end,
          raw,
          "This token has the entropy profile of a secret key. Verify and remove it if real.",
          0.75,
        ),
      );
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Passwords (contextual)
// ---------------------------------------------------------------------------

const PASSWORD_CONTEXT_RE =
  /\b(?:password|passwd|pwd|pw|secret|api[_-]?token|auth[_-]?token)\s*[:=]\s*(\S+)/gi;

export function detectPasswords(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const m of text.matchAll(PASSWORD_CONTEXT_RE)) {
    const value = m[1];
    const valueStart = m.index + m[0].length - value.length;
    const valueEnd = valueStart + value.length;
    findings.push(
      makeFinding(
        "password",
        "high",
        valueStart,
        valueEnd,
        value,
        "Remove the password/secret value from the prompt.",
      ),
    );
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Prompt injection heuristics
// ---------------------------------------------------------------------------

interface InjectionPattern {
  re: RegExp;
  severity: Severity;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  { re: /ignore\s+(?:all\s+)?previous\s+instructions/gi, severity: "critical" },
  { re: /disregard\s+(?:the\s+)?above/gi, severity: "critical" },
  { re: /reveal\s+your\s+(?:system\s+)?instructions/gi, severity: "critical" },
  { re: /system\s+prompt/gi, severity: "high" },
  { re: /you\s+are\s+now\b/gi, severity: "high" },
  { re: /\bDAN\s+mode\b/gi, severity: "high" },
  { re: /developer\s+mode/gi, severity: "medium" },
  { re: /###\s*system\b/gi, severity: "medium" },
  { re: /<\|im_start\|>/g, severity: "medium" },
  // Base64-looking blobs are a common exfiltration/encoding smuggling vector.
  { re: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, severity: "medium" },
];

export function detectInjectionHeuristics(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    for (const m of text.matchAll(pattern.re)) {
      const start = m.index;
      const end = start + m[0].length;
      findings.push(
        makeFinding(
          "injection",
          pattern.severity,
          start,
          end,
          m[0],
          "This text matches a known prompt-injection pattern. Review before sending.",
        ),
      );
    }
  }
  return findings;
}
