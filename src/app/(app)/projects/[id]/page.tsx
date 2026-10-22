"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Download, Loader2, Pencil, Play, RefreshCw, Sparkles, UploadCloud, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { StatusBadge, isActiveStatus } from "@/components/status-badge";
import { api, uploadFile, usePolled } from "@/lib/client";
import { formatTimestamp } from "@/lib/timestamps";

interface Project {
  id: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  status: string;
  hasSource: boolean;
  directUrl: string | null;
  videoSummary: string | null;
  errorMessage: string | null;
  sourceType: string;
}
interface Clip {
  id: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  hook: string | null;
  summary: string | null;
  reason: string | null;
  transcript: string | null;
  engagementScore: number;
  aspectRatio: string;
  status: string;
  errorMessage: string | null;
}
interface Job {
  id: string;
  clipId: string | null;
  jobType: string;
  status: string;
  progress: number;
  errorMessage: string | null;
}
interface Payload {
  project: Project;
  clips: Clip[];
  jobs: Job[];
}

const STAGE_TEXT: Record<string, string> = {
  queued: "Waiting for a worker…",
  fetching_source: "Fetching the video source…",
  transcribing: "Transcribing speech…",
  analyzing: "Finding the best moments…",
};

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, reload } = usePolled<Payload>(`/api/projects/${id}`, (d) =>
    isActiveStatus(d.project.status) || d.clips.some((c) => isActiveStatus(c.status) || c.status === "rendering"),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Clip | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error ?? "Project not found."}</div>;

  const { project, clips, jobs } = data;
  const analyzeJob = jobs.find((j) => j.jobType === "analyze");
  const active = isActiveStatus(project.status);

  async function analyze() {
    try {
      await api(`/api/projects/${id}/analyze`, { method: "POST" });
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start analysis");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(0);
    try {
      await uploadFile(`/api/projects/${id}/source`, file, setUploading);
      await api(`/api/projects/${id}/analyze`, { method: "POST" });
      toast.success("Upload complete. Analysis started.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
      void reload();
    }
  }

  async function render(clipIds: string[]) {
    try {
      await api(`/api/projects/${id}/render`, { method: "POST", body: JSON.stringify({ clipIds }) });
      toast.success(clipIds.length > 1 ? `Rendering ${clipIds.length} clips` : "Rendering started");
      setSelected(new Set());
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start rendering");
    }
  }

  const toggle = (cid: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(cid)) n.delete(cid);
      else n.add(cid);
      return n;
    });
  const renderable = clips.filter((c) => !isActiveStatus(c.status) && c.status !== "rendering");

  return (
    <div className="space-y-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row">
        {project.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.thumbnailUrl} alt="" className="aspect-video w-full rounded-xl object-cover sm:w-56" />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{project.title}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {[project.channel, project.durationSeconds ? formatTimestamp(project.durationSeconds) : null].filter(Boolean).join(" · ")}
          </p>
          {project.videoSummary && <p className="text-sm text-muted-foreground">{project.videoSummary}</p>}
        </div>
      </div>

      {active && (
        <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> {STAGE_TEXT[project.status] ?? "Processing…"}
          </div>
          <Progress value={analyzeJob?.progress ?? 0} className="h-2" />
          <p className="text-xs text-muted-foreground">This page updates automatically. You can safely leave and come back.</p>
        </div>
      )}

      {project.status === "failed" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{project.errorMessage ?? "Analysis failed."}</span>
          </div>
          <Button variant="secondary" onClick={analyze}>
            <RefreshCw className="mr-1 h-4 w-4" /> Retry
          </Button>
        </div>
      )}

      {!project.hasSource && !project.directUrl && !active && (
        <div className="space-y-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center">
          <UploadCloud className="mx-auto h-8 w-8 text-primary" />
          <h2 className="font-medium">A permitted video source is needed</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            ClipForge doesn&apos;t download videos from YouTube. Upload the video file you own to transcribe it and find the best clips.
          </p>
          <Button onClick={() => fileRef.current?.click()} disabled={uploading !== null}>
            {uploading !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            {uploading !== null ? `Uploading ${Math.round(uploading * 100)}%` : "Upload video"}
          </Button>
          <input ref={fileRef} type="file" accept="video/*,.mkv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      )}

      {(project.hasSource || project.directUrl) && project.status === "awaiting_source" && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Source ready. Start the AI analysis.</p>
          <Button onClick={analyze}>
            <Sparkles className="mr-1 h-4 w-4" /> Analyze Video
          </Button>
        </div>
      )}

      {clips.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Suggested clips ({clips.length})</h2>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(renderable.map((c) => c.id)))}>
                Select all
              </Button>
              <Button disabled={selected.size === 0} onClick={() => render([...selected])}>
                <Wand2 className="mr-1 h-4 w-4" /> Generate {selected.size > 0 ? `${selected.size} selected` : "selected"}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {clips.map((c) => {
              const busy = isActiveStatus(c.status) || c.status === "rendering";
              const job = jobs.find((j) => j.clipId === c.id);
              return (
                <div key={c.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
                  <div className="flex gap-3">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} disabled={busy} className="mt-1" />
                    <div className="relative hidden h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary sm:block">
                      {project.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium leading-snug">{c.title}</h3>
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-sm font-semibold text-primary">
                          {c.engagementScore}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatTimestamp(c.startSeconds)} – {formatTimestamp(c.endSeconds)} · {Math.round(c.durationSeconds)}s · {c.aspectRatio}
                      </p>
                      {c.hook && <p className="mt-2 text-sm italic text-foreground/90">“{c.hook}”</p>}
                    </div>
                  </div>
                  {c.reason && <p className="text-sm text-muted-foreground">{c.reason}</p>}
                  {busy && <Progress value={job?.progress ?? 0} className="h-1.5" />}
                  {c.status === "failed" && c.errorMessage && <p className="text-xs text-red-300">{c.errorMessage}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={c.status} />
                    <div className="ml-auto flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPreview(c)}>
                        <Play className="mr-1 h-3.5 w-3.5" /> Preview
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/clips/${c.id}`}>
                          <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                        </Link>
                      </Button>
                      {c.status === "rendered" ? (
                        <Button size="sm" asChild>
                          <Link href={`/clips/${c.id}/export`}>
                            <Download className="mr-1 h-3.5 w-3.5" /> Export
                          </Link>
                        </Button>
                      ) : (
                        <Button size="sm" disabled={busy} onClick={() => render([c.id])}>
                          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
                          {c.status === "failed" ? "Retry" : "Generate Clip"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
          </DialogHeader>
          {preview && <SegmentPlayer src={`/api/projects/${id}/video`} start={preview.startSeconds} end={preview.endSeconds} />}
          {preview?.transcript && <p className="max-h-32 overflow-auto text-sm text-muted-foreground">{preview.transcript}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SegmentPlayer({ src, start, end }: { src: string; start: number; end: number }) {
  return (
    <video
      src={src}
      controls
      autoPlay
      className="aspect-video w-full rounded-lg bg-black"
      onLoadedMetadata={(e) => (e.currentTarget.currentTime = start)}
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (v.currentTime >= end) {
          v.pause();
          v.currentTime = start;
        }
      }}
    />
  );
}
