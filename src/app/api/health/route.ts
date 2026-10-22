import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { freeBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Reveals no internal details. */
export async function GET() {
  try {
    await queryOne("SELECT 1");
    const free = await freeBytes();
    return NextResponse.json({ status: "ok", storage: free === null ? "unknown" : "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
