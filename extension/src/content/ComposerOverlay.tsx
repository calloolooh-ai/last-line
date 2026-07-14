import { useEffect, useMemo, useState } from "react";
import { prescan } from "@/lib/firewall/prescan";
import { redact } from "@/lib/firewall/scanner/redact";

const SEVERITY_COLOR: Record<string, string> = {
  none: "#10b981",
  low: "#10b981",
  medium: "#eab308",
  high: "#ef4444",
  critical: "#ef4444",
};

/**
 * Reads/writes the contenteditable composer directly. ChatGPT's composer is
 * a contenteditable div, not a <textarea>, so getting/setting its value goes
 * through textContent rather than .value.
 */
function readComposerText(el: HTMLElement): string {
  return el.textContent ?? "";
}

function writeComposerText(el: HTMLElement, text: string): void {
  el.textContent = text;
  // ChatGPT's React tree needs an `input` event to notice the DOM changed
  // out from under it — plain textContent assignment alone doesn't trigger
  // its own state update.
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

export function ComposerOverlay({ composer }: { composer: HTMLElement }) {
  const [text, setText] = useState(() => readComposerText(composer));

  useEffect(() => {
    const onInput = () => setText(readComposerText(composer));
    composer.addEventListener("input", onInput);
    onInput();
    return () => composer.removeEventListener("input", onInput);
  }, [composer]);

  const scan = useMemo(() => prescan(text), [text]);

  if (!text.trim() || (scan.findings.length === 0 && !scan.hasInjectionSignal)) return null;

  const color =
    scan.findings.length > 0 ? SEVERITY_COLOR[scan.riskLevel] : SEVERITY_COLOR.high;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: 0,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 10px",
        borderRadius: "999px",
        background: "#0c1017",
        border: `1px solid ${color}55`,
        color,
        fontSize: "12px",
        fontFamily: "system-ui, sans-serif",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        zIndex: 2147483647,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
      <span>
        {scan.findings.length > 0
          ? `${scan.findings.length} secret${scan.findings.length === 1 ? "" : "s"} detected`
          : "possible prompt injection"}
      </span>
      {scan.findings.length > 0 && (
        <button
          type="button"
          onClick={() => writeComposerText(composer, redact(text, scan.findings))}
          style={{
            border: `1px solid ${SEVERITY_COLOR[scan.riskLevel]}55`,
            background: "transparent",
            color: "inherit",
            borderRadius: "999px",
            padding: "2px 8px",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          Redact
        </button>
      )}
    </div>
  );
}
