import { prisma } from "@/lib/db/client";
import { sendWhatsAppMessage, getConnectionStatus } from "@/lib/whatsapp/service";
import { notifyTournamentClose } from "@/lib/whatsapp/notifyTournamentClose";

export type DeclareChampionResult =
  | { ok: true; team: string; awarded: number }
  | { ok: false; reason: "already_given" | "team_not_found" };

/**
 * Awards the champion bonus to every membership that predicted this team as
 * champion, and notifies them via WhatsApp. Idempotent via championBonusGiven.
 */
export async function declareChampion(teamId: string): Promise<DeclareChampionResult> {
  const config = await prisma.scoringConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  if (config.championBonusGiven) {
    return { ok: false, reason: "already_given" };
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) {
    return { ok: false, reason: "team_not_found" };
  }

  const winningMemberships = await prisma.membership.findMany({
    where: { championPickId: teamId },
    select: {
      id: true,
      user: { select: { name: true, phone: true } },
      invitationCode: { select: { adminId: true } },
    },
  });

  for (const m of winningMemberships) {
    await prisma.membership.update({
      where: { id: m.id },
      data: { bonusPoints: { increment: config.championBonus } },
    });
  }

  await prisma.scoringConfig.update({
    where: { id: "singleton" },
    data: { championTeamId: teamId, championBonusGiven: true },
  });

  // Send WA notification to each winner, then a closing message (thank
  // you + group top 3) to every participant (fire-and-forget).
  Promise.all(
    winningMemberships.map(async (m) => {
      const adminId = m.invitationCode.adminId;
      if (!adminId || !getConnectionStatus(adminId) || !m.user.phone) return;
      const message =
        `🏆 ¡Felicidades ${m.user.name}! *${team.name}* es el CAMPEÓN del Mundial 2026.\n` +
        `🎁 Bonus campeón: *+${config.championBonus} pts*`;
      try {
        await sendWhatsAppMessage(adminId, m.user.phone, message);
      } catch (err) {
        console.error(`[WA] Failed to send champion bonus to ${m.user.phone}:`, err);
      }
    })
  )
    .then(() => notifyTournamentClose())
    .catch((err) => console.error("[WA] champion/close notifications error:", err));

  return { ok: true, team: team.name, awarded: winningMemberships.length };
}
