import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { exec, query } from "@/lib/db";
import {
  getOwnedProject,
  latestJobs,
  publicClip,
  publicJob,
  publicProject,
  type ClipRow,
} from "@/lib/repo";
import { removeProjectFiles } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await getOwnedProject(user.id, (await params).id);
  const clips = await query<ClipRow>(
    "SELECT * FROM clips WHERE project_id = ? ORDER BY engagement_score DESC, start_seconds",
    [project.id],
  );
  const jobs = await latestJobs(project.id);
  return NextResponse.json({
    project: publicProject(project),
    clips: clips.map(publicClip),
    jobs: jobs.map(publicJob),
  });
});

/** Deletes the project, its database rows, and every stored file (data-deletion control). */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await getOwnedProject(user.id, (await params).id);
  await exec("DELETE FROM projects WHERE id = ? AND user_id = ?", [project.id, user.id]);
  await removeProjectFiles(project.id);
  return NextResponse.json({ ok: true });
});
