import { cn } from "@/lib/utils";
import type { UIMessage } from "@/components/chat/types";
import { RiskBadge } from "@/components/firewall/RiskBadge";

export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex animate-rise flex-col gap-1", isUser ? "items-end" : "items-start")}>
      {isUser && message.scanRisk && message.scanRisk !== "none" && (
        <RiskBadge severity={message.scanRisk} />
      )}
      <div
        className={cn(
          "max-w-2xl whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-accent text-white"
            : "border border-border bg-surface text-foreground",
        )}
      >
        {message.content}
        {message.streaming && (
          <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
        )}
      </div>
    </div>
  );
}
