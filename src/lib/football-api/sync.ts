import { prisma } from "@/lib/db/client";
import {
  getCompetitionMatches,
  mapApiStatus,
  mapApiStage,
} from "./client";
import { getScoringConfig } from "@/lib/scoring/config";
import { scoreMatchPredictions } from "@/lib/scoring/scoreMatchPredictions";
import { notifyMatchResult } from "@/lib/whatsapp/notifyMatchResult";
import { isKnockoutStage } from "@/lib/scoring/engine";
import { detectPhaseAdvancesForMatch } from "@/lib/scoring/detectPhaseAdvances";

export async function syncMatches(options: { sendWhatsapp?: boolean } = {}): Promise<{
  updated: number;
  scored: number;
  bonuses: number;
}> {
  const { sendWhatsapp = true } = options;
  const [apiMatches, scoringConfig] = await Promise.all([
    getCompetitionMatches(),
    getScoringConfig(),
  ]);
  let updatedCount = 0;
  let scoredCount = 0;
  let bonusCount = 0;

  for (const apiMatch of apiMatches) {
    // Skip matches where teams are not yet determined (future knockout rounds)
    if (!apiMatch.homeTeam?.id || !apiMatch.awayTeam?.id) continue;

    const status = mapApiStatus(apiMatch.status);
    const stage = mapApiStage(apiMatch.stage);

    // Upsert teams
    const [homeTeam, awayTeam] = await Promise.all([
      prisma.team.upsert({
        where: { apiId: apiMatch.homeTeam.id },
        create: {
          apiId: apiMatch.homeTeam.id,
          name: apiMatch.homeTeam.name,
          shortName: apiMatch.homeTeam.shortName,
          code: apiMatch.homeTeam.tla,
          crest: apiMatch.homeTeam.crest,
          currentStage: stage,
        },
        update: {
          name: apiMatch.homeTeam.name,
          shortName: apiMatch.homeTeam.shortName,
          crest: apiMatch.homeTeam.crest,
        },
      }),
      prisma.team.upsert({
        where: { apiId: apiMatch.awayTeam.id },
        create: {
          apiId: apiMatch.awayTeam.id,
          name: apiMatch.awayTeam.name,
          shortName: apiMatch.awayTeam.shortName,
          code: apiMatch.awayTeam.tla,
          crest: apiMatch.awayTeam.crest,
          currentStage: stage,
        },
        update: {
          name: apiMatch.awayTeam.name,
          shortName: apiMatch.awayTeam.shortName,
          crest: apiMatch.awayTeam.crest,
        },
      }),
    ]);

    // Upsert match — never overwrite a manually set score
    let existingMatch = await prisma.match.findUnique({
      where: { apiMatchId: apiMatch.id },
      select: { id: true, manualScore: true },
    });

    // If not found by real apiMatchId, check for a manually-created placeholder
    // (negative apiMatchId) with the same teams — link it to the real API match
    if (!existingMatch) {
      const manual = await prisma.match.findFirst({
        where: {
          apiMatchId: { lt: 0 },
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
        },
        select: { id: true, manualScore: true },
      });
      if (manual) {
        await prisma.match.update({
          where: { id: manual.id },
          data: { apiMatchId: apiMatch.id },
        });
        existingMatch = manual;
      }
    }

    const updatePayload = existingMatch?.manualScore
      ? { stage }
      : {
          status,
          homeScore: apiMatch.score.fullTime.home ?? undefined,
          awayScore: apiMatch.score.fullTime.away ?? undefined,
          stage,
          kickoff: new Date(apiMatch.utcDate),
          ...(apiMatch.score.fullTime.home !== null ? { scoreUpdatedAt: new Date() } : {}),
          ...(isKnockoutStage(stage) && apiMatch.score.winner && apiMatch.score.winner !== "DRAW"
            ? { advancingTeamId: apiMatch.score.winner === "HOME_TEAM" ? homeTeam.id : awayTeam.id }
            : {}),
        };

    const match = await prisma.match.upsert({
      where: { apiMatchId: apiMatch.id },
      create: {
        apiMatchId: apiMatch.id,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        kickoff: new Date(apiMatch.utcDate),
        stage,
        group: apiMatch.group,
        status,
        homeScore: apiMatch.score.fullTime.home ?? undefined,
        awayScore: apiMatch.score.fullTime.away ?? undefined,
      },
      update: updatePayload,
    });

    updatedCount++;

    // Skip prediction scoring if score was entered manually (already handled there)
    if (existingMatch?.manualScore) continue;

    // Score predictions only when match is FINISHED
    if (
      status === "FINISHED" &&
      apiMatch.score.fullTime.home !== null &&
      apiMatch.score.fullTime.away !== null
    ) {
      const scored = await scoreMatchPredictions(
        match.id,
        apiMatch.score.fullTime.home,
        apiMatch.score.fullTime.away
      );
      scoredCount += scored;
    }

    // Detect phase advances and award bonus points
    const bonuses = await detectPhaseAdvancesForMatch(homeTeam, awayTeam, stage);
    bonusCount += bonuses;
  }

  // Lock predictions based on configurable lockMinutes
  const lockMs = (scoringConfig.lockMinutes ?? 5) * 60 * 1000;
  const lockCutoff = new Date(Date.now() + lockMs);
  const matchesToLock = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      kickoff: { lte: lockCutoff },
    },
  });

  for (const match of matchesToLock) {
    await prisma.prediction.updateMany({
      where: { matchId: match.id, status: "PENDING" },
      data: { status: "LOCKED" },
    });
  }

  if (scoredCount > 0 && sendWhatsapp) {
    await notifyMatchResult();
  }

  return { updated: updatedCount, scored: scoredCount, bonuses: bonusCount };
}
