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
                where: {
                  status: "SCORED",
                  match: {
                    kickoff: {
                      gte: startOfDay(new Date()),
                      lte: endOfDay(new Date()),
                    },
                  },
                },
                select: { points: true },
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

    const ranked = code.memberships
      .map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        total: m.user.totalPoints + m.user.manualPoints + m.bonusPoints,
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const rankMap = new Map(ranked.map((r, idx) => [r.userId, idx + 1]));

    const results = code.memberships.map((m) => {
      const total = m.user.totalPoints + m.user.manualPoints + m.bonusPoints;
      const pointsToday = m.user.predictions.reduce((s, p) => s + (p.points ?? 0), 0);
      return {
        phone: m.user.phone,
        name: m.user.name,
        exactScores: m.user.predictions.filter((p) => p.points === 5).length,
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
