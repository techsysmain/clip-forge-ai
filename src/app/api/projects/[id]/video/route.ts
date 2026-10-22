import { ApiError, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOwnedProject } from "@/lib/repo";
import { streamFile } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4v: "video/x-m4v",
  mpg: "video/mpeg",
};

/** Authorized, range-enabled playback of the project's source video (for the editor preview). */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await getOwnedProject(user.id, (await params).id);
  if (!project.source_storage_key) throw new ApiError(404, "No source video for this project.");
  const ext = project.source_storage_key.split(".").pop() ?? "mp4";
  return streamFile(project.source_storage_key, req, TYPES[ext] ?? "video/mp4");
});
