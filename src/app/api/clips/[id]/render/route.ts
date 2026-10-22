import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOwnedClip, publicJob } from "@/lib/repo";
import { requestRender } from "@/lib/render-request";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { clip, project } = await getOwnedClip(user.id, (await params).id);
  const { job, created } = await requestRender(clip, project);
  return NextResponse.json({ job: publicJob(job), duplicate: !created }, { status: created ? 202 : 200 });
});
