import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { exec, query, queryOne } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";
import { removeProjectFiles } from "@/lib/storage";

export const GET = handle(async () => {
  const user = await requireUser();
  const row = await queryOne<{ email: string; notify_email: number; created_at: Date }>(
    "SELECT email, notify_email, created_at FROM users WHERE id = ?",
    [user.id],
  );
  if (!row) throw new ApiError(401, "Please sign in to continue.");
  return NextResponse.json({ account: { email: row.email, notifyEmail: !!row.notify_email, createdAt: row.created_at } });
});

export const PATCH = handle(async (req: Request) => {
  const user = await requireUser();
  const { notifyEmail } = z.object({ notifyEmail: z.boolean() }).parse(await req.json().catch(() => ({})));
  await exec("UPDATE users SET notify_email = ? WHERE id = ?", [notifyEmail ? 1 : 0, user.id]);
  return NextResponse.json({ ok: true });
});

/** Permanently deletes the account, all projects/clips/jobs, and every stored file. */
export const DELETE = handle(async () => {
  const user = await requireUser();
  const projects = await query<{ id: string }>("SELECT id FROM projects WHERE user_id = ?", [user.id]);
  await exec("DELETE FROM users WHERE id = ?", [user.id]);
  for (const p of projects) await removeProjectFiles(p.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
