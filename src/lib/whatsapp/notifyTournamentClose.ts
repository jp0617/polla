import { prisma } from "@/lib/db/client";
import { sendWhatsAppMessage, getConnectionStatus } from "./service";

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * Sends a closing message (thank you + group top 3) to every participant,
 * once per group, via that group's WhatsApp-connected admin.
 */
export async function notifyTournamentClose(): Promise<number> {
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
              manualPoints: true,
              predictions: {
                where: { status: "SCORED" },
                select: { points: true },
              },
            },
          },
        },
      },
    },
  });

  let notified = 0;

  for (const code of codesWithAdmin) {
    if (!code.adminId) continue;
    if (!getConnectionStatus(code.adminId)) continue;
    if (code.memberships.length === 0) continue;

    const ranked = code.memberships
      .map((m) => {
        const predPoints = m.user.predictions.reduce((s, p) => s + (p.points ?? 0), 0);
        return {
          userId: m.user.id,
          name: m.user.name,
          phone: m.user.phone,
          total: predPoints + m.user.manualPoints + m.bonusPoints,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    const top3 = ranked
      .slice(0, 3)
      .map((r, idx) => `${MEDALS[idx]} ${r.name} — ${r.total} pts`)
      .join("\n");

    for (let i = 0; i < ranked.length; i++) {
      const entry = ranked[i];
      if (!entry.phone) continue;

      const isWinner = i === 0;
      const message = isWinner
        ? `🏆👑 ¡FELICIDADES ${entry.name}!\n\n` +
          `Eres el GANADOR de la Polla 2026 con ${entry.total} pts. 🎉\n\n` +
          `🏆 Top 3 del grupo:\n${top3}\n\n` +
          `¡Gracias por participar y nos vemos en el próximo torneo! ⚽`
        : `🎉 ¡Gracias por participar en la Polla 2026!\n\n` +
          `🏆 Top 3 del grupo:\n${top3}\n\n` +
          `Tu posición final: #${i + 1} con ${entry.total} pts\n\n` +
          `¡Nos vemos en el próximo torneo! ⚽`;

      try {
        await sendWhatsAppMessage(code.adminId, entry.phone, message);
        notified++;
      } catch (err) {
        console.error(`[WA] Failed to send tournament close to ${entry.phone}:`, err);
      }
    }
  }

  return notified;
}
