import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { scoreMatch, scoreMatchKO, isKnockoutStage } from "@/lib/scoring/engine";
import { getScoringConfig } from "@/lib/scoring/config";

/**
 * Full rescore: resets all SCORED predictions and rescores them from scratch
 * using the current engine. Fixes any drift from past bugs or corrections.
 */
export async function POST() {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scoringConfig = await getScoringConfig();

  // Get all finished matches with their predictions
  const matches = await prisma.match.findMany({
    where: { status: "FINISHED", homeScore: { not: null }, awayScore: { not: null } },
    select: {
      id: true,
      stage: true,
      homeScore: true,
      awayScore: true,
      homeScoreET: true,
      awayScoreET: true,
      advancingTeamId: true,
      homeTeamId: true,
      awayTeamId: true,
    },
  });

  // Reset all User.totalPoints to 0
  await prisma.user.updateMany({ data: { totalPoints: 0 } });

  // Reset all SCORED predictions to LOCKED
  await prisma.prediction.updateMany({
    where: { status: "SCORED" },
    data: { status: "LOCKED", points: null },
  });

  let rescored = 0;

  for (const match of matches) {
    if (match.homeScore === null || match.awayScore === null) continue;

    const isKO = isKnockoutStage(match.stage);

    // Infer advancingTeamId for non-draw KO matches
    const isActualDraw = match.homeScore === match.awayScore;
    const advancingTeamId = match.advancingTeamId
      ?? (!isActualDraw
        ? match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId
        : null);

    const predictions = await prisma.prediction.findMany({
      where: { matchId: match.id, status: "LOCKED" },
      select: { id: true, userId: true, homeScore: true, awayScore: true, advancingTeamId: true },
    });

    for (const pred of predictions) {
      const result = isKO
        ? scoreMatchKO(
            { home: pred.homeScore, away: pred.awayScore, advancingTeamId: pred.advancingTeamId },
            {
              home: match.homeScore,
              away: match.awayScore,
              homeScoreET: match.homeScoreET,
              awayScoreET: match.awayScoreET,
              advancingTeamId,
              homeTeamId: match.homeTeamId,
              awayTeamId: match.awayTeamId,
            },
            scoringConfig
          )
        : scoreMatch(
            { home: pred.homeScore, away: pred.awayScore },
            { home: match.homeScore, away: match.awayScore },
            scoringConfig
          );

      await prisma.prediction.update({
        where: { id: pred.id },
        data: { points: result.points, status: "SCORED" },
      });

      if (result.points > 0) {
        await prisma.user.update({
          where: { id: pred.userId },
          data: { totalPoints: { increment: result.points } },
        });
      }

      rescored++;
    }
  }

  return NextResponse.json({ ok: true, matches: matches.length, rescored });
}
