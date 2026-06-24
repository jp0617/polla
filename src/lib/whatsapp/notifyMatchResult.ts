import { prisma } from "@/lib/db/client";
import { sendDailyResultsToAll, getConnectionStatus } from "./service";
import { startOfDay, endOfDay } from "date-fns";

/**
 * Sends today's accumulated results via each code admin that has an active session.
 * Called after every match is scored — one message per match per group.
 * Returns the number of groups notified.
 */
export async function notifyMatchResult(): Promise<number> {
  const codesWithAdmin = await prisma.invitationCode.findMany({
    where: { adminId: { not: null } },
    select: {
      id: true,
      adminId: true,
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              totalPoints: true,
              manualPoints: true,
              predictions: {
                where: { status: "SCORED" },
                select: {
                  points: true,
                  match: { select: { kickoff: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  let codesNotified = 0;

  for (const code of codesWithAdmin) {
    if (!code.adminId) continue;
    if (!getConnectionStatus(code.adminId)) continue;

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const ranked = code.memberships
      .map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        total: m.user.totalPoints + m.user.manualPoints + m.bonusPoints,
        exactScores: m.user.predictions.filter((p) => (p.points ?? 0) >= 5).length,
      }))
      .sort((a, b) => b.total - a.total || b.exactScores - a.exactScores || a.name.localeCompare(b.name));
    const rankMap = new Map(ranked.map((r, idx) => [r.userId, idx + 1]));

    const results = code.memberships.map((m) => {
      const total = m.user.totalPoints + m.user.manualPoints + m.bonusPoints;
      const todayPreds = m.user.predictions.filter((p) => {
        const k = new Date(p.match.kickoff);
        return k >= todayStart && k <= todayEnd;
      });
      const pointsToday = todayPreds.reduce((s, p) => s + (p.points ?? 0), 0);
      const exactScores = todayPreds.filter((p) => (p.points ?? 0) >= 5).length;
      return {
        phone: m.user.phone,
        name: m.user.name,
        exactScores,
        pointsToday,
        totalPoints: total,
        rank: rankMap.get(m.user.id) ?? 0,
      };
    });

    await sendDailyResultsToAll(code.adminId, results);
    codesNotified++;

    // Mark wppSentAt on predictions communicated for the first time
    const now = new Date();
    for (const m of code.memberships) {
      const predIds = await prisma.prediction.findMany({
        where: {
          userId: m.user.id,
          status: "SCORED",
          wppSentAt: null,
          match: { kickoff: { gte: startOfDay(now), lte: endOfDay(now) } },
        },
        select: { id: true },
      });
      if (predIds.length > 0) {
        await prisma.prediction.updateMany({
          where: { id: { in: predIds.map((p) => p.id) } },
          data: { wppSentAt: now },
        });
      }
    }
  }

  return codesNotified;
}
