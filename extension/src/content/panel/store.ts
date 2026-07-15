import { useSyncExternalStore } from "react";
import type { Analysis, AnalysisEvent } from "@/lib/types";
import type { CodeRisk } from "../codeRisks";

export interface PanelState {
  visible: boolean;
  loading: boolean;
  error?: string;
  scan?: Analysis["scan"];
  claims?: Analysis["claims"];
  hallucination?: Analysis["hallucination"];
  trust?: Analysis["trust"];
  codeRisks?: CodeRisk[];
  /** Signatures the user has already marked "not accurate" this session, so re-renders can grey them out. */
  dismissed: Set<string>;
}

let state: PanelState = { visible: false, loading: false, dismissed: new Set() };
const listeners = new Set<() => void>();

function set(patch: Partial<PanelState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function startAnalysis() {
  set({
    visible: true,
    loading: true,
    error: undefined,
    scan: undefined,
    claims: undefined,
    hallucination: undefined,
    trust: undefined,
    codeRisks: undefined,
  });
}

export function setCodeRisks(risks: CodeRisk[]) {
  set({ codeRisks: risks });
}

export function markDismissedLocally(signature: string) {
  set({ dismissed: new Set(state.dismissed).add(signature) });
}

export function applyEvent(event: AnalysisEvent) {
  switch (event.type) {
    case "scan":
      set({ scan: event.scan });
      return;
    case "claims":
      return;
    case "claim_verified":
      set({ claims: [...(state.claims ?? []), event.claim] });
      return;
    case "hallucination":
      set({ hallucination: event.estimate });
      return;
    case "trust":
      set({ trust: event.trust });
      return;
    case "done":
      set({
        scan: event.analysis.scan,
        claims: event.analysis.claims,
        hallucination: event.analysis.hallucination,
        trust: event.analysis.trust,
        loading: false,
      });
      return;
    case "error":
      set({ loading: false, error: event.message });
      return;
  }
}

export function usePanelState(): PanelState {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => state,
  );
}
