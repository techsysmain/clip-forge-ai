import { env } from "./env";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface EmailMessage {
  to: string;
  subject: string;
  heading: string;
  /** Plain text paragraphs (escaped automatically) */
  paragraphs: string[];
  cta?: { label: string; url: string };
}

export function renderEmail(m: EmailMessage): { html: string; text: string } {
  const body = m.paragraphs.map((p) => `<p style="margin:0 0 14px;color:#c9c9d6;font-size:15px;line-height:1.55">${escapeHtml(p)}</p>`).join("");
  const cta = m.cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(m.cta.url)}" style="background:#7C5CFF;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600;display:inline-block">${escapeHtml(m.cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#0b0b12;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#12121c;border:1px solid #23233a;border-radius:16px;padding:28px">
<p style="margin:0 0 18px;color:#7C5CFF;font-weight:700;font-size:15px">ClipForge AI</p>
<h1 style="margin:0 0 16px;color:#fff;font-size:20px">${escapeHtml(m.heading)}</h1>${body}${cta}
<p style="margin:24px 0 0;color:#6b6b80;font-size:12px">You received this email because of activity on your ClipForge AI account.</p>
</div></body></html>`;
  const text = [m.heading, "", ...m.paragraphs, ...(m.cta ? ["", `${m.cta.label}: ${m.cta.url}`] : [])].join("\n");
  return { html, text };
}

export class EmailNotConfiguredError extends Error {}

/** Sends a transactional email through the Resend API. */
export async function sendEmail(m: EmailMessage): Promise<void> {
  if (!env.resendKey) throw new EmailNotConfiguredError("RESEND_API_KEY is not configured.");
  const { html, text } = renderEmail(m);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.emailFrom, to: [m.to], subject: m.subject, html, text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.error(`[email] Resend responded ${res.status}`);
    throw new Error(`Resend responded with ${res.status}`);
  }
}
