import { AlertCircle, CheckCircle2, Clock, Loader2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<string, string> = {
  awaiting_source: "Needs source",
  queued: "Queued",
  fetching_source: "Fetching source",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  rendering: "Rendering",
  ready: "Ready",
  suggested: "Suggested",
  rendered: "Rendered",
  completed: "Completed",
  failed: "Failed",
};

const ACTIVE = ["fetching_source", "transcribing", "analyzing", "rendering"];

export const isActiveStatus = (s: string) => s === "queued" || ACTIVE.includes(s);

export function StatusBadge({ status }: { status: string }) {
  const failed = status === "failed";
  const done = ["ready", "rendered", "completed"].includes(status);
  const Icon = failed ? AlertCircle : done ? CheckCircle2 : ACTIVE.includes(status) ? Loader2 : status === "awaiting_source" ? Upload : Clock;
  return (
    <Badge
      variant="outline"
      className={
        failed
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : done
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : isActiveStatus(status)
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground"
      }
    >
      <Icon className={`mr-1 h-3 w-3 ${ACTIVE.includes(status) ? "animate-spin" : ""}`} />
      {LABELS[status] ?? status}
    </Badge>
  );
}
