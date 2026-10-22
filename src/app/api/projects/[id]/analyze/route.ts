import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { exec } from "@/lib/db";
import { enqueueJob } from "@/lib/queue";
import { getOwnedProject, publicJob } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await getOwnedProject(user.id, (await params).id);
  if (!project.source_storage_key && !project.direct_url) {
    throw new ApiError(
      409,
      "A permitted video source is required. Upload the video or provide a direct file URL to analyze it.",
      "SOURCE_REQUIRED",
    );
  }
  const { job, created } = await enqueueJob("analyze", project.id);
  if (created) {
    await exec("UPDATE projects SET status = 'queued', error_message = NULL WHERE id = ?", [project.id]);
  }
  return NextResponse.json({ job: publicJob(job), duplicate: !created }, { status: created ? 202 : 200 });
});
