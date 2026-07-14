import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/types";

const SEVERITY_STYLE: Record<Severity, string> = {
  none: "bg-verified-dim text-verified border-verified/30",
  low: "bg-verified-dim text-verified border-verified/30",
  medium: "bg-caution-dim text-caution border-caution/30",
  high: "bg-risk-dim text-risk border-risk/30",
  critical: "bg-risk-dim text-risk border-risk/40 animate-pulse-ring",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  none: "Clean",
  low: "Low risk",
  medium: "Caution",
  high: "High risk",
  critical: "Blocked",
};

export function RiskBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        SEVERITY_STYLE[severity],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}
