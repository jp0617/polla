import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  if (status) where.status = status;

  const matches = await prisma.match.findMany({
    where,
    include: {
      homeTeam: true,
      awayTeam: true,
      predictions: {
        where: { userId: session.user.id },
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          points: true,
          status: true,
          userUpdatedAt: true,
        },
      },
    },
    orderBy: { kickoff: "asc" },
  });

  const now = new Date();

  return NextResponse.json(
    matches.map((m: typeof matches[number]) => ({
      ...m,
      isLocked: new Date(m.kickoff).getTime() - now.getTime() <= 5 * 60 * 1000,
      userPrediction: m.predictions[0] ?? null,
      predictions: undefined,
    }))
  );
}
