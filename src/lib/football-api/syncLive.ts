import { prisma } from "@/lib/db/client";
import { getLiveMatches, mapApiStatus, mapApiStage } from "./client";

/**
 * Lightweight sync — only updates scores for IN_PLAY/PAUSED matches.
 * Does NOT score predictions, lock predictions, award bonuses, or send WhatsApp.
 * Designed to run every 1 minute during matches.
 */
export async function syncLiveScores(): Promise<{ updated: number }> {
  const liveMatches = await getLiveMatches();

  if (liveMatches.length === 0) return { updated: 0 };

  let updated = 0;

  for (const m of liveMatches) {
    if (!m.homeTeam?.id || !m.awayTeam?.id) continue;

    const status = mapApiStatus(m.status);
    const stage = mapApiStage(m.stage);
    const homeScore = m.score.fullTime.home ?? m.score.halfTime.home ?? null;
    const awayScore = m.score.fullTime.away ?? m.score.halfTime.away ?? null;

    const existing = await prisma.match.findUnique({
      where: { apiMatchId: m.id },
      select: { id: true, manualScore: true },
    });

    if (!existing) continue;
    if (existing.manualScore) continue;

    await prisma.match.update({
      where: { id: existing.id },
      data: {
        status,
        stage,
        homeScore: homeScore ?? undefined,
        awayScore: awayScore ?? undefined,
        minute: m.minute ?? null,
        ...(homeScore !== null ? { scoreUpdatedAt: new Date() } : {}),
      },
    });

    updated++;
  }

  return { updated };
}
