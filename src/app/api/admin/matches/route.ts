import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin;
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const matches = await prisma.match.findMany({
    include: {
      homeTeam: { select: { name: true, code: true, crest: true } },
      awayTeam: { select: { name: true, code: true, crest: true } },
    },
    orderBy: { kickoff: "asc" },
  });

  return NextResponse.json({ matches });
}
