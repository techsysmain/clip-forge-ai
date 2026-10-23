import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PROTECTED = ["/dashboard", "/projects", "/clips", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF defence in depth: state-changing API calls must come from our own origin.
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        /* invalid origin */
      }
      if (!originHost || originHost !== host) {
        return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname === "/login" && user) return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/clips/:path*",
    "/settings/:path*",
    "/login",
    // Every /api route except the streaming upload endpoint: middleware would buffer (and truncate) its body.
    "/api/((?!projects/[^/]+/source$).*)",
  ],
};
