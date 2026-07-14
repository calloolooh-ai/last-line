/**
 * Shared contracts for the Last Line firewall.
 *
 * Every firewall module is a pure function over these types. Modules must not
 * import Prisma, Next, or React — they take their providers by injection so the
 * whole pipeline is testable without network access.
 */

// ---------------------------------------------------------------------------
// Severity + risk
// ---------------------------------------------------------------------------

export type Severity = "none" | "low" | "medium" | "high" | "critical";

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  none: 0,
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};

// ---------------------------------------------------------------------------
// Prompt scanning (outbound)
// ---------------------------------------------------------------------------

export type FindingType =
  | "email"
  | "phone"
  | "api_key"
  | "password"
  | "credit_card"
  | "injection";

export interface Finding {
  type: FindingType;
  severity: Severity;
  /** Character offsets into the original prompt. Powers inline highlight + redact. */
  span: { start: number; end: number };
  /** The matched text, already masked for safe display/logging. */
  excerpt: string;
  /** Human-readable remediation shown in the UI. */
  suggestion: string;
  /** Detector confidence, 0-1. Deterministic detectors report 1. */
  confidence: number;
}

export interface InjectionAssessment {
  isInjection: boolean;
  confidence: number;
  /** e.g. "instruction_override", "role_play", "encoding", "exfiltration" */
  technique: string | null;
  rationale: string;
}

export interface ScanResult {
  findings: Finding[];
  injection: InjectionAssessment;
  /** Worst severity across all findings. */
  riskLevel: Severity;
  /** Prompt with every finding span replaced by a typed placeholder. */
  redacted: string;
  /** True when the prompt should be held for user confirmation before sending. */
  blocked: boolean;
}

// ---------------------------------------------------------------------------
// Claims + verification (inbound)
// ---------------------------------------------------------------------------

export type Verdict = "verified" | "unverified" | "contradicted";

export interface Claim {
  id: string;
  /** A single, self-contained, checkable assertion. */
  text: string;
  /** Contains numbers, dates, or named entities — unsourced specifics are the hallucination tell. */
  isSpecific: boolean;
}

export interface Evidence {
  url: string;
  title: string;
  snippet: string;
  /** Does this source support the claim, contradict it, or neither? */
  stance: "supports" | "contradicts" | "neutral";
  /** Search-provider relevance, 0-1. */
  relevance: number;
}

export interface VerifiedClaim extends Claim {
  verdict: Verdict;
  /** Confidence in the verdict itself, 0-1. */
  confidence: number;
  reasoning: string;
  evidence: Evidence[];
}

// ---------------------------------------------------------------------------
// Hallucination
// ---------------------------------------------------------------------------

export interface HallucinationEstimate {
  /** 0-1. Higher is worse. */
  risk: number;
  signals: {
    contradictionRate: number;
    unverifiedSpecificRate: number;
    /** 0-1, self-reported by the model. Weak signal, used only as a tiebreaker. */
    modelConfidence: number;
  };
  explanation: string;
}

// ---------------------------------------------------------------------------
// Trust score
// ---------------------------------------------------------------------------

export type TrustBand = "verified" | "caution" | "risk";

export interface TrustScore {
  /** 0-100. */
  score: number;
  band: TrustBand;
  components: {
    /** null when the response contains no factual claims; weight is redistributed. */
    verification: number | null;
    hallucination: number;
    injection: number;
    privacy: number;
  };
  /** Effective weights actually used, after any redistribution. */
  weights: Record<"verification" | "hallucination" | "injection" | "privacy", number>;
  summary: string;
}

// ---------------------------------------------------------------------------
// Full analysis of one assistant message
// ---------------------------------------------------------------------------

export interface Analysis {
  messageId: string;
  claims: VerifiedClaim[];
  hallucination: HallucinationEstimate;
  trust: TrustScore;
  /** The scan of the *prompt* that produced this response. */
  scan: ScanResult;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Provider interfaces — injected, so every module is testable offline
// ---------------------------------------------------------------------------

export interface SearchHit {
  url: string;
  title: string;
  content: string;
  score: number;
}

export interface SearchProvider {
  search(query: string, opts?: { maxResults?: number }): Promise<SearchHit[]>;
}

/** Structured completion. Implementations must coerce to the given Zod-validated shape. */
export interface LLMProvider {
  /** Fast, cheap tier — firewall internals. */
  classify<T>(args: {
    system: string;
    prompt: string;
    schema: unknown;
  }): Promise<T>;
  /** Quality tier — the user-facing answer. Returns a text stream. */
  streamChat(args: {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }): AsyncIterable<string>;
}

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Streaming analysis events (server -> Explainability Panel over SSE)
// ---------------------------------------------------------------------------

export type AnalysisEvent =
  | { type: "scan"; scan: ScanResult }
  | { type: "claims"; claims: Claim[] }
  | { type: "claim_verified"; claim: VerifiedClaim }
  | { type: "hallucination"; estimate: HallucinationEstimate }
  | { type: "trust"; trust: TrustScore }
  | { type: "done"; analysis: Analysis }
  | { type: "error"; message: string };
