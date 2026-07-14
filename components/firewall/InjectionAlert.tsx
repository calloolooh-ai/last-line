import type { InjectionAssessment } from "@/lib/types";

export function InjectionAlert({ injection }: { injection: InjectionAssessment }) {
  if (!injection.isInjection) return null;

  return (
    <div className="animate-rise rounded-lg border border-risk/30 bg-risk-dim px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2 font-medium text-risk">
        <span className="h-1.5 w-1.5 rounded-full bg-risk" />
        Prompt injection detected
        {injection.technique && (
          <span className="rounded border border-risk/30 px-1.5 py-0.5 text-xs font-mono">
            {injection.technique}
          </span>
        )}
      </div>
      <p className="mt-1 text-muted">{injection.rationale}</p>
    </div>
  );
}
