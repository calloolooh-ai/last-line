"use client";

import { useMemo, useState } from "react";
import { prescan } from "@/lib/firewall/prescan";
import { redact } from "@/lib/firewall/scanner/redact";
import { RiskBadge } from "@/components/firewall/RiskBadge";
import { cn } from "@/lib/utils";

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const scan = useMemo(() => prescan(value), [value]);

  function handleRedact() {
    setValue((v) => redact(v, scan.findings));
  }

  function handleSend() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  }

  return (
    <div className="glass flex w-full flex-col gap-2 rounded-xl p-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Ask something…"
        rows={2}
        className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {value.length > 0 && <RiskBadge severity={scan.riskLevel} />}
          {scan.findings.length > 0 && (
            <button
              type="button"
              onClick={handleRedact}
              className="rounded-full border border-caution/30 bg-caution-dim px-2.5 py-1 text-xs font-medium text-caution hover:border-caution/60"
            >
              Redact {scan.findings.length} finding{scan.findings.length === 1 ? "" : "s"}
            </button>
          )}
          {scan.hasInjectionSignal && (
            <span className="text-xs text-risk">possible injection</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || value.trim().length === 0}
          className={cn(
            "rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-opacity",
            (disabled || value.trim().length === 0) && "opacity-40",
          )}
        >
          Send
        </button>
      </div>
    </div>
  );
}
