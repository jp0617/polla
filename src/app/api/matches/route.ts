import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getScoringConfig } from "@/lib/scoring/config";

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

  const [matches, scoringConfig] = await Promise.all([
    prisma.match.findMany({
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
            advancingTeamId: true,
            points: true,
            status: true,
            userUpdatedAt: true,
          },
        },
      },
      orderBy: { kickoff: "asc" },
    }),
    getScoringConfig(),
  ]);

  const lockMs = (scoringConfig.lockMinutes ?? 1) * 60 * 1000;
  const now = new Date();

  return NextResponse.json(
    matches.map((m) => ({
      ...m,
      isLocked: new Date(m.kickoff).getTime() - now.getTime() <= lockMs,
      userPrediction: m.predictions[0] ?? null,
      predictions: undefined,
    }))
  );
}
