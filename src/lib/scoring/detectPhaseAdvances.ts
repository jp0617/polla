import { prisma } from "@/lib/db/client";
import { stageOrder } from "@/lib/football-api/client";
import { isKnockoutStage } from "./engine";
import { getScoringConfig } from "./config";
import { notifyPhaseAdvance } from "@/lib/whatsapp/notifyPhaseAdvance";

/**
 * Awards phase-advance bonus points for both teams playing in a match.
 * Uses bonusPhaseAdvance for qualifying into knockout rounds from groups,
 * and bonusPhaseAdvanceKO for advancing within knockout rounds.
 * Sends a WhatsApp notification to each fan whose team just advanced.
 * Idempotent — the unique constraint on PhaseAdvance prevents double-counting.
 */
export async function detectPhaseAdvancesForMatch(
  homeTeam: { id: string; currentStage: string },
  awayTeam: { id: string; currentStage: string },
  currentStage: string
): Promise<number> {
  const scoringConfig = await getScoringConfig();
  let bonusCount = 0;

  for (const team of [homeTeam, awayTeam]) {
    if (stageOrder[currentStage] > stageOrder[team.currentStage]) {
      const bonusPoints = isKnockoutStage(team.currentStage)
        ? scoringConfig.bonusPhaseAdvanceKO
        : scoringConfig.bonusPhaseAdvance;

      let created = false;
      try {
        await prisma.phaseAdvance.create({
          data: {
            teamId: team.id,
            fromStage: team.currentStage,
            toStage: currentStage,
            bonusGiven: true,
          },
        });
        created = true;
      } catch {
        // Unique constraint violation — already recorded, skip
      }

      if (created) {
        const favMemberships = await prisma.membership.findMany({
          where: { favoriteTeamId: team.id },
          select: { id: true },
        });

        for (const m of favMemberships) {
          await prisma.membership.update({
            where: { id: m.id },
            data: { bonusPoints: { increment: bonusPoints } },
          });
          bonusCount++;
        }

        await prisma.team.update({
          where: { id: team.id },
          data: { currentStage },
        });

        // Notify fans via WhatsApp (fire-and-forget)
        notifyPhaseAdvance(team.id, currentStage, bonusPoints).catch((err) =>
          console.error("[WA] notifyPhaseAdvance error:", err)
        );
      }
    }
  }

  return bonusCount;
}
