import { prisma } from "@/lib/db/client";
import {
  getCompetitionMatches,
  mapApiStatus,
  mapApiStage,
  stageOrder,
} from "./client";
import { scoreMatch } from "@/lib/scoring/engine";
import { getScoringConfig } from "@/lib/scoring/config";

export async function syncMatches(): Promise<{
  updated: number;
  scored: number;
  bonuses: number;
}> {
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

    // Upsert match
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
      update: {
        status,
        homeScore: apiMatch.score.fullTime.home ?? undefined,
        awayScore: apiMatch.score.fullTime.away ?? undefined,
        stage,
      },
    });

    updatedCount++;

    // Score predictions only when match is FINISHED
    if (
      status === "FINISHED" &&
      apiMatch.score.fullTime.home !== null &&
      apiMatch.score.fullTime.away !== null
    ) {
      const actual = {
        home: apiMatch.score.fullTime.home,
        away: apiMatch.score.fullTime.away,
      };

      const unscoredPredictions = await prisma.prediction.findMany({
        where: { matchId: match.id, status: { not: "SCORED" } },
        include: { user: { select: { id: true, favoriteTeamId: true } } },
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

        // Update user total points
        await prisma.user.update({
          where: { id: pred.userId },
          data: { totalPoints: { increment: result.points } },
        });

        scoredCount++;
      }
    }

    // Detect phase advances and award bonus points
    const bonuses = await detectPhaseAdvancesForMatch(
      homeTeam,
      awayTeam,
      stage,
      scoringConfig.bonusPhaseAdvance
    );
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

  return { updated: updatedCount, scored: scoredCount, bonuses: bonusCount };
}

async function detectPhaseAdvancesForMatch(
  homeTeam: { id: string; currentStage: string; apiId: number },
  awayTeam: { id: string; currentStage: string; apiId: number },
  currentStage: string,
  bonusPoints: number
): Promise<number> {
  let bonusCount = 0;

  for (const team of [homeTeam, awayTeam]) {
    if (stageOrder[currentStage] > stageOrder[team.currentStage]) {
      // Team advanced to a new stage
      const existingAdvance = await prisma.phaseAdvance.findFirst({
        where: {
          teamId: team.id,
          toStage: currentStage,
          bonusGiven: true,
        },
      });

      if (!existingAdvance) {
        const advance = await prisma.phaseAdvance.create({
          data: {
            teamId: team.id,
            fromStage: team.currentStage,
            toStage: currentStage,
          },
        });

        // Award +2 bonus points to all users who have this team as favorite
        const favUsers = await prisma.user.findMany({
          where: { favoriteTeamId: team.id },
        });

        for (const user of favUsers) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              totalPoints: { increment: scoringConfig.bonusPhaseAdvance },
              bonusPoints: { increment: scoringConfig.bonusPhaseAdvance },
            },
          });
          bonusCount++;
        }

        await prisma.phaseAdvance.update({
          where: { id: advance.id },
          data: { bonusGiven: true },
        });

        // Update team's current stage
        await prisma.team.update({
          where: { id: team.id },
          data: { currentStage },
        });
      }
    }
  }

  return bonusCount;
}
