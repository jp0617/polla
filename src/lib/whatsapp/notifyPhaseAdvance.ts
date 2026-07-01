import { prisma } from "@/lib/db/client";
import { sendWhatsAppMessage, getConnectionStatus } from "./service";

const STAGE_NAMES: Record<string, string> = {
  LAST_32: "Dieciseisavos de Final",
  LAST_16: "Octavos de Final",
  ROUND_OF_16: "Octavos de Final",
  QUARTER_FINALS: "Cuartos de Final",
  SEMI_FINALS: "Semifinales",
  THIRD_PLACE: "3er Puesto",
  FINAL: "Final",
};

/**
 * Sends a WhatsApp bonus notification to all fans of a team that just advanced.
 * Each fan gets a message via their group admin's WA session.
 */
export async function notifyPhaseAdvance(
  teamId: string,
  toStage: string,
  bonusPoints: number
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { name: true, shortName: true },
  });
  if (!team) return;

  const stageName = STAGE_NAMES[toStage] ?? toStage;

  // Find all memberships with this team as favorite, along with their group admin
  const memberships = await prisma.membership.findMany({
    where: { favoriteTeamId: teamId },
    select: {
      user: { select: { name: true, phone: true } },
      invitationCode: { select: { adminId: true } },
    },
  });

  for (const m of memberships) {
    const adminId = m.invitationCode.adminId;
    if (!adminId) continue;
    if (!getConnectionStatus(adminId)) continue;
    if (!m.user.phone) continue;

    const message =
      `🎉 ¡Felicidades ${m.user.name}! *${team.name}* ha clasificado a ${stageName}.\n` +
      `🎁 Bonus equipo favorito: *+${bonusPoints} pts*`;

    try {
      await sendWhatsAppMessage(adminId, m.user.phone, message);
    } catch (err) {
      console.error(`[WA] Failed to send phase advance to ${m.user.phone}:`, err);
    }
  }
}
