import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const CLIP_ID = "22222222-2222-4222-8222-222222222222";
const OWNER = "owner-user";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  // Simulates SQL scoping: rows are only returned when the user_id parameter matches the owner.
  queryOne: vi.fn(async (sql: string, params: unknown[]) => {
    const userId = params[params.length - 1];
    if (userId !== OWNER) return null;
    if (sql.includes("FROM clips")) return { id: CLIP_ID, project_id: PROJECT_ID };
    return { id: PROJECT_ID, user_id: OWNER };
  }),
  DbUnavailableError: class extends Error {},
}));

import { ApiError } from "@/lib/api";
import { getOwnedClip, getOwnedJob, getOwnedProject } from "@/lib/repo";

describe("ownership checks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the project for its owner", async () => {
    await expect(getOwnedProject(OWNER, PROJECT_ID)).resolves.toMatchObject({ id: PROJECT_ID });
  });
  it("hides other users' projects, clips and jobs behind 404", async () => {
    await expect(getOwnedProject("intruder", PROJECT_ID)).rejects.toMatchObject({ status: 404 });
    await expect(getOwnedClip("intruder", CLIP_ID)).rejects.toMatchObject({ status: 404 });
    await expect(getOwnedJob("intruder", CLIP_ID)).rejects.toMatchObject({ status: 404 });
  });
  it("rejects malformed ids without querying", async () => {
    const err = await getOwnedProject(OWNER, "1 OR 1=1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
  });
});
