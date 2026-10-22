import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PROTECTED = ["/dashboard", "/projects", "/clips"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname === "/login" && user) return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/projects/:path*", "/clips/:path*", "/login"] };
