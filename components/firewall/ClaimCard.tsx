"use client";

import { useState } from "react";
import type { VerifiedClaim } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EvidenceList } from "@/components/firewall/EvidenceList";

const VERDICT_STYLE: Record<VerifiedClaim["verdict"], string> = {
  verified: "border-verified/30 bg-verified-dim",
  unverified: "border-caution/30 bg-caution-dim",
  contradicted: "border-risk/30 bg-risk-dim",
};

const VERDICT_LABEL: Record<VerifiedClaim["verdict"], string> = {
  verified: "Verified",
  unverified: "Unverified",
  contradicted: "Contradicted",
};

export function ClaimCard({ claim }: { claim: VerifiedClaim }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("animate-rise rounded-lg border p-2.5", VERDICT_STYLE[claim.verdict])}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <span className="text-sm text-foreground">{claim.text}</span>
        <span className="shrink-0 text-xs font-medium">{VERDICT_LABEL[claim.verdict]}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2">
          <p className="text-xs text-muted">{claim.reasoning}</p>
          <EvidenceList evidence={claim.evidence} />
        </div>
      )}
    </div>
  );
}
