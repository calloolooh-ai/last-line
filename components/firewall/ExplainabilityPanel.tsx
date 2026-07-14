import type { Analysis } from "@/lib/types";
import { TrustScoreDial } from "@/components/firewall/TrustScoreDial";
import { RiskBadge } from "@/components/firewall/RiskBadge";
import { InjectionAlert } from "@/components/firewall/InjectionAlert";
import { ClaimCard } from "@/components/firewall/ClaimCard";

export interface PartialAnalysis {
  scan?: Analysis["scan"];
  claims?: Analysis["claims"];
  hallucination?: Analysis["hallucination"];
  trust?: Analysis["trust"];
  loading: boolean;
  error?: string;
}

export function ExplainabilityPanel({ analysis }: { analysis: PartialAnalysis }) {
  return (
    <div className="glass animate-rise flex w-full max-w-sm shrink-0 flex-col gap-4 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Trust analysis</h3>
        {analysis.loading && (
          <span className="text-xs text-accent">analyzing…</span>
        )}
      </div>

      {analysis.error && <p className="text-xs text-risk">{analysis.error}</p>}

      {analysis.trust ? (
        <TrustScoreDial trust={analysis.trust} />
      ) : (
        <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
      )}

      {analysis.scan && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Prompt scan
            </h4>
            <RiskBadge severity={analysis.scan.riskLevel} />
          </div>
          <InjectionAlert injection={analysis.scan.injection} />
        </section>
      )}

      {analysis.hallucination && (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Hallucination risk
          </h4>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-risk transition-all duration-500"
              style={{ width: `${Math.round(analysis.hallucination.risk * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted">{analysis.hallucination.explanation}</p>
        </section>
      )}

      {analysis.claims && analysis.claims.length > 0 && (
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Claims ({analysis.claims.length})
          </h4>
          <div className="flex flex-col gap-2">
            {analysis.claims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
