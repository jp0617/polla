import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "england";

  const matches = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      OR: [
        { homeTeam: { name: { contains: q, mode: "insensitive" } } },
        { awayTeam: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      stage: true,
      homeScore: true,
      awayScore: true,
      advancingTeamId: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      predictions: {
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          advancingTeamId: true,
          points: true,
          status: true,
          user: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({ matches });
}
