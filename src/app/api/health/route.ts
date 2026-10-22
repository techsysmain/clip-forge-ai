import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { checkStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe. Reveals no internal details. */
export async function GET() {
  try {
    await queryOne("SELECT 1");
    await checkStorage();
    return NextResponse.json({ status: "ok", storage: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
