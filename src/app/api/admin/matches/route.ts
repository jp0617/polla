import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin;
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Return matches from the last 3 days and the next 3 days
  const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const to = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const matches = await prisma.match.findMany({
    where: { kickoff: { gte: from, lte: to } },
    include: {
      homeTeam: { select: { name: true, code: true, crest: true } },
      awayTeam: { select: { name: true, code: true, crest: true } },
    },
    orderBy: { kickoff: "asc" },
  });

  return NextResponse.json({ matches });
}
