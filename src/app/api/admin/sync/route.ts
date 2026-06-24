import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncMatches } from "@/lib/football-api/sync";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  sendWhatsapp: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin;
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { sendWhatsapp } = schema.parse(body);

  try {
    const result = await syncMatches({ sendWhatsapp });
    return NextResponse.json({ success: true, ...result, sendWhatsapp });
  } catch (err) {
    return NextResponse.json({ error: "Sync failed", details: String(err) }, { status: 500 });
  }
}
