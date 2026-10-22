import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DbUnavailableError } from "./db";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Wraps a route handler, converting errors into safe JSON responses (no stack traces). */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      }
      if (e instanceof ZodError) {
        return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
      }
      if (e instanceof DbUnavailableError) {
        return NextResponse.json({ error: "The database is not configured." }, { status: 503 });
      }
      console.error("[api]", e instanceof Error ? e.message : e);
      const code = (e as { code?: string })?.code;
      if (code === "ECONNREFUSED" || code === "ENOTFOUND") {
        return NextResponse.json({ error: "The database is unreachable." }, { status: 503 });
      }
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
