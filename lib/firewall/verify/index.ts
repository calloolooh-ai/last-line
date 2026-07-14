/**
 * Verification — grounds a claim in live search evidence and asks a judge model
 * to rule on it using ONLY that evidence.
 *
 * Pure over its injected SearchProvider / LLMProvider / CacheProvider. No direct
 * SDK imports, no Prisma, no Next.
 *
 * ETHICAL CORE OF THE PROJECT: the judge is never allowed to recall facts from
 * its own training data. If retrieval comes back empty or the evidence is
 * unrelated, the verdict is "unverified" — not "contradicted". Absence of
 * evidence lowers confidence; it never manufactures a contradiction. See the
 * judge system prompt below and the explicit test in verify.test.ts.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  CacheProvider,
  Claim,
  Evidence,
  LLMProvider,
  SearchProvider,
  VerifiedClaim,
  Verdict,
} from "@/lib/types";
import { CACHE_TTL, MAX_VERIFIED_CLAIMS } from "@/lib/firewall/weights";

const JUDGE_SYSTEM_PROMPT = `You are a fact-verification judge. You will be given a claim and a set of
search-result excerpts retrieved for it. Your ONLY job is to rule on the claim using the supplied
evidence.

HARD RULE — READ CAREFULLY: you must NEVER use your own background knowledge or training-data
memory to judge the claim. You may only reason from the text of the evidence you were given.

- If the evidence clearly supports the claim, verdict = "verified".
- If the evidence clearly and directly contradicts the claim, verdict = "contradicted".
- If there is no evidence, the evidence is irrelevant, or the evidence is inconclusive/mixed,
  verdict = "unverified". This is the default when you are unsure. Absence of evidence is NOT
  the same as contradiction — never rule "contradicted" just because nothing confirms the claim.
- For each source provided, classify its stance toward the claim as "supports", "contradicts",
  or "neutral".
- confidence (0-1) reflects how strong and direct the evidence is. No evidence => low confidence
  (near 0), even if you personally believe the claim is true or false.
- reasoning must reference the evidence, not outside knowledge.`;

const judgeSchema = z.object({
  verdict: z.enum(["verified", "unverified", "contradicted"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  stances: z.array(z.enum(["supports", "contradicts", "neutral"])),
});

type JudgeResult = z.infer<typeof judgeSchema>;

interface VerifyDeps {
  search: SearchProvider;
  llm: LLMProvider;
  cache?: CacheProvider;
}

function cacheKey(claimText: string): string {
  const hash = createHash("sha256").update(claimText).digest("hex");
  return `verify:claim:${hash}`;
}

function buildSearchQuery(claim: Claim): string {
  // Strip trailing punctuation; search engines don't need it and it can hurt
  // exact-phrase-ish scoring on some providers.
  return claim.text.replace(/[.!?]+$/, "").trim();
}

function unverifiedFallback(claim: Claim, reasoning: string): VerifiedClaim {
  return {
    ...claim,
    verdict: "unverified",
    confidence: 0,
    reasoning,
    evidence: [],
  };
}

export async function verifyClaim(
  claim: Claim,
  deps: VerifyDeps
): Promise<VerifiedClaim> {
  const { search, llm, cache } = deps;
  const key = cacheKey(claim.text);

  try {
    if (cache) {
      const cached = await cache.get<VerifiedClaim>(key);
      if (cached) return cached;
    }
  } catch {
    // Cache read failure is non-fatal — fall through to a live verification.
  }

  let hits: Awaited<ReturnType<SearchProvider["search"]>> = [];
  try {
    hits = await search.search(buildSearchQuery(claim), { maxResults: 5 });
  } catch {
    // Search outage: no evidence available. This is exactly the "absence of
    // evidence" case, so the verdict must be unverified, never contradicted.
    return unverifiedFallback(
      claim,
      "Search provider failed, so no evidence could be retrieved. The claim was not checked; absence of evidence is not treated as contradiction."
    );
  }

  if (!hits || hits.length === 0) {
    // No evidence retrieved — the ethical core: this is "unverified", never
    // "contradicted". We never let a judge model rule on a claim it can't see
    // evidence for.
    return unverifiedFallback(
      claim,
      "No search evidence was found for this claim. Absence of evidence does not imply the claim is false."
    );
  }

  const evidencePrompt = hits
    .map(
      (h, i) =>
        `[Source ${i + 1}] ${h.title}\nURL: ${h.url}\n${h.content}`
    )
    .join("\n\n");

  let verified: VerifiedClaim;
  try {
    const result = await llm.classify<JudgeResult>({
      system: JUDGE_SYSTEM_PROMPT,
      prompt: `Claim: "${claim.text}"\n\nEvidence:\n${evidencePrompt}`,
      schema: judgeSchema,
    });

    if (!result) {
      verified = unverifiedFallback(
        claim,
        "The judge model returned no result. The claim was not verified."
      );
    } else {
      const evidence: Evidence[] = hits.map((h, i) => ({
        url: h.url,
        title: h.title,
        snippet: h.content.slice(0, 400),
        stance: result.stances?.[i] ?? "neutral",
        relevance: h.score,
      }));

      // Guard the ethical invariant even if the judge model misbehaves: a
      // "contradicted" verdict requires at least one source that actually
      // contradicts. Otherwise downgrade to unverified rather than trust an
      // unsupported contradiction claim.
      const verdict: Verdict =
        result.verdict === "contradicted" &&
        !evidence.some((e) => e.stance === "contradicts")
          ? "unverified"
          : result.verdict;

      verified = {
        ...claim,
        verdict,
        confidence: result.confidence,
        reasoning: result.reasoning,
        evidence,
      };
    }
  } catch {
    return unverifiedFallback(
      claim,
      "The verification judge failed to produce a ruling. The claim was not verified."
    );
  }

  try {
    if (cache) {
      await cache.set(key, verified, CACHE_TTL.claim);
    }
  } catch {
    // Cache write failure must not fail verification.
  }

  return verified;
}

export async function verifyClaims(
  claims: Claim[],
  deps: VerifyDeps
): Promise<VerifiedClaim[]> {
  if (claims.length === 0) return [];

  // Prefer verifying isSpecific claims first when over the cap — unsourced
  // specifics (numbers, dates, named entities) are the highest-value checks.
  const ranked = [...claims].sort((a, b) => {
    if (a.isSpecific === b.isSpecific) return 0;
    return a.isSpecific ? -1 : 1;
  });

  const toVerify = ranked.slice(0, MAX_VERIFIED_CLAIMS);
  const overCap = ranked.slice(MAX_VERIFIED_CLAIMS);

  const settled = await Promise.allSettled(
    toVerify.map((claim) => verifyClaim(claim, deps))
  );

  const verifiedById = new Map<string, VerifiedClaim>();

  settled.forEach((result, i) => {
    const claim = toVerify[i];
    if (result.status === "fulfilled") {
      verifiedById.set(claim.id, result.value);
    } else {
      // Promise.allSettled means one claim rejecting can never fail the batch.
      verifiedById.set(
        claim.id,
        unverifiedFallback(
          claim,
          "Verification threw an unexpected error and was not completed."
        )
      );
    }
  });

  for (const claim of overCap) {
    verifiedById.set(
      claim.id,
      unverifiedFallback(
        claim,
        `Not checked: the response contained more than ${MAX_VERIFIED_CLAIMS} claims, and this one fell outside the per-message verification cap.`
      )
    );
  }

  // Preserve the original input order/length — callers rely on a 1:1
  // correspondence between input claims and output verified claims.
  return claims.map((claim) => verifiedById.get(claim.id)!);
}
