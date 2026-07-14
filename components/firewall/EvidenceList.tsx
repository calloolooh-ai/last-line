import type { Evidence } from "@/lib/types";
import { cn } from "@/lib/utils";

const STANCE_COLOR: Record<Evidence["stance"], string> = {
  supports: "text-verified",
  contradicts: "text-risk",
  neutral: "text-muted",
};

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) {
    return <p className="text-xs text-muted">No sources found.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {evidence.map((e) => (
        <li key={e.url} className="rounded-md border border-border bg-surface-2 p-2 text-xs">
          <a
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:underline"
          >
            {e.title || e.url}
          </a>
          <p className="mt-1 text-muted line-clamp-2">{e.snippet}</p>
          <span className={cn("mt-1 inline-block font-medium", STANCE_COLOR[e.stance])}>
            {e.stance}
          </span>
        </li>
      ))}
    </ul>
  );
}
