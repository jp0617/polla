import { prisma } from "@/lib/db/client";
import { scoreMatch, scoreMatchKO, isKnockoutStage } from "./engine";
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
  const [scoringConfig, match] = await Promise.all([
    getScoringConfig(),
    prisma.match.findUnique({
      where: { id: matchId },
      select: { stage: true, advancingTeamId: true, homeTeamId: true, awayTeamId: true, homeScoreET: true, awayScoreET: true },
    }),
  ]);

  if (!match) return 0;

  const isKO = isKnockoutStage(match.stage);

  const unscoredPredictions = await prisma.prediction.findMany({
    where: { matchId, status: { not: "SCORED" } },
    select: { id: true, userId: true, homeScore: true, awayScore: true, advancingTeamId: true },
  });

  for (const pred of unscoredPredictions) {
    const result = isKO
      ? scoreMatchKO(
          { home: pred.homeScore, away: pred.awayScore, advancingTeamId: pred.advancingTeamId },
          { home: homeScore, away: awayScore, homeScoreET: match.homeScoreET, awayScoreET: match.awayScoreET, advancingTeamId: match.advancingTeamId, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
          scoringConfig
        )
      : scoreMatch(
          { home: pred.homeScore, away: pred.awayScore },
          { home: homeScore, away: awayScore },
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
