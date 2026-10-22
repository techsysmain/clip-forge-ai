import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOwnedJob, publicJob } from "@/lib/repo";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  return NextResponse.json({ job: publicJob(await getOwnedJob(user.id, (await params).id)) });
});
