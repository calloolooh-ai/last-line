"use client";

import { useState } from "react";
import { prescan } from "@/lib/firewall/prescan";
import { parseSSEStream } from "@/lib/sse";
import type { AnalysisEvent } from "@/lib/types";
import type { UIMessage } from "@/components/chat/types";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { ExplainabilityPanel } from "@/components/firewall/ExplainabilityPanel";

function uid() {
  return Math.random().toString(36).slice(2);
}

async function streamChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  onChunk: (chunk: string) => void,
) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.body) throw new Error("No response body from /api/chat");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}

async function streamAnalysis(
  input: { prompt: string; response: string; messageId: string },
  onEvent: (event: AnalysisEvent) => void,
) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.body) throw new Error("No response body from /api/analyze");

  for await (const event of parseSSEStream<AnalysisEvent>(res.body)) {
    onEvent(event);
  }
}

export default function Home() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);

  function updateMessage(id: string, patch: Partial<UIMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function handleSend(text: string) {
    const userScan = prescan(text);
    const userMessage: UIMessage = {
      id: uid(),
      role: "user",
      content: text,
      scanRisk: userScan.riskLevel,
    };
    const assistantId = uid();
    const assistantMessage: UIMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
      analysis: { loading: true },
    };

    const history = [...messages, userMessage];
    setMessages([...history, assistantMessage]);
    setActiveAnalysisId(assistantId);
    setBusy(true);

    try {
      let full = "";
      await streamChat(
        history.map((m) => ({ role: m.role, content: m.content })),
        (chunk) => {
          full += chunk;
          updateMessage(assistantId, { content: full });
        },
      );
      updateMessage(assistantId, { streaming: false });

      await streamAnalysis({ prompt: text, response: full, messageId: assistantId }, (event) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const prevAnalysis = m.analysis ?? { loading: true };
            switch (event.type) {
              case "scan":
                return { ...m, analysis: { ...prevAnalysis, scan: event.scan, loading: true } };
              case "claims":
                return m;
              case "claim_verified":
                return {
                  ...m,
                  analysis: {
                    ...prevAnalysis,
                    claims: [...(prevAnalysis.claims ?? []), event.claim],
                    loading: true,
                  },
                };
              case "hallucination":
                return {
                  ...m,
                  analysis: { ...prevAnalysis, hallucination: event.estimate, loading: true },
                };
              case "trust":
                return { ...m, analysis: { ...prevAnalysis, trust: event.trust, loading: true } };
              case "done":
                return {
                  ...m,
                  analysis: {
                    scan: event.analysis.scan,
                    claims: event.analysis.claims,
                    hallucination: event.analysis.hallucination,
                    trust: event.analysis.trust,
                    loading: false,
                  },
                };
              case "error":
                return { ...m, analysis: { ...prevAnalysis, loading: false, error: event.message } };
              default:
                return m;
            }
          }),
        );
        if (event.type === "scan") {
          updateMessage(userMessage.id, { scanRisk: event.scan.riskLevel });
        }
      });
    } finally {
      setBusy(false);
    }
  }

  const activeMessage = messages.find((m) => m.id === activeAnalysisId);

  return (
    <div className="flex flex-1 flex-col items-center bg-background">
      <header className="w-full max-w-5xl px-6 pt-8">
        <h1 className="text-lg font-semibold text-foreground">Last Line</h1>
        <p className="text-sm text-muted">
          The last line of defense between you and a confidently wrong model.
        </p>
      </header>

      <main className="flex w-full max-w-5xl flex-1 gap-4 px-6 py-4">
        <div className="flex flex-1 flex-col gap-3">
          <MessageList messages={messages} />
          <Composer onSend={handleSend} disabled={busy} />
        </div>

        {activeMessage?.analysis && <ExplainabilityPanel analysis={activeMessage.analysis} />}
      </main>
    </div>
  );
}
