import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { sendMagicLink } from "@/lib/auth";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200) });

export const POST = handle(async (req: Request) => {
  const { email } = schema.parse(await req.json().catch(() => ({})));
  const { devLink } = await sendMagicLink(email);
  return NextResponse.json({ ok: true, devLink });
});
