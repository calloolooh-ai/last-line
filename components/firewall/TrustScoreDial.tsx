import { cn } from "@/lib/utils";
import type { TrustBand, TrustScore } from "@/lib/types";

const BAND_COLOR: Record<TrustBand, string> = {
  verified: "var(--verified)",
  caution: "var(--caution)",
  risk: "var(--risk)",
};

const BAND_LABEL: Record<TrustBand, string> = {
  verified: "Verified",
  caution: "Caution",
  risk: "At risk",
};

export function TrustScoreDial({ trust, size = 96 }: { trust: TrustScore; size?: number }) {
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - trust.score / 100);
  const color = BAND_COLOR[trust.band];

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="flex flex-col">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {Math.round(trust.score)}
          <span className="text-sm font-normal text-muted">/100</span>
        </span>
        <span className={cn("text-sm font-medium")} style={{ color }}>
          {BAND_LABEL[trust.band]}
        </span>
      </div>
    </div>
  );
}
