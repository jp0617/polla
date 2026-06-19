import { prisma } from "@/lib/db/client";
import { getConnectionStatus, sendWhatsAppMessage } from "./service";
import { teamName } from "@/lib/team-names";

/**
 * Sends a WhatsApp reminder 15 minutes before each match starts.
 * Runs via a cron every minute. Uses reminderSentAt to avoid duplicates.
 * Returns the number of groups notified.
 */
export async function sendMatchReminders(): Promise<{ matches: number; messages: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 13 * 60 * 1000); // 13 min from now
  const windowEnd = new Date(now.getTime() + 17 * 60 * 1000);   // 17 min from now

  // Find matches starting in the 13-17 min window that haven't been reminded yet
  const matches = await prisma.match.findMany({
    where: {
      kickoff: { gte: windowStart, lte: windowEnd },
      status: "SCHEDULED",
      reminderSentAt: null,
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  if (matches.length === 0) return { matches: 0, messages: 0 };

  let totalMessages = 0;

  for (const match of matches) {
    const home = teamName(match.homeTeam.name);
    const away = teamName(match.awayTeam.name);

    // Get all invitation codes with an active WA session
    const codes = await prisma.invitationCode.findMany({
      where: { adminId: { not: null } },
      select: {
        adminId: true,
        memberships: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                predictions: {
                  where: { matchId: match.id },
                  select: { homeScore: true, awayScore: true },
                },
              },
            },
          },
        },
      },
    });

    for (const code of codes) {
      if (!code.adminId) continue;
      if (!getConnectionStatus(code.adminId)) continue;

      for (const membership of code.memberships) {
        const { user } = membership;
        if (!user.phone) continue;

        const pred = user.predictions[0] ?? null;
        const predLine = pred
          ? `Tu pronóstico: *${pred.homeScore} - ${pred.awayScore}*`
          : `⏰ ¡Aún puedes hacer tu pronóstico!`;

        const message =
          `⚽ *Recordatorio* — el partido empieza en ~15 minutos:\n` +
          `*${home} vs ${away}*\n` +
          predLine;

        try {
          await sendWhatsAppMessage(code.adminId, user.phone, message);
          totalMessages++;
        } catch (err) {
          console.error(`[WA Reminder] Failed to send to ${user.phone}:`, err);
        }
      }
    }

    // Mark reminder as sent for this match
    await prisma.match.update({
      where: { id: match.id },
      data: { reminderSentAt: now },
    });
  }

  return { matches: matches.length, messages: totalMessages };
}
