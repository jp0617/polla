import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      totalPoints: true,
      bonusPoints: true,
      favoriteTeam: { select: { name: true, crest: true, code: true } },
      predictions: {
        where: { status: "SCORED" },
        select: { points: true },
      },
    },
    orderBy: [{ totalPoints: "desc" }, { name: "asc" }],
  });

  const leaderboard = users.map(
    (
      user: {
        id: string;
        name: string;
        totalPoints: number;
        bonusPoints: number;
        favoriteTeam: { name: string; crest: string | null; code: string } | null;
        predictions: { points: number | null }[];
      },
      idx: number
    ) => {
      const exactScores = user.predictions.filter((p) => p.points === 5).length;
      const correctWinners = user.predictions.filter((p) => p.points === 3).length;
      const correctDraws = user.predictions.filter((p) => p.points === 1).length;

      return {
        rank: idx + 1,
        userId: user.id,
        name: user.name,
        totalPoints: user.totalPoints,
        bonusPoints: user.bonusPoints,
        exactScores,
        correctWinners,
        correctDraws,
        favoriteTeam: user.favoriteTeam,
        isCurrentUser: user.id === userId,
      };
    }
  );

  return NextResponse.json({ leaderboard });
}
