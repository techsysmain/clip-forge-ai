import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { cookies } from "next/headers";
import { query, queryOne } from "./db";
import { env } from "./env";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession, type SessionUser } from "./session";
import { ApiError } from "./api";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function getUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw new ApiError(401, "Please sign in to continue.");
  return user;
}

/** Creates a single-use magic link. Returns the link only when no mailer is configured outside production. */
export async function sendMagicLink(email: string): Promise<{ devLink?: string }> {
  const recent = await queryOne<{ n: string }>(
    "SELECT count(*) AS n FROM magic_tokens WHERE email = $1 AND created_at > now() - interval '10 minutes'",
    [email],
  );
  if (recent && Number(recent.n) >= 5) throw new ApiError(429, "Too many sign-in requests. Try again in a few minutes.");

  const token = crypto.randomBytes(32).toString("hex");
  await query("INSERT INTO magic_tokens (token_hash, email, expires_at) VALUES ($1, $2, now() + interval '15 minutes')", [
    sha(token),
    email,
  ]);
  const link = `${env.appUrl}/api/auth/verify?token=${token}`;

  if (env.smtpConfigured) {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "ClipForge AI <no-reply@localhost>",
      to: email,
      subject: "Your ClipForge AI sign-in link",
      text: `Sign in to ClipForge AI: ${link}\n\nThis link expires in 15 minutes and can be used once.`,
    });
    return {};
  }
  if (process.env.NODE_ENV === "production") throw new ApiError(500, "Email delivery is not configured.");
  console.log(`[auth] magic link for ${email}: ${link}`);
  return { devLink: link };
}

/** Consumes a magic-link token and returns a signed session JWT. */
export async function consumeMagicLink(token: string): Promise<{ jwt: string; maxAge: number } | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await queryOne<{ email: string }>(
    "UPDATE magic_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING email",
    [sha(token)],
  );
  if (!row) return null;
  const user = await queryOne<{ id: string; email: string }>(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id, email`,
    [row.email],
  );
  if (!user) return null;
  return { jwt: await signSession(user), maxAge: SESSION_MAX_AGE };
}
