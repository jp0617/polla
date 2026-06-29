import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { sendDailyResultsToAll } from "@/lib/whatsapp/service";
import { startOfDay, endOfDay } from "date-fns";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = (session.user as { isAdmin?: boolean }).isAdmin;

  // Check if user is a code admin — if so, scope to their code's members
  let invitationCodeId: string | null = null;
  if (!isAdmin) {
    const codeAdmin = await prisma.invitationCode.findFirst({
      where: { adminId: userId },
      select: { id: true },
    });
    if (!codeAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    invitationCodeId = codeAdmin.id;
  }

  const body = await req.json().catch(() => ({}));
  const { date } = body as { date?: string };

  const targetDate = date ? new Date(date) : new Date();
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);

  // Fetch memberships (scoped or global) with user data
  const memberships = await prisma.membership.findMany({
    where: invitationCodeId ? { invitationCodeId } : {},
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
          totalPoints: true,
          manualPoints: true,
          predictions: {
            where: {
              status: "SCORED",
              match: { kickoff: { gte: dayStart, lte: dayEnd } },
            },
            select: { points: true },
          },
        },
      },
    },
  });

  // Compute per-group total for ranking
  const ranked = memberships
    .map((m) => ({
      userId: m.user.id,
      total: m.user.totalPoints + m.user.manualPoints + m.bonusPoints,
    }))
    .sort((a, b) => b.total - a.total);

  const rankMap = new Map<string, number>(ranked.map((r, idx) => [r.userId, idx + 1]));

  const results = memberships.map((m) => {
    const total = m.user.totalPoints + m.user.manualPoints + m.bonusPoints;
    const todayPoints = m.user.predictions.reduce((s, p) => s + (p.points ?? 0), 0);
    const exactScores = m.user.predictions.filter((p) => p.points === 5).length;
    return {
      phone: m.user.phone,
      name: m.user.name,
      exactScores,
      pointsToday: todayPoints,

      totalPoints: total,
      rank: rankMap.get(m.user.id) ?? 0,
    };
  });

  const { sent, failed } = await sendDailyResultsToAll(userId, results);

  return NextResponse.json({ success: true, sent, failed, total: results.length });
}
