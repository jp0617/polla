import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { sendDailyResultsToAll } from "@/lib/whatsapp/service";
import { startOfDay, endOfDay } from "date-fns";

type UserRow = {
  id: string;
  name: string;
  phone: string;
  totalPoints: number;
  predictions: { points: number | null }[];
};

type RankRow = { id: string; totalPoints: number };

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = (session.user as { isAdmin?: boolean }).isAdmin;

  // Check if user is a code admin — if so, scope to their code's users
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

  const userWhere = invitationCodeId ? { invitationCodeId } : {};

  const users: UserRow[] = await prisma.user.findMany({
    where: userWhere,
    select: {
      id: true,
      name: true,
      phone: true,
      totalPoints: true,
      predictions: {
        where: {
          status: "SCORED",
          match: { kickoff: { gte: dayStart, lte: dayEnd } },
        },
        select: { points: true },
      },
    },
  });

  const usersWithRank: RankRow[] = await prisma.user.findMany({
    where: userWhere,
    select: { id: true, totalPoints: true },
    orderBy: [{ totalPoints: "desc" }],
  });
  const rankMap = new Map<string, number>(
    usersWithRank.map((u: RankRow, idx: number) => [u.id, idx + 1])
  );

  const results = users.map((user: UserRow) => {
    const todayPoints = user.predictions.reduce(
      (sum: number, p: { points: number | null }) => sum + (p.points ?? 0),
      0
    );
    const exactScores = user.predictions.filter(
      (p: { points: number | null }) => p.points === 5
    ).length;

    return {
      phone: user.phone,
      name: user.name,
      exactScores,
      pointsToday: todayPoints,
      totalPoints: user.totalPoints,
      rank: rankMap.get(user.id) ?? 0,
    };
  });

  // Messages are sent from the requesting user's own WhatsApp session
  const { sent, failed } = await sendDailyResultsToAll(userId, results);

  return NextResponse.json({ success: true, sent, failed, total: results.length });
}
