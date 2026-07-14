import { useState } from "react";
import { usePanelState } from "./store";
import type { VerifiedClaim } from "@/lib/types";

const COLOR = {
  verified: "#10b981",
  caution: "#eab308",
  risk: "#ef4444",
  accent: "#3b82f6",
  bg: "#0c1017",
  surface2: "#121824",
  border: "#1e2637",
  fg: "#e6edf7",
  muted: "#7d8da6",
};

const VERDICT_COLOR: Record<VerifiedClaim["verdict"], string> = {
  verified: COLOR.verified,
  unverified: COLOR.caution,
  contradicted: COLOR.risk,
};

const BAND_COLOR: Record<string, string> = {
  verified: COLOR.verified,
  caution: COLOR.caution,
  risk: COLOR.risk,
};

function ClaimRow({ claim }: { claim: VerifiedClaim }) {
  const [open, setOpen] = useState(false);
  const color = VERDICT_COLOR[claim.verdict];
  return (
    <div
      style={{
        border: `1px solid ${color}44`,
        background: `${color}14`,
        borderRadius: 8,
        padding: "8px 10px",
        marginBottom: 8,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          width: "100%",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12.5, color: COLOR.fg }}>{claim.text}</span>
        <span style={{ fontSize: 11, color, flexShrink: 0, textTransform: "capitalize" }}>
          {claim.verdict}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 6, borderTop: `1px solid ${COLOR.border}`, paddingTop: 6 }}>
          <p style={{ fontSize: 11, color: COLOR.muted, margin: 0 }}>{claim.reasoning}</p>
          {claim.evidence.map((e) => (
            <a
              key={e.url}
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                fontSize: 11,
                color: COLOR.accent,
                marginTop: 6,
                textDecoration: "none",
              }}
            >
              {e.title || e.url}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function Panel() {
  const state = usePanelState();
  if (!state.visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        width: 320,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        background: `${COLOR.bg}f0`,
        backdropFilter: "blur(12px)",
        border: `1px solid ${COLOR.border}`,
        borderRadius: 14,
        padding: 16,
        fontFamily: "system-ui, sans-serif",
        color: COLOR.fg,
        zIndex: 2147483647,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Last Line</span>
        {state.loading && <span style={{ fontSize: 11, color: COLOR.accent }}>analyzing…</span>}
      </div>

      {state.error && (
        <p style={{ fontSize: 11, color: COLOR.risk, marginTop: 8 }}>{state.error}</p>
      )}

      {state.trust ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 600 }}>{Math.round(state.trust.score)}</span>
          <span style={{ fontSize: 12, color: COLOR.muted }}>/100</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: BAND_COLOR[state.trust.band],
              textTransform: "capitalize",
            }}
          >
            {state.trust.band}
          </span>
        </div>
      ) : (
        <div
          style={{
            height: 40,
            marginTop: 12,
            borderRadius: 8,
            background: COLOR.surface2,
          }}
        />
      )}

      {state.scan && state.scan.injection.isInjection && (
        <div
          style={{
            marginTop: 12,
            border: `1px solid ${COLOR.risk}44`,
            background: `${COLOR.risk}14`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 11.5,
            color: COLOR.risk,
          }}
        >
          Prompt injection detected
          {state.scan.injection.technique ? ` — ${state.scan.injection.technique}` : ""}
        </div>
      )}

      {state.hallucination && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              color: COLOR.muted,
              marginBottom: 4,
            }}
          >
            Hallucination risk
          </div>
          <div
            style={{
              height: 5,
              borderRadius: 999,
              background: COLOR.surface2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(state.hallucination.risk * 100)}%`,
                background: COLOR.risk,
              }}
            />
          </div>
        </div>
      )}

      {state.claims && state.claims.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              color: COLOR.muted,
              marginBottom: 6,
            }}
          >
            Claims ({state.claims.length})
          </div>
          {state.claims.map((c) => (
            <ClaimRow key={c.id} claim={c} />
          ))}
        </div>
      )}
    </div>
  );
}
