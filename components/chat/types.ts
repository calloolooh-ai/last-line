import type { Severity } from "@/lib/types";
import type { PartialAnalysis } from "@/components/firewall/ExplainabilityPanel";

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  /** Risk level of the prompt that produced this message; set client-side instantly, then confirmed by the server scan. */
  scanRisk?: Severity;
  analysis?: PartialAnalysis;
}
