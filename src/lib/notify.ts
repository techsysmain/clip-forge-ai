import { queryOne } from "./db";
import { sendEmail } from "./email";
import { env } from "./env";

/** Best-effort email to a project's owner (respects their notification preference). Never throws. */
export async function notifyProjectOwner(
  projectId: string,
  build: (title: string) => { subject: string; heading: string; paragraphs: string[]; path: string; cta: string },
): Promise<void> {
  if (!env.resendKey) return;
  try {
    const row = await queryOne<{ email: string; notify_email: number; title: string }>(
      "SELECT u.email, u.notify_email, p.title FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?",
      [projectId],
    );
    if (!row || !row.notify_email) return;
    const m = build(row.title);
    await sendEmail({
      to: row.email,
      subject: m.subject,
      heading: m.heading,
      paragraphs: m.paragraphs,
      cta: { label: m.cta, url: `${env.appUrl}${m.path}` },
    });
  } catch (e) {
    console.error("[notify] failed:", e instanceof Error ? e.message : e);
  }
}
