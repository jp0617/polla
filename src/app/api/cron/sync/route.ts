import { NextResponse } from "next/server";
import { syncMatches } from "@/lib/football-api/sync";
import { prisma } from "@/lib/db/client";
import {
  getConnectionStatus,
  sendDailyResultsToAll,
} from "@/lib/whatsapp/service";
import { startOfDay, endOfDay } from "date-fns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncMatches();
    console.log("[CRON] Sync completed:", result);

    // Auto-send WhatsApp results when there were scored predictions
    let waSent = 0;
    let waFailed = 0;

    if (result.scored > 0) {
      const dayStart = startOfDay(new Date());
      const dayEnd = endOfDay(new Date());

      // Find all invitation codes that have an admin with an active WhatsApp session
      const codes = await prisma.invitationCode.findMany({
        where: { adminId: { not: null } },
        select: { id: true, adminId: true },
      });

      for (const code of codes) {
        if (!code.adminId) continue;
        if (!getConnectionStatus(code.adminId)) continue; // skip if not connected

        // Fetch members and their today's results for this group
        const memberships = await prisma.membership.findMany({
          where: { invitationCodeId: code.id },
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

        if (memberships.length === 0) continue;

        // Rank within group
        const ranked = memberships
          .map((m) => ({
            userId: m.user.id,
            total: m.user.totalPoints + m.user.manualPoints + m.bonusPoints,
          }))
          .sort((a, b) => b.total - a.total);
        const rankMap = new Map(ranked.map((r, i) => [r.userId, i + 1]));

        const results = memberships.map((m) => {
          const total = m.user.totalPoints + m.user.manualPoints + m.bonusPoints;
          return {
            phone: m.user.phone,
            name: m.user.name,
            exactScores: m.user.predictions.filter((p) => p.points === 5).length,
            pointsToday: m.user.predictions.reduce((s, p) => s + (p.points ?? 0), 0),
            totalPoints: total,
            rank: rankMap.get(m.user.id) ?? 0,
          };
        });

        const { sent, failed } = await sendDailyResultsToAll(code.adminId, results);
        waSent += sent;
        waFailed += failed;
      }

      if (waSent > 0 || waFailed > 0) {
        console.log(`[CRON] WhatsApp: ${waSent} enviados, ${waFailed} fallidos`);
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
      whatsapp: { sent: waSent, failed: waFailed },
    });
  } catch (err) {
    console.error("[CRON] Sync failed:", err);
    return NextResponse.json(
      { error: "Sync failed", details: String(err) },
      { status: 500 }
    );
  }
}
