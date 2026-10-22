import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getOwnedProject, publicJob, type ClipRow } from "@/lib/repo";
import { requestRender } from "@/lib/render-request";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ clipIds: z.array(z.string().uuid()).min(1, "Select at least one clip.").max(20) });

/** Batch render: queues one job per selected clip belonging to this project. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await getOwnedProject(user.id, (await params).id);
  const { clipIds } = schema.parse(await req.json().catch(() => ({})));
  const clips = await query<ClipRow>("SELECT * FROM clips WHERE project_id = $1 AND id = ANY($2::uuid[])", [
    project.id,
    clipIds,
  ]);
  const jobs = [];
  for (const clip of clips) jobs.push(publicJob((await requestRender(clip, project)).job));
  return NextResponse.json({ jobs }, { status: 202 });
});
