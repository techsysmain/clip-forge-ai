"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileVideo, Link2, Loader2, Search, Sparkles, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, uploadFile } from "@/lib/client";
import { CAPTION_PRESETS } from "@/lib/subtitles";
import { formatTimestamp } from "@/lib/timestamps";
import { parseYouTubeUrl } from "@/lib/youtube";

interface Meta {
  videoId: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

export default function NewProject() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ytUrl, setYtUrl] = useState("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [directUrl, setDirectUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [aspect, setAspect] = useState("9:16");
  const [maxClip, setMaxClip] = useState("60");
  const [preset, setPreset] = useState("auto");
  const [cropMode, setCropMode] = useState("center");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function fetchMeta() {
    setMeta(null);
    setMetaError(null);
    if (!parseYouTubeUrl(ytUrl)) return setMetaError("That doesn't look like a valid YouTube video URL.");
    setFetching(true);
    try {
      setMeta((await api<{ metadata: Meta }>(`/api/metadata?url=${encodeURIComponent(ytUrl)}`)).metadata);
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : "Could not load video details.");
    } finally {
      setFetching(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ytUrl.trim() && !directUrl.trim() && !file) return setError("Add a YouTube URL, a direct video URL, or upload a file.");
    if (ytUrl.trim() && !parseYouTubeUrl(ytUrl)) return setError("That doesn't look like a valid YouTube video URL.");
    if (!rights) return setError("Please confirm you have the rights to process this video.");
    try {
      setBusy("Creating project…");
      const { project } = await api<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          youtubeUrl: ytUrl.trim() || undefined,
          directUrl: directUrl.trim() || undefined,
          title: file?.name.replace(/\.[^.]+$/, ""),
          rightsConfirmed: rights,
          settings: { aspectRatio: aspect, maxClipSeconds: Number(maxClip), captionPreset: preset, cropMode },
        }),
      });
      if (file) {
        setBusy("Uploading video…");
        try {
          await uploadFile(`/api/projects/${project.id}/source`, file, setUploadPct);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Upload failed");
          router.push(`/projects/${project.id}`);
          return;
        }
      }
      if (file || directUrl.trim()) {
        setBusy("Starting analysis…");
        await api(`/api/projects/${project.id}/analyze`, { method: "POST" });
      }
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="text-sm text-muted-foreground">Provide a video source, choose your output options, and let AI find the best moments.</p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <Label htmlFor="yt">YouTube URL</Label>
        <div className="flex gap-2">
          <Input id="yt" placeholder="https://www.youtube.com/watch?v=…" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} />
          <Button type="button" variant="secondary" onClick={fetchMeta} disabled={fetching || !ytUrl.trim()}>
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1 hidden sm:inline">Look up</span>
          </Button>
        </div>
        {metaError && (
          <p className="flex items-center gap-1 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" /> {metaError}
          </p>
        )}
        {meta && (
          <div className="flex gap-3 rounded-xl border border-border bg-background/50 p-3">
            {meta.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={meta.thumbnailUrl} alt="" className="h-20 w-36 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium">{meta.title}</p>
              <p className="text-sm text-muted-foreground">
                {meta.channel}
                {meta.durationSeconds ? ` · ${formatTimestamp(meta.durationSeconds)}` : ""}
              </p>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          YouTube links provide details only. ClipForge never downloads from YouTube, so also add a video you own below.
        </p>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <Label>Video source</Label>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center transition hover:bg-primary/10"
        >
          {file ? (
            <>
              <FileVideo className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1048576).toFixed(1)} MB</p>
              <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                <X className="mr-1 h-3 w-3" /> Remove
              </Button>
            </>
          ) : (
            <>
              <UploadCloud className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium">Drop a video or click to upload</p>
              <p className="text-xs text-muted-foreground">MP4, MOV, WebM, MKV · processed on the server</p>
            </>
          )}
          <input ref={fileRef} type="file" accept="video/*,.mkv" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="direct" className="flex items-center gap-1 text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" /> Or an authorized direct file URL
          </Label>
          <Input id="direct" placeholder="https://cdn.example.com/video.mp4" value={directUrl} onChange={(e) => setDirectUrl(e.target.value)} />
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        <Field label="Output aspect ratio">
          <Select value={aspect} onValueChange={setAspect}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">AI suggested</SelectItem>
              <SelectItem value="9:16">9:16 Vertical (Shorts, TikTok, Reels)</SelectItem>
              <SelectItem value="16:9">16:9 Landscape</SelectItem>
              <SelectItem value="1:1">1:1 Square</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Maximum clip duration">
          <Select value={maxClip} onValueChange={setMaxClip}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[15, 30, 45, 60].map((s) => (
                <SelectItem key={s} value={String(s)}>{s} seconds</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Caption style">
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">AI suggested</SelectItem>
              {Object.values(CAPTION_PRESETS).map((p) => (
                <SelectItem key={p.preset} value={p.preset}>{p.label} — {p.description}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Cropping for other aspect ratios">
          <Select value={cropMode} onValueChange={setCropMode}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="center">Center crop</SelectItem>
              <SelectItem value="blur">Blurred background fill</SelectItem>
              <SelectItem value="face">Face-aware crop (follows the speaker)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
        <Checkbox id="rights" checked={rights} onCheckedChange={(v) => setRights(v === true)} className="mt-0.5" />
        <Label htmlFor="rights" className="text-sm font-normal leading-relaxed text-muted-foreground">
          I confirm that I own this video or have permission from the rights holder to process and transform it, and that doing so complies with the
          applicable platform terms.
        </Label>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {busy && file && uploadPct > 0 && uploadPct < 1 && <Progress value={uploadPct * 100} />}

      <Button type="submit" size="lg" className="glow w-full" disabled={!!busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
        {busy ?? "Analyze Video"}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
