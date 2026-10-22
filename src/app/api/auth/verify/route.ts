import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const fail = NextResponse.redirect(new URL("/login?error=invalid_link", env.appUrl));
  try {
    const session = await consumeMagicLink(token);
    if (!session) return fail;
    const res = NextResponse.redirect(new URL("/dashboard", env.appUrl));
    res.cookies.set(SESSION_COOKIE, session.jwt, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: session.maxAge,
    });
    return res;
  } catch (e) {
    console.error("[auth] verify failed", e instanceof Error ? e.message : e);
    return fail;
  }
}
