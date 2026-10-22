import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "cf_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

function key() {
  const s = process.env.AUTH_SECRET ?? "";
  if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not configured");
  return new TextEncoder().encode(s || "dev-only-insecure-secret-change-me-please-32b");
}

export interface SessionUser {
  id: string;
  email: string;
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string") return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
