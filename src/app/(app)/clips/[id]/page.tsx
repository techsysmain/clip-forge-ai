"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { CaptionOverlay } from "@/components/caption-overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { api, usePolled } from "@/lib/client";
import { CAPTION_PRESETS, type Caption, type CaptionStyle } from "@/lib/subtitles";
import { formatTimestamp } from "@/lib/timestamps";

interface Payload {
  clip: {
    id: string;
    projectId: string;
    title: string;
    startSeconds: number;
    endSeconds: number;
    aspectRatio: "9:16" | "16:9" | "1:1";
    cropMode: "center" | "blur" | "face";
    captionStyle: CaptionStyle;
    status: string;
  };
  project: { durationSeconds: number | null; title: string; hasSource: boolean };
  captions: Caption[];
}

const RATIO_CSS = { "9:16": "9 / 16", "16:9": "16 / 9", "1:1": "1 / 1" } as const;

export default function ClipEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data, error, loading, reload } = usePolled<Payload>(`/api/clips/${id}`, () => false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [aspect, setAspect] = useState<Payload["clip"]["aspectRatio"]>("9:16");
  const [crop, setCrop] = useState<"center" | "blur" | "face">("center");
  const [style, setStyle] = useState<CaptionStyle | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "render" | null>(null);
  const [time, setTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clipId = data?.clip.id;

  useEffect(() => {
    if (!data) return;
    setStart(data.clip.startSeconds);
    setEnd(data.clip.endSeconds);
    setAspect(data.clip.aspectRatio);
    setCrop(data.clip.cropMode);
    setStyle(data.clip.captionStyle);
    setDirty(false);
    // reset only when the server copy changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, data?.clip.startSeconds, data?.clip.endSeconds, data?.clip.aspectRatio, data?.clip.cropMode, data?.clip.status]);

  if (loading) return <div className="text-muted-foreground">Loading…</div>;
  if (error || !data || !style) return <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error ?? "Clip not found."}</div>;

  const duration = data.project.durationSeconds ?? Math.max(end + 30, 60);
  const savedStart = data.clip.startSeconds;
  const relTime = time - savedStart;
  const caption = data.captions.find((c) => relTime >= c.start && relTime < c.end);
  const locked = data.clip.status === "queued" || data.clip.status === "rendering";

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };
  const patchStyle = (p: Partial<CaptionStyle>) => {
    setStyle({ ...style, ...p });
    setDirty(true);
  };

  function seek(t: number) {
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  function setRange([s, e]: number[]) {
    let ns = s;
    let ne = e;
    if (ne - ns > 60) {
      if (ns !== start) ne = ns + 60;
      else ns = ne - 60;
    }
    if (ne - ns < 5) {
      if (ns !== start) ns = ne - 5;
      else ne = ns + 5;
    }
    ns = Math.max(0, ns);
    setStart(Math.round(ns * 10) / 10);
    setEnd(Math.round(ne * 10) / 10);
    setDirty(true);
    if (ns !== start) seek(ns);
  }

  async function save(): Promise<boolean> {
    setBusy("save");
    try {
      await api(`/api/clips/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ startSeconds: start, endSeconds: end, aspectRatio: aspect, cropMode: crop, captionStyle: style }),
      });
      await reload();
      setDirty(false);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save changes");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function renderAndDownload() {
    if (dirty && !(await save())) return;
    setBusy("render");
    try {
      await api(`/api/clips/${id}/render`, { method: "POST" });
      router.push(`/clips/${id}/export`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start rendering");
      setBusy(null);
    }
  }

  const vertical = aspect === "9:16";

  return (
    <div className="space-y-6">
      <Link href={`/projects/${data.clip.projectId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {data.project.title}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Clip editor</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={save} disabled={!dirty || busy !== null || locked}>
            {busy === "save" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save Changes
          </Button>
          <Button variant="secondary" onClick={renderAndDownload} disabled={busy !== null || locked || !data.project.hasSource}>
            <RefreshCw className="mr-1 h-4 w-4" /> Regenerate Clip
          </Button>
          <Button onClick={renderAndDownload} disabled={busy !== null || locked || !data.project.hasSource} className="glow">
            {busy === "render" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} Render and Download
          </Button>
        </div>
      </div>
      {locked && <p className="text-sm text-amber-300">This clip is rendering. Editing is disabled until it finishes.</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="flex justify-center rounded-2xl border border-border bg-black/40 p-4">
            <div
              className="relative max-h-[70vh] overflow-hidden rounded-xl bg-black"
              style={{ aspectRatio: RATIO_CSS[aspect], height: vertical ? "70vh" : undefined, width: vertical ? undefined : "100%", maxWidth: "100%", containerType: "size" }}
            >
              {data.project.hasSource ? (
                <video
                  ref={videoRef}
                  src={`/api/projects/${data.clip.projectId}/video`}
                  controls={false}
                  playsInline
                  className={`h-full w-full ${crop === "center" ? "object-cover" : "object-contain"}`}
                  onLoadedMetadata={(e) => (e.currentTarget.currentTime = start)}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    setTime(v.currentTime);
                    if (v.currentTime >= end) v.currentTime = start;
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  No source video available for preview.
                </div>
              )}
              <CaptionOverlay caption={caption} time={relTime} style={style} vertical={vertical} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()}>
              Play / Pause
            </Button>
            <span className="font-mono text-sm text-muted-foreground">
              {formatTimestamp(time)} · clip {Math.max(0, Math.round((time - start) * 10) / 10)}s
            </span>
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <Label>Timeline</Label>
            <Slider min={0} max={Math.max(duration, end)} step={0.1} value={[start, end]} onValueChange={setRange} disabled={locked} />
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Start (s)</Label>
                <Input type="number" step="0.1" min={0} value={start} disabled={locked} onChange={(e) => setRange([Number(e.target.value), end])} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">End (s)</Label>
                <Input type="number" step="0.1" min={0} value={end} disabled={locked} onChange={(e) => setRange([start, Number(e.target.value)])} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Duration</Label>
                <div className={`flex h-9 items-center rounded-md border border-input px-3 text-sm ${end - start > 60 ? "text-red-400" : ""}`}>
                  {(end - start).toFixed(1)}s / 60s
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-medium">Output</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Aspect ratio</Label>
              <Select value={aspect} onValueChange={edit((v: string) => setAspect(v as Payload["clip"]["aspectRatio"]))} disabled={locked}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Crop</Label>
              <Select value={crop} onValueChange={edit((v: string) => setCrop(v as "center" | "blur" | "face"))} disabled={locked}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="center">Center crop</SelectItem>
                  <SelectItem value="blur">Blur fill</SelectItem>
                  <SelectItem value="face">Face-aware crop</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <h2 className="pt-2 font-medium">Caption theme</h2>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(CAPTION_PRESETS).map((p) => (
              <button
                key={p.preset}
                type="button"
                disabled={locked}
                onClick={() => {
                  const { label: _l, description: _d, ...s } = p;
                  void _l; void _d;
                  setStyle(s);
                  setDirty(true);
                }}
                className={`rounded-lg border p-2 text-left text-sm transition ${style.preset === p.preset ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
              >
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground">{p.description}</div>
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Font size ({style.fontSize}px)</Label>
            <Slider min={24} max={140} step={2} value={[style.fontSize]} onValueChange={([v]) => patchStyle({ fontSize: v })} disabled={locked} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Outline ({style.outline}px)</Label>
            <Slider min={0} max={14} step={1} value={[style.outline]} onValueChange={([v]) => patchStyle({ outline: v })} disabled={locked || style.background} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Text color</Label>
              <Input type="color" className="h-9 p-1" value={style.textColor} onChange={(e) => patchStyle({ textColor: e.target.value.toUpperCase() })} disabled={locked} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Highlight color</Label>
              <Input type="color" className="h-9 p-1" value={style.highlightColor} onChange={(e) => patchStyle({ highlightColor: e.target.value.toUpperCase() })} disabled={locked} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Position</Label>
            <Select value={style.position} onValueChange={(v) => patchStyle({ position: v as CaptionStyle["position"] })} disabled={locked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom">Bottom (safe area)</SelectItem>
                <SelectItem value="middle">Middle</SelectItem>
                <SelectItem value="top">Top</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ToggleRow label="Background box" checked={style.background} onChange={(v) => patchStyle({ background: v })} disabled={locked} />
          <ToggleRow label="Highlight spoken word" checked={style.highlightWord} onChange={(v) => patchStyle({ highlightWord: v })} disabled={locked} />
          <ToggleRow label="Bold" checked={style.bold} onChange={(v) => patchStyle({ bold: v })} disabled={locked} />
          <ToggleRow label="UPPERCASE" checked={style.uppercase} onChange={(v) => patchStyle({ uppercase: v })} disabled={locked} />
          <p className="text-xs text-muted-foreground">Preview is approximate. Caption text updates after saving; the render uses FFmpeg.</p>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-sm font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
