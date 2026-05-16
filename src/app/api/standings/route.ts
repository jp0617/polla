import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = (session.user as { isAdmin?: boolean }).isAdmin;
  const groupId = req.nextUrl.searchParams.get("groupId");

  // Admin without groupId sees all users (global leaderboard)
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
          favoriteTeam: null,
          isCurrentUser: user.id === userId,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name))
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

    return NextResponse.json({ leaderboard });
  }

  // Determine which group to show
  let targetCodeId: string | null = groupId;

  if (!targetCodeId) {
    // Default to user's first (earliest) membership
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

  // Verify the requesting user belongs to this group (or is admin)
  if (!isAdmin) {
    const membership = await prisma.membership.findUnique({
      where: { userId_invitationCodeId: { userId, invitationCodeId: targetCodeId } },
    });
    if (!membership) {
      return NextResponse.json({ error: "No perteneces a este grupo" }, { status: 403 });
    }
  }

  const memberships = await prisma.membership.findMany({
    where: { invitationCodeId: targetCodeId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          totalPoints: true,
          manualPoints: true,
          predictions: { where: { status: "SCORED" }, select: { points: true } },
        },
      },
      favoriteTeam: { select: { name: true, crest: true, code: true } },
    },
  });

  const leaderboard = memberships
    .map((m) => {
      const total = m.user.totalPoints + m.user.manualPoints + m.bonusPoints;
      return {
        rank: 0,
        userId: m.user.id,
        name: m.user.name,
        totalPoints: total,
        bonusPoints: m.bonusPoints,
        exactScores: m.user.predictions.filter((p) => p.points === 5).length,
        correctWinners: m.user.predictions.filter((p) => p.points === 3).length,
        favoriteTeam: m.favoriteTeam,
        isCurrentUser: m.user.id === userId,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name))
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  return NextResponse.json({ leaderboard, groupId: targetCodeId });
}
