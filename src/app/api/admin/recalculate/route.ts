import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { scoreMatch, scoreMatchKO, isKnockoutStage } from "@/lib/scoring/engine";
import { getScoringConfig } from "@/lib/scoring/config";

/**
 * Full rescore: resets all SCORED predictions and rescores from scratch.
 * Then recalculates User.totalPoints as the sum of all scored prediction points.
 */
export async function POST() {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scoringConfig = await getScoringConfig();

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

  // Reset all SCORED predictions
  await prisma.prediction.updateMany({
    where: { status: "SCORED" },
    data: { status: "LOCKED", points: null },
  });

  let rescored = 0;

  for (const match of matches) {
    if (match.homeScore === null || match.awayScore === null) continue;

    const isKO = isKnockoutStage(match.stage);
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

      rescored++;
    }
  }

  // Recalculate User.totalPoints as sum of all SCORED prediction points (single query per user)
  const users = await prisma.user.findMany({
    select: {
      id: true,
      predictions: { where: { status: "SCORED" }, select: { points: true } },
    },
  });

  for (const user of users) {
    const predPoints = user.predictions.reduce((s, p) => s + (p.points ?? 0), 0);
    await prisma.user.update({
      where: { id: user.id },
      data: { totalPoints: predPoints },
    });
  }

  return NextResponse.json({ ok: true, matches: matches.length, rescored });
}
