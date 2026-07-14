/**
 * The Last Line firewall pipeline.
 *
 * LangGraph.js state machine joining the four analysis stages. The graph is
 * linear by design — the parallelism that matters lives *inside* the verify
 * node, which fans out across claims.
 *
 *   scan → extract → verify → hallucination → score
 *
 * Providers are injected, so the whole graph runs offline in tests.
 * Every node is failure-tolerant: a stage that dies degrades its output rather
 * than throwing, because a broken firewall must never take the chat down with it.
 */

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";

import type {
  Analysis,
  AnalysisEvent,
  CacheProvider,
  Claim,
  HallucinationEstimate,
  LLMProvider,
  ScanResult,
  SearchProvider,
  TrustScore,
  VerifiedClaim,
} from "@/lib/types";

import { scanPrompt } from "@/lib/firewall/scanner";
import { extractClaims } from "@/lib/firewall/claims";
import { verifyClaims } from "@/lib/firewall/verify";
import { estimateHallucination } from "@/lib/firewall/hallucination";
import { computeTrustScore } from "@/lib/firewall/score";

export interface FirewallDeps {
  llm: LLMProvider;
  search: SearchProvider;
  cache?: CacheProvider;
}

const FirewallState = Annotation.Root({
  prompt: Annotation<string>(),
  response: Annotation<string>(),
  messageId: Annotation<string>(),
  /** Self-reported confidence from the chat model; a weak tiebreaker signal. */
  modelConfidence: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0.5,
  }),
  scan: Annotation<ScanResult | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  claims: Annotation<Claim[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  verified: Annotation<VerifiedClaim[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  hallucination: Annotation<HallucinationEstimate | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  trust: Annotation<TrustScore | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type State = typeof FirewallState.State;

/**
 * A scan that fails open. Used when the scanner itself errors: we must still
 * produce a well-formed ScanResult so scoring has something to work with.
 */
function emptyScan(): ScanResult {
  return {
    findings: [],
    injection: {
      isInjection: false,
      confidence: 0,
      technique: null,
      rationale: "Scanner unavailable; prompt was not analyzed.",
    },
    riskLevel: "none",
    redacted: "",
    blocked: false,
  };
}

export function buildFirewallGraph(deps: FirewallDeps) {
  const graph = new StateGraph(FirewallState)
    .addNode("scan_node", async (s: State) => ({
      scan: await scanPrompt(s.prompt, { llm: deps.llm, cache: deps.cache }).catch(emptyScan),
    }))
    .addNode("extract_node", async (s: State) => ({
      claims: await extractClaims(s.response, deps.llm),
    }))
    .addNode("verify_node", async (s: State) => ({
      verified: await verifyClaims(s.claims, {
        search: deps.search,
        llm: deps.llm,
        cache: deps.cache,
      }),
    }))
    .addNode("hallucination_node", (s: State) => ({
      hallucination: estimateHallucination(s.verified, s.modelConfidence),
    }))
    .addNode("score_node", (s: State) => ({
      trust: computeTrustScore({
        claims: s.verified,
        hallucination: s.hallucination ?? estimateHallucination(s.verified, s.modelConfidence),
        scan: s.scan ?? emptyScan(),
      }),
    }))
    .addEdge(START, "scan_node")
    .addEdge("scan_node", "extract_node")
    .addEdge("extract_node", "verify_node")
    .addEdge("verify_node", "hallucination_node")
    .addEdge("hallucination_node", "score_node")
    .addEdge("score_node", END);

  return graph.compile();
}

export interface RunFirewallInput {
  prompt: string;
  response: string;
  messageId: string;
  modelConfidence?: number;
}

/** One-shot run. Returns the complete Analysis. */
export async function runFirewall(
  input: RunFirewallInput,
  deps: FirewallDeps,
): Promise<Analysis> {
  const started = Date.now();
  const app = buildFirewallGraph(deps);

  const out = (await app.invoke({
    prompt: input.prompt,
    response: input.response,
    messageId: input.messageId,
    modelConfidence: input.modelConfidence ?? 0.5,
  })) as State;

  const scan = out.scan ?? emptyScan();
  const hallucination =
    out.hallucination ?? estimateHallucination(out.verified ?? [], input.modelConfidence ?? 0.5);
  const trust =
    out.trust ?? computeTrustScore({ claims: out.verified ?? [], hallucination, scan });

  return {
    messageId: input.messageId,
    claims: out.verified ?? [],
    hallucination,
    trust,
    scan,
    durationMs: Date.now() - started,
  };
}

/**
 * Streaming run. Yields AnalysisEvents as each stage completes so the
 * Explainability Panel fills in progressively rather than blocking on the
 * slowest claim. This is what lets the analysis land while the chat answer is
 * still streaming.
 */
export async function* streamFirewall(
  input: RunFirewallInput,
  deps: FirewallDeps,
): AsyncGenerator<AnalysisEvent> {
  const started = Date.now();
  const modelConfidence = input.modelConfidence ?? 0.5;

  try {
    const scan = await scanPrompt(input.prompt, { llm: deps.llm, cache: deps.cache }).catch(
      emptyScan,
    );
    yield { type: "scan", scan };

    const claims = await extractClaims(input.response, deps.llm);
    yield { type: "claims", claims };

    const verified = await verifyClaims(claims, {
      search: deps.search,
      llm: deps.llm,
      cache: deps.cache,
    });
    for (const claim of verified) {
      yield { type: "claim_verified", claim };
    }

    const hallucination = estimateHallucination(verified, modelConfidence);
    yield { type: "hallucination", estimate: hallucination };

    const trust = computeTrustScore({ claims: verified, hallucination, scan });
    yield { type: "trust", trust };

    yield {
      type: "done",
      analysis: {
        messageId: input.messageId,
        claims: verified,
        hallucination,
        trust,
        scan,
        durationMs: Date.now() - started,
      },
    };
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : "Firewall analysis failed.",
    };
  }
}
