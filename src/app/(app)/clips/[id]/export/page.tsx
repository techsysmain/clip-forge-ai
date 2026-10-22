"use client";

import { use } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Download, FileText, Loader2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge, isActiveStatus } from "@/components/status-badge";
import { api, usePolled } from "@/lib/client";
import { formatTimestamp } from "@/lib/timestamps";

interface Payload {
  clip: {
    id: string;
    projectId: string;
    title: string;
    startSeconds: number;
    endSeconds: number;
    durationSeconds: number;
    aspectRatio: string;
    status: string;
    outputWidth: number | null;
    outputHeight: number | null;
    errorMessage: string | null;
  };
  project: { title: string };
  job: { progress: number; status: string; retryCount: number } | null;
}

export default function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = usePolled<Payload>(`/api/clips/${id}`, (d) => isActiveStatus(d.clip.status));

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error ?? "Clip not found."}</div>;
  const { clip, job } = data;
  const busy = isActiveStatus(clip.status);

  async function retry() {
    try {
      await api(`/api/clips/${id}/render`, { method: "POST" });
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start rendering");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={`/projects/${clip.projectId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {data.project.title}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{clip.title}</h1>
        <StatusBadge status={clip.status} />
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border bg-black/40 p-4">
          {clip.status === "rendered" ? (
            <video src={`/api/clips/${id}/download?inline=1`} controls className="max-h-[70vh] rounded-xl" />
          ) : busy ? (
            <div className="w-full max-w-sm space-y-3 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">{clip.status === "queued" ? "Waiting for a render worker…" : "Rendering your clip…"}</p>
              <Progress value={job?.progress ?? 0} />
              {job && job.retryCount > 0 && <p className="text-xs text-muted-foreground">Retry attempt {job.retryCount}</p>}
            </div>
          ) : clip.status === "failed" ? (
            <div className="max-w-sm space-y-3 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
              <p className="text-sm text-red-200">{clip.errorMessage ?? "Rendering failed."}</p>
              <Button onClick={retry}>
                <RefreshCw className="mr-1 h-4 w-4" /> Retry render
              </Button>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">This clip hasn&apos;t been rendered yet.</p>
              <Button onClick={retry}>Render clip</Button>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <dl className="space-y-2 text-sm">
            <Row label="Duration" value={`${Math.round(clip.durationSeconds)}s`} />
            <Row label="Source range" value={`${formatTimestamp(clip.startSeconds)} – ${formatTimestamp(clip.endSeconds)}`} />
            <Row label="Aspect ratio" value={clip.aspectRatio} />
            <Row label="Resolution" value={clip.outputWidth ? `${clip.outputWidth}×${clip.outputHeight}` : "—"} />
          </dl>
          <div className="space-y-2">
            <Button className="w-full" disabled={clip.status !== "rendered"} asChild={clip.status === "rendered"}>
              {clip.status === "rendered" ? (
                <a href={`/api/clips/${id}/download?type=mp4`}>
                  <Download className="mr-1 h-4 w-4" /> Download MP4
                </a>
              ) : (
                <span>
                  <Download className="mr-1 h-4 w-4" /> Download MP4
                </span>
              )}
            </Button>
            <Button variant="outline" className="w-full" disabled={clip.status !== "rendered"} asChild={clip.status === "rendered"}>
              {clip.status === "rendered" ? (
                <a href={`/api/clips/${id}/download?type=srt`}>
                  <FileText className="mr-1 h-4 w-4" /> Download SRT
                </a>
              ) : (
                <span>
                  <FileText className="mr-1 h-4 w-4" /> Download SRT
                </span>
              )}
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link href={`/clips/${id}`}>
                <Pencil className="mr-1 h-4 w-4" /> Edit clip
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
