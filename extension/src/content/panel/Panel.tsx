import { useEffect, useState } from "react";
import { usePanelState, markDismissedLocally } from "./store";
import { isDismissed, markDismissed, signatureFor } from "../feedback";
import type { VerifiedClaim } from "@/lib/types";
import type { CodeRisk } from "../codeRisks";

/** Warm monochrome palette — off-black text, bone canvas, ultra-light borders, washed-out pastel accents only. */
const COLOR = {
  canvas: "#FBFBFA",
  surface: "#FFFFFF",
  border: "#EAEAEA",
  text: "#2F3437",
  muted: "#787774",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', monospace",
  sans: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif",
  paleRed: { bg: "#FDEBEC", fg: "#9F2F2D" },
  paleBlue: { bg: "#E1F3FE", fg: "#1F6C9F" },
  paleGreen: { bg: "#EDF3EC", fg: "#346538" },
  paleYellow: { bg: "#FBF3DB", fg: "#956400" },
};

const VERDICT_PASTEL: Record<VerifiedClaim["verdict"], { bg: string; fg: string }> = {
  verified: COLOR.paleGreen,
  unverified: COLOR.paleYellow,
  contradicted: COLOR.paleRed,
};

const BAND_PASTEL: Record<string, { bg: string; fg: string }> = {
  verified: COLOR.paleGreen,
  caution: COLOR.paleYellow,
  risk: COLOR.paleRed,
};

const SEVERITY_PASTEL: Record<string, { bg: string; fg: string }> = {
  low: COLOR.paleGreen,
  medium: COLOR.paleYellow,
  high: COLOR.paleRed,
  critical: COLOR.paleRed,
};

function Tag({ children, pastel }: { children: React.ReactNode; pastel: { bg: string; fg: string } }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        padding: "2px 8px",
        borderRadius: 9999,
        background: pastel.bg,
        color: pastel.fg,
      }}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: COLOR.muted,
        marginBottom: 8,
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

/** One-click "this was wrong" — persists a per-signature dismissal locally so an identical future match stops re-flagging. */
function FeedbackButton({ signature }: { signature: string }) {
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        await markDismissed(signature);
        markDismissedLocally(signature);
      }}
      style={{
        border: `1px solid ${COLOR.border}`,
        background: "transparent",
        color: COLOR.muted,
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 10.5,
        fontFamily: COLOR.sans,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      Not accurate
    </button>
  );
}

function ClaimRow({ claim, dismissed }: { claim: VerifiedClaim; dismissed: boolean }) {
  const [open, setOpen] = useState(false);
  const pastel = VERDICT_PASTEL[claim.verdict];
  const signature = signatureFor("claim", claim.text);

  // evidence.length is the ground truth for how this claim was actually
  // checked — the judge is architecturally forbidden from using its own
  // training-data knowledge (see verify/index.ts), so there is no separate
  // "model knowledge" verification path to distinguish from web search.
  const method = claim.evidence.length > 0 ? `Checked against ${claim.evidence.length} source${claim.evidence.length === 1 ? "" : "s"}` : "No evidence found";

  if (dismissed) return null;

  return (
    <div
      style={{
        border: `1px solid ${COLOR.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
        background: COLOR.surface,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            all: "unset",
            cursor: "pointer",
            flex: 1,
            fontSize: 12.5,
            color: COLOR.text,
            lineHeight: 1.5,
          }}
        >
          {claim.text}
        </button>
        <Tag pastel={pastel}>{claim.verdict}</Tag>
      </div>

      <div style={{ marginTop: 6 }}>
        <span style={{ fontSize: 10.5, color: COLOR.muted, fontFamily: COLOR.mono }}>{method}</span>
      </div>

      {open && (
        <div style={{ marginTop: 8, borderTop: `1px solid ${COLOR.border}`, paddingTop: 8 }}>
          <p style={{ fontSize: 11.5, color: COLOR.muted, margin: 0, lineHeight: 1.6 }}>{claim.reasoning}</p>
          {claim.evidence.map((e) => (
            <a
              key={e.url}
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                fontSize: 11,
                color: COLOR.paleBlue.fg,
                marginTop: 6,
                textDecoration: "none",
              }}
            >
              {e.title || e.url}
            </a>
          ))}
          <div style={{ marginTop: 8 }}>
            <FeedbackButton signature={signature} />
          </div>
        </div>
      )}
    </div>
  );
}

function CodeRiskRow({ risk, dismissed }: { risk: CodeRisk; dismissed: boolean }) {
  const pastel = SEVERITY_PASTEL[risk.severity];
  const signature = signatureFor("code-risk", risk.type, risk.excerpt);

  if (dismissed) return null;

  return (
    <div
      style={{
        border: `1px solid ${COLOR.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
        background: COLOR.surface,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 12, color: COLOR.text, fontWeight: 500 }}>
          {risk.type.replace(/_/g, " ")}
        </span>
        <Tag pastel={pastel}>{risk.severity}</Tag>
      </div>
      <code
        style={{
          display: "block",
          marginTop: 6,
          fontSize: 11,
          fontFamily: COLOR.mono,
          color: COLOR.muted,
          background: COLOR.canvas,
          borderRadius: 6,
          padding: "6px 8px",
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {risk.excerpt}
      </code>
      <p style={{ fontSize: 11.5, color: COLOR.muted, margin: "8px 0 0", lineHeight: 1.6 }}>{risk.suggestion}</p>
      <div style={{ marginTop: 8 }}>
        <FeedbackButton signature={signature} />
      </div>
    </div>
  );
}

export function Panel() {
  const state = usePanelState();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Hydrate dismissed signatures from chrome.storage once on mount, in
  // addition to the in-memory set the store tracks for this session — a
  // finding dismissed in an earlier session should stay suppressed.
  useEffect(() => {
    const signatures = new Set<string>();
    (async () => {
      for (const claim of state.claims ?? []) {
        const sig = signatureFor("claim", claim.text);
        if (await isDismissed(sig)) signatures.add(sig);
      }
      for (const risk of state.codeRisks ?? []) {
        const sig = signatureFor("code-risk", risk.type, risk.excerpt);
        if (await isDismissed(sig)) signatures.add(sig);
      }
      if (signatures.size > 0) {
        setDismissed((prev) => new Set([...prev, ...signatures]));
      }
    })();
  }, [state.claims, state.codeRisks]);

  if (!state.visible) return null;

  const isDismissedSig = (sig: string) => dismissed.has(sig) || state.dismissed.has(sig);

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        width: 340,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        background: COLOR.canvas,
        border: `1px solid ${COLOR.border}`,
        borderRadius: 12,
        padding: 20,
        fontFamily: COLOR.sans,
        color: COLOR.text,
        zIndex: 2147483647,
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}>Last Line</span>
        {state.loading && <span style={{ fontSize: 11, color: COLOR.paleBlue.fg }}>analyzing…</span>}
      </div>

      {state.error && (
        <p style={{ fontSize: 11, color: COLOR.paleRed.fg, marginTop: 12 }}>{state.error}</p>
      )}

      {state.trust ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 16 }}>
          <span style={{ fontSize: 30, fontWeight: 600, fontFamily: COLOR.mono, letterSpacing: "-0.02em" }}>
            {Math.round(state.trust.score)}
          </span>
          <span style={{ fontSize: 12, color: COLOR.muted }}>/100</span>
          <Tag pastel={BAND_PASTEL[state.trust.band]}>{state.trust.band}</Tag>
        </div>
      ) : (
        <div
          style={{
            height: 40,
            marginTop: 16,
            borderRadius: 8,
            background: COLOR.surface,
            border: `1px solid ${COLOR.border}`,
          }}
        />
      )}

      {state.scan && state.scan.injection.isInjection && (
        <div
          style={{
            marginTop: 16,
            border: `1px solid ${COLOR.border}`,
            background: COLOR.paleRed.bg,
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 11.5,
            color: COLOR.paleRed.fg,
          }}
        >
          Prompt injection detected
          {state.scan.injection.technique ? ` — ${state.scan.injection.technique}` : ""}
        </div>
      )}

      {state.hallucination && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Hallucination risk</SectionLabel>
          <div
            style={{
              height: 5,
              borderRadius: 999,
              background: COLOR.surface,
              border: `1px solid ${COLOR.border}`,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(state.hallucination.risk * 100)}%`,
                background: COLOR.paleRed.fg,
              }}
            />
          </div>
        </div>
      )}

      {state.claims && state.claims.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Claims ({state.claims.length})</SectionLabel>
          {state.claims.map((c) => (
            <ClaimRow key={c.id} claim={c} dismissed={isDismissedSig(signatureFor("claim", c.text))} />
          ))}
        </div>
      )}

      {state.codeRisks && state.codeRisks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Code risks ({state.codeRisks.length})</SectionLabel>
          {state.codeRisks.map((r, i) => (
            <CodeRiskRow
              key={i}
              risk={r}
              dismissed={isDismissedSig(signatureFor("code-risk", r.type, r.excerpt))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
