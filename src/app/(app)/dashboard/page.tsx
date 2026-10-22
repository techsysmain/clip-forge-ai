"use client";

import Image from "next/image";
import Link from "next/link";
import { Film, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, isActiveStatus } from "@/components/status-badge";
import { api, usePolled } from "@/lib/client";
import { formatTimestamp } from "@/lib/timestamps";

interface ProjectItem {
  id: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  status: string;
  clipCount: number;
  renderedCount: number;
  errorMessage: string | null;
  createdAt: string;
}

export default function Dashboard() {
  const { data, error, loading, reload } = usePolled<{ projects: ProjectItem[] }>("/api/projects", (d) =>
    d.projects.some((p) => isActiveStatus(p.status)),
  );
  const projects = data?.projects ?? [];
  const processing = projects.filter((p) => isActiveStatus(p.status));

  async function remove(id: string) {
    if (!confirm("Delete this project and all of its files? This cannot be undone.")) return;
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      toast.success("Project deleted");
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete the project");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {processing.length > 0 ? `${processing.length} processing now` : "Your recent projects and their status"}
          </p>
        </div>
        <Button asChild className="glow">
          <Link href="/projects/new">
            <Plus className="mr-1 h-4 w-4" /> New Project
          </Link>
        </Button>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : projects.length === 0 && !error ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
          <Image src="/assets/empty-projects.png" alt="" width={220} height={220} className="mb-4 rounded-2xl" />
          <h2 className="text-lg font-medium">No projects yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Paste a YouTube link or upload a video to find its best short-form moments.
          </p>
          <Button asChild className="mt-4">
            <Link href="/projects/new">Create your first project</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div key={p.id} className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/50">
              <Link href={`/projects/${p.id}`} className="block">
                <div className="relative aspect-video bg-secondary">
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Film className="h-8 w-8" />
                    </div>
                  )}
                  {p.durationSeconds && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs">
                      {formatTimestamp(p.durationSeconds)}
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <h3 className="line-clamp-2 font-medium leading-snug">{p.title}</h3>
                  <div className="flex items-center justify-between">
                    <StatusBadge status={p.status} />
                    <span className="text-xs text-muted-foreground">
                      {p.clipCount} clips · {p.renderedCount} rendered
                    </span>
                  </div>
                  {isActiveStatus(p.status) && <Progress value={undefined} className="h-1" />}
                  {p.status === "failed" && p.errorMessage && <p className="line-clamp-2 text-xs text-red-300">{p.errorMessage}</p>}
                </div>
              </Link>
              <div className="flex justify-end border-t border-border px-2 py-1">
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-red-400" onClick={() => remove(p.id)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
