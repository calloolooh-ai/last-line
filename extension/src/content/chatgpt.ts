import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { watchForComposer } from "./findComposer";
import { ComposerOverlay } from "./ComposerOverlay";
import { watchForFinishedTurns } from "./watchResponses";
import { requestAnalysis } from "./requestAnalysis";
import { Panel } from "./panel/Panel";
import { startAnalysis, applyEvent, setCodeRisks } from "./panel/store";
import { detectCodeRisks } from "./codeRisks";
import { highlightClaims } from "./highlightResponse";
import type { AnalysisEvent, VerifiedClaim } from "@/lib/types";

let composerRoot: Root | null = null;
let composerHostEl: HTMLElement | null = null;

function mountComposerOverlay(composer: HTMLElement) {
  composerRoot?.unmount();
  composerHostEl?.remove();

  const wrapper = composer.closest<HTMLElement>("form") ?? composer.parentElement;
  if (!wrapper) return;
  if (getComputedStyle(wrapper).position === "static") {
    wrapper.style.position = "relative";
  }

  composerHostEl = document.createElement("div");
  composerHostEl.id = "last-line-composer-overlay-host";
  wrapper.appendChild(composerHostEl);

  const shadow = composerHostEl.attachShadow({ mode: "open" });
  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  composerRoot = createRoot(mountPoint);
  composerRoot.render(createElement(ComposerOverlay, { composer }));
}

function mountPanel() {
  const hostEl = document.createElement("div");
  hostEl.id = "last-line-panel-host";
  document.body.appendChild(hostEl);
  const shadow = hostEl.attachShadow({ mode: "open" });
  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);
  createRoot(mountPoint).render(createElement(Panel));
}

watchForComposer(mountComposerOverlay);
mountPanel();

watchForFinishedTurns((turn) => {
  startAnalysis();
  setCodeRisks(detectCodeRisks(turn.response));

  // highlightClaims() clears and redraws every mark each call, so accumulate
  // the full set seen so far rather than re-highlighting only the newest
  // claim (which would wipe out every earlier one).
  const seenClaims: VerifiedClaim[] = [];

  const onEvent = (event: AnalysisEvent) => {
    applyEvent(event);
    if (event.type === "claim_verified") {
      seenClaims.push(event.claim);
      highlightClaims(turn.element, seenClaims);
    } else if (event.type === "done") {
      highlightClaims(turn.element, event.analysis.claims);
    }
  };

  requestAnalysis(turn, onEvent);
});
