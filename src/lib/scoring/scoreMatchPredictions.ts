import { prisma } from "@/lib/db/client";
import { scoreMatch } from "./engine";
import { getScoringConfig } from "./config";

/**
 * Scores all unscored predictions for a finished match and updates user points.
 * Safe to call multiple times — only processes predictions not yet SCORED.
 */
export async function scoreMatchPredictions(
  matchId: string,
  homeScore: number,
  awayScore: number
): Promise<number> {
  const scoringConfig = await getScoringConfig();
  const actual = { home: homeScore, away: awayScore };

  const unscoredPredictions = await prisma.prediction.findMany({
    where: { matchId, status: { not: "SCORED" } },
    select: { id: true, userId: true, homeScore: true, awayScore: true },
  });

  for (const pred of unscoredPredictions) {
    const result = scoreMatch(
      { home: pred.homeScore, away: pred.awayScore },
      actual,
      scoringConfig
    );

    await prisma.prediction.update({
      where: { id: pred.id },
      data: { points: result.points, status: "SCORED" },
    });

    await prisma.user.update({
      where: { id: pred.userId },
      data: { totalPoints: { increment: result.points } },
    });
  }

  return unscoredPredictions.length;
}
