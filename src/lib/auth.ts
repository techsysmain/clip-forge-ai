import crypto from "node:crypto";
import { cookies } from "next/headers";
import { exec, isDuplicateError, newId, queryOne } from "./db";
import { sendEmail } from "./email";
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
  const recent = await queryOne<{ n: number }>(
    "SELECT count(*) AS n FROM magic_tokens WHERE email = ? AND created_at > DATE_SUB(NOW(3), INTERVAL 10 MINUTE)",
    [email],
  );
  if (recent && Number(recent.n) >= 5) throw new ApiError(429, "Too many sign-in requests. Try again in a few minutes.");

  const token = crypto.randomBytes(32).toString("hex");
  await exec("INSERT INTO magic_tokens (token_hash, email, expires_at) VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL 15 MINUTE))", [
    sha(token),
    email,
  ]);
  const link = `${env.appUrl}/api/auth/verify?token=${token}`;

  if (env.resendKey) {
    try {
      await sendEmail({
        to: email,
        subject: "Your ClipForge AI sign-in link",
        heading: "Sign in to ClipForge AI",
        paragraphs: ["Click the button below to sign in. This link expires in 15 minutes and can only be used once.", "If you didn't request it, you can ignore this email."],
        cta: { label: "Sign in", url: link },
      });
    } catch {
      throw new ApiError(502, "We couldn't send the sign-in email. Please try again shortly.");
    }
    return {};
  }
  if (process.env.NODE_ENV === "production") throw new ApiError(500, "Email delivery is not configured.");
  console.log(`[auth] magic link for ${email}: ${link}`);
  return { devLink: link };
}

/** Consumes a magic-link token and returns a signed session JWT. */
export async function consumeMagicLink(token: string): Promise<{ jwt: string; maxAge: number } | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = sha(token);
  const claimed = await exec(
    "UPDATE magic_tokens SET used_at = NOW(3) WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW(3)",
    [hash],
  );
  if (claimed !== 1) return null;
  const row = await queryOne<{ email: string }>("SELECT email FROM magic_tokens WHERE token_hash = ?", [hash]);
  if (!row) return null;

  let user = await queryOne<{ id: string; email: string }>("SELECT id, email FROM users WHERE email = ?", [row.email]);
  if (!user) {
    const id = newId();
    try {
      await exec("INSERT INTO users (id, email, terms_accepted_at) VALUES (?, ?, NOW(3))", [id, row.email]);
    } catch (e) {
      if (!isDuplicateError(e)) throw e;
    }
    user = await queryOne<{ id: string; email: string }>("SELECT id, email FROM users WHERE email = ?", [row.email]);
  } else {
    await exec("UPDATE users SET terms_accepted_at = COALESCE(terms_accepted_at, NOW(3)) WHERE id = ?", [user.id]);
  }
  if (!user) return null;
  return { jwt: await signSession(user), maxAge: SESSION_MAX_AGE };
}
