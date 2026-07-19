import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { isKnockoutStage, scoreMatch, scoreMatchKO } from "@/lib/scoring/engine";
import { getScoringConfig } from "@/lib/scoring/config";

function matchesPhase(stage: string, phase: string | null): boolean {
  if (!phase || phase === "all") return true;
  if (phase === "ko") return isKnockoutStage(stage);
  if (phase === "groups") return !isKnockoutStage(stage);
  return true;
}

/**
 * Projects (without persisting) the points each user would get right now
 * from LOCKED predictions on matches currently IN_PLAY/PAUSED, using the
 * live score already synced onto the match. Lets the standings table
 * "move" as goals happen, ahead of the match actually finishing.
 */
async function getLiveProjection(phase: string | null) {
  const liveMatches = await prisma.match.findMany({
    where: { status: { in: ["IN_PLAY", "PAUSED"] } },
    select: {
      id: true,
      stage: true,
      homeScore: true,
      awayScore: true,
      homeTeamId: true,
      awayTeamId: true,
      advancingTeamId: true,
    },
  });

  const relevantMatches = liveMatches.filter(
    (m) => matchesPhase(m.stage, phase) && m.homeScore !== null && m.awayScore !== null
  );

  const projection = new Map<string, number>();
  const liveUserIds = new Set<string>();
  if (relevantMatches.length === 0) {
    return { projection, liveUserIds, hasLiveMatch: liveMatches.length > 0 };
  }

  const scoringConfig = await getScoringConfig();
  const matchMap = new Map(relevantMatches.map((m) => [m.id, m]));

  const livePredictions = await prisma.prediction.findMany({
    where: { matchId: { in: relevantMatches.map((m) => m.id) }, status: "LOCKED" },
    select: { userId: true, matchId: true, homeScore: true, awayScore: true, advancingTeamId: true },
  });

  for (const pred of livePredictions) {
    const match = matchMap.get(pred.matchId);
    if (!match || match.homeScore === null || match.awayScore === null) continue;

    liveUserIds.add(pred.userId);
    const isKO = isKnockoutStage(match.stage);
    const isLiveTie = match.homeScore === match.awayScore;

    let livePoints: number;
    if (isKO && isLiveTie && !match.advancingTeamId) {
      // Mid-match tie in a KO stage: match.advancingTeamId is still null
      // (only set once the match actually finishes), so scoreMatchKO would
      // short-circuit to 0 for everyone. As a live preview — "if it ended
      // right now" — credit anyone who predicted a draw with the base
      // correctAdvancingKO/exactScoreKO points. The extra bonus for
      // guessing the penalty winner can't be projected: penalties haven't
      // happened yet, so it only applies once the match truly finishes.
      const predictedDraw = pred.homeScore === pred.awayScore;
      if (!predictedDraw) {
        livePoints = 0;
      } else {
        const exactScore = pred.homeScore === match.homeScore && pred.awayScore === match.awayScore;
        livePoints = exactScore ? scoringConfig.exactScoreKO : scoringConfig.correctAdvancingKO;
      }
    } else {
      const result = isKO
        ? scoreMatchKO(
            { home: pred.homeScore, away: pred.awayScore, advancingTeamId: pred.advancingTeamId },
            {
              home: match.homeScore,
              away: match.awayScore,
              advancingTeamId: match.advancingTeamId,
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
      livePoints = result.points;
    }

    projection.set(pred.userId, (projection.get(pred.userId) ?? 0) + livePoints);
  }

  return { projection, liveUserIds, hasLiveMatch: liveMatches.length > 0 };
}

/**
 * Automatically projects (without persisting) who "would be" champion right
 * now, based purely on the live score of the FINAL match — same idea as the
 * live points projection, no manual selection involved. Only active while
 * the FINAL is actually IN_PLAY/PAUSED and not tied, and only until the real
 * champion bonus has been given.
 */
async function getLiveChampionProjection() {
  const [finalMatch, scoringConfig] = await Promise.all([
    prisma.match.findFirst({
      where: { stage: "FINAL" },
      select: {
        status: true,
        homeScore: true,
        awayScore: true,
        homeTeam: { select: { id: true, name: true, crest: true, code: true } },
        awayTeam: { select: { id: true, name: true, crest: true, code: true } },
      },
    }),
    prisma.scoringConfig.findUnique({
      where: { id: "singleton" },
      select: { championBonus: true, championBonusGiven: true },
    }),
  ]);

  const championBonus = scoringConfig?.championBonus ?? 10;
  const championBonusGiven = scoringConfig?.championBonusGiven ?? false;

  let projectedChampionTeam: { id: string; name: string; crest: string | null; code: string } | null = null;
  if (
    finalMatch &&
    !championBonusGiven &&
    (finalMatch.status === "IN_PLAY" || finalMatch.status === "PAUSED") &&
    finalMatch.homeScore !== null &&
    finalMatch.awayScore !== null &&
    finalMatch.homeScore !== finalMatch.awayScore
  ) {
    projectedChampionTeam =
      finalMatch.homeScore > finalMatch.awayScore ? finalMatch.homeTeam : finalMatch.awayTeam;
  }

  return {
    projectedChampionTeamId: projectedChampionTeam?.id ?? null,
    projectedChampionTeam,
    championBonus,
    championBonusGiven,
  };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = (session.user as { isAdmin?: boolean }).isAdmin;
  const groupId = req.nextUrl.searchParams.get("groupId");
  const phase = req.nextUrl.searchParams.get("phase"); // "all" | "groups" | "ko"

  const [{ projection: liveProjection, liveUserIds, hasLiveMatch }, championProjection] = await Promise.all([
    getLiveProjection(phase),
    getLiveChampionProjection(),
  ]);

  const { projectedChampionTeamId, projectedChampionTeam, championBonus, championBonusGiven } = championProjection;

  // Admin without groupId sees global leaderboard (uses global scoring)
  if (isAdmin && !groupId) {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        manualPoints: true,
        memberships: { select: { bonusPoints: true, championPickId: true } },
        predictions: { where: { status: "SCORED" }, select: { points: true } },
      },
    });

    const leaderboard = users
      .map((user, idx) => {
        const bonusPoints = user.memberships.reduce((s, m) => s + m.bonusPoints, 0);
        const predPoints = user.predictions.reduce((s, p) => s + (p.points ?? 0), 0);
        const livePoints = liveProjection.get(user.id) ?? 0;
        const isSimulatedChampion =
          projectedChampionTeamId !== null &&
          user.memberships.some((m) => m.championPickId === projectedChampionTeamId);
        const simulatedChampionPoints = isSimulatedChampion ? championBonus : 0;
        const total = predPoints + user.manualPoints + bonusPoints + livePoints + simulatedChampionPoints;
        return {
          rank: idx + 1,
          userId: user.id,
          name: user.name,
          totalPoints: total,
          bonusPoints,
          livePoints,
          isLive: liveUserIds.has(user.id),
          simulatedChampionPoints,
          isSimulatedChampion,
          exactScores: user.predictions.filter((p) => (p.points ?? 0) >= 5).length,
          correctWinners: user.predictions.filter((p) => (p.points ?? 0) === 3 || (p.points ?? 0) === 6).length,
          correctDraws: user.predictions.filter((p) => (p.points ?? 0) === 2 || (p.points ?? 0) === 4).length,
          favoriteTeam: null,
          isCurrentUser: user.id === userId,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints || b.exactScores - a.exactScores || a.name.localeCompare(b.name))
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

    return NextResponse.json({
      leaderboard,
      hasLiveMatch,
      projectedChampionTeam,
      championBonus,
      championBonusGiven,
    });
  }

  // Determine which group to show
  let targetCodeId: string | null = groupId;

  if (!targetCodeId) {
    const firstMembership = await prisma.membership.findFirst({
      where: { userId },
      orderBy: { joinedAt: "asc" },
      select: { invitationCodeId: true },
    });
    targetCodeId = firstMembership?.invitationCodeId ?? null;
  }

  if (!targetCodeId) {
    return NextResponse.json({ leaderboard: [] });
  }

  if (!isAdmin) {
    const membership = await prisma.membership.findUnique({
      where: { userId_invitationCodeId: { userId, invitationCodeId: targetCodeId } },
    });
    if (!membership) {
      return NextResponse.json({ error: "No perteneces a este grupo" }, { status: 403 });
    }
  }

  const [memberships, groupCode, globalConfig, phaseAdvances] = await Promise.all([
    prisma.membership.findMany({
      where: { invitationCodeId: targetCodeId },
      select: {
        bonusPoints: true,
        favoriteTeamId: true,
        favoriteTeam: { select: { name: true, crest: true, code: true } },
        championPickId: true,
        championPick: { select: { name: true, crest: true, code: true } },
        user: {
          select: {
            id: true,
            name: true,
            manualPoints: true,
            predictions: {
              where: { status: "SCORED" },
              select: {
                points: true,
                homeScore: true,
                awayScore: true,
                match: { select: { homeScore: true, awayScore: true, stage: true } },
              },
            },
          },
        },
      },
    }),
    prisma.invitationCode.findUnique({
      where: { id: targetCodeId },
      select: {
        allowDraws: true,
        exactScore: true,
        correctWinner: true,
        correctDraw: true,
        bonusPhaseAdvance: true,
        lockMinutes: true,
      },
    }),
    prisma.scoringConfig.findUnique({
      where: { id: "singleton" },
      select: {
        exactScore: true,
        correctWinner: true,
        correctDraw: true,
        bonusPhaseAdvance: true,
        exactScoreKO: true,
        correctWinnerKO: true,
        correctAdvancingKO: true,
        advancingPickBonusKO: true,
        bonusPhaseAdvanceKO: true,
      },
    }),
    prisma.phaseAdvance.findMany({
      select: { teamId: true, fromStage: true, bonusGiven: true },
      where: { bonusGiven: true },
    }),
  ]);

  // Merge group overrides with global defaults
  const pts = {
    exactScore: groupCode?.exactScore ?? globalConfig?.exactScore ?? 5,
    correctWinner: groupCode?.correctWinner ?? globalConfig?.correctWinner ?? 3,
    correctDraw: groupCode?.allowDraws === false ? 0 : (groupCode?.correctDraw ?? globalConfig?.correctDraw ?? 2),
    bonusPhaseAdvance: groupCode?.bonusPhaseAdvance ?? globalConfig?.bonusPhaseAdvance ?? 2,
    exactScoreKO: globalConfig?.exactScoreKO ?? 10,
    correctWinnerKO: globalConfig?.correctWinnerKO ?? 6,
    correctAdvancingKO: globalConfig?.correctAdvancingKO ?? 4,
    advancingPickBonusKO: globalConfig?.advancingPickBonusKO ?? 1,
    bonusPhaseAdvanceKO: globalConfig?.bonusPhaseAdvanceKO ?? 4,
  };

  const leaderboard = memberships
    .map((m) => {
      let exactScores = 0;
      let correctWinners = 0;
      let correctDraws = 0;
      let predictionPoints = 0;

      for (const p of m.user.predictions) {
        if (p.match.homeScore === null || p.match.awayScore === null) continue;
        if (!matchesPhase(p.match.stage, phase)) continue;
        const stored = p.points ?? 0;
        predictionPoints += stored;
        // Determine breakdown category from score comparison
        const isExact = p.homeScore === p.match.homeScore && p.awayScore === p.match.awayScore;
        const matchWinner = p.match.homeScore > p.match.awayScore ? "H" : p.match.awayScore > p.match.homeScore ? "A" : "D";
        const predWinner = p.homeScore > p.awayScore ? "H" : p.awayScore > p.homeScore ? "A" : "D";
        if (isExact) exactScores++;
        else if (stored > 0 && predWinner === matchWinner && matchWinner !== "D") correctWinners++;
        else if (stored > 0 && predWinner === "D" && matchWinner === "D") correctDraws++;
      }

      // Split phase-advance bonuses by type based on PhaseAdvance records
      let bonusPoints = m.bonusPoints;
      if (phase && phase !== "all" && m.favoriteTeamId) {
        const teamAdvances = phaseAdvances.filter((pa) => pa.teamId === m.favoriteTeamId);
        const groupsBonus = teamAdvances
          .filter((pa) => !isKnockoutStage(pa.fromStage))
          .reduce((s) => s + pts.bonusPhaseAdvance, 0);
        const koBonus = teamAdvances
          .filter((pa) => isKnockoutStage(pa.fromStage))
          .reduce((s) => s + pts.bonusPhaseAdvanceKO, 0);
        bonusPoints = phase === "groups" ? groupsBonus : koBonus;
      }
      const livePoints = liveProjection.get(m.user.id) ?? 0;
      const isSimulatedChampion = projectedChampionTeamId !== null && m.championPickId === projectedChampionTeamId;
      const simulatedChampionPoints = isSimulatedChampion ? championBonus : 0;
      const total = predictionPoints + m.user.manualPoints + bonusPoints + livePoints + simulatedChampionPoints;

      return {
        rank: 0,
        userId: m.user.id,
        name: m.user.name,
        totalPoints: total,
        predictionPoints,
        bonusPoints,
        livePoints,
        isLive: liveUserIds.has(m.user.id),
        simulatedChampionPoints,
        isSimulatedChampion,
        exactScores,
        correctWinners,
        correctDraws,
        favoriteTeam: m.favoriteTeam,
        championPick: m.championPick,
        isCurrentUser: m.user.id === userId,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || b.exactScores - a.exactScores || a.name.localeCompare(b.name))
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  return NextResponse.json({
    leaderboard,
    groupId: targetCodeId,
    hasLiveMatch,
    projectedChampionTeam,
    championBonus,
    championBonusGiven,
    groupConfig: {
      exactScore: pts.exactScore,
      correctWinner: pts.correctWinner,
      correctDraw: groupCode?.allowDraws === false ? 0 : pts.correctDraw,
      bonusPhaseAdvance: pts.bonusPhaseAdvance,
      allowDraws: groupCode?.allowDraws ?? true,
    },
  });
}
