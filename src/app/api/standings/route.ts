import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { scoreMatch } from "@/lib/scoring/engine";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = (session.user as { isAdmin?: boolean }).isAdmin;
  const groupId = req.nextUrl.searchParams.get("groupId");

  // Admin without groupId sees global leaderboard (uses global scoring)
  if (isAdmin && !groupId) {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        totalPoints: true,
        manualPoints: true,
        memberships: { select: { bonusPoints: true } },
        predictions: { where: { status: "SCORED" }, select: { points: true } },
      },
    });

    const leaderboard = users
      .map((user, idx) => {
        const bonusPoints = user.memberships.reduce((s, m) => s + m.bonusPoints, 0);
        const total = user.totalPoints + user.manualPoints + bonusPoints;
        return {
          rank: idx + 1,
          userId: user.id,
          name: user.name,
          totalPoints: total,
          bonusPoints,
          exactScores: user.predictions.filter((p) => p.points === 5).length,
          correctWinners: user.predictions.filter((p) => p.points === 3).length,
          correctDraws: user.predictions.filter((p) => p.points === 2).length,
          favoriteTeam: null,
          isCurrentUser: user.id === userId,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints || b.exactScores - a.exactScores || a.name.localeCompare(b.name))
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

    return NextResponse.json({ leaderboard });
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

  const [memberships, groupCode, globalConfig] = await Promise.all([
    prisma.membership.findMany({
      where: { invitationCodeId: targetCodeId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            manualPoints: true,
            predictions: {
              where: { status: "SCORED" },
              select: {
                homeScore: true,
                awayScore: true,
                match: { select: { homeScore: true, awayScore: true } },
              },
            },
          },
        },
        favoriteTeam: { select: { name: true, crest: true, code: true } },
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
        bonusPhaseAdvanceKO: true,
      },
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
    correctAdvancingKO: globalConfig?.correctAdvancingKO ?? 2,
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
        const result = scoreMatch(
          { home: p.homeScore, away: p.awayScore },
          { home: p.match.homeScore, away: p.match.awayScore },
          pts
        );
        predictionPoints += result.points;
        if (result.breakdown.exactScore) exactScores++;
        else if (result.breakdown.correctWinner) correctWinners++;
        else if (!result.breakdown.exactScore && !result.breakdown.correctWinner && result.points > 0) correctDraws++;
      }

      const total = predictionPoints + m.user.manualPoints + m.bonusPoints;

      return {
        rank: 0,
        userId: m.user.id,
        name: m.user.name,
        totalPoints: total,
        predictionPoints,
        bonusPoints: m.bonusPoints,
        exactScores,
        correctWinners,
        correctDraws,
        favoriteTeam: m.favoriteTeam,
        isCurrentUser: m.user.id === userId,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || b.exactScores - a.exactScores || a.name.localeCompare(b.name))
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  return NextResponse.json({
    leaderboard,
    groupId: targetCodeId,
    groupConfig: {
      exactScore: pts.exactScore,
      correctWinner: pts.correctWinner,
      correctDraw: groupCode?.allowDraws === false ? 0 : pts.correctDraw,
      bonusPhaseAdvance: pts.bonusPhaseAdvance,
      allowDraws: groupCode?.allowDraws ?? true,
    },
  });
}
