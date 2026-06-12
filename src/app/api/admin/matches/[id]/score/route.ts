import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { scoreMatchPredictions } from "@/lib/scoring/scoreMatchPredictions";
import { sendDailyResultsToAll, getConnectionStatus } from "@/lib/whatsapp/service";
import { startOfDay, endOfDay } from "date-fns";

const schema = z.object({
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin;
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: matchId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const existing = await prisma.match.findUnique({
    where: { id: matchId },
    select: { status: true },
  });
  if (existing?.status === "FINISHED") {
    return NextResponse.json(
      { error: "El partido ya está terminado y no se puede modificar." },
      { status: 409 }
    );
  }

  const { homeScore, awayScore } = parsed.data;

  // Save score and mark as manual
  const match = await prisma.match.update({
    where: { id: matchId },
    data: { homeScore, awayScore, status: "FINISHED", manualScore: true },
    include: {
      homeTeam: { select: { name: true, code: true } },
      awayTeam: { select: { name: true, code: true } },
    },
  });

  // Score all predictions for this match
  const scored = await scoreMatchPredictions(matchId, homeScore, awayScore);

  // Send WhatsApp via each code admin that has an active session
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
          // bonusPoints is on membership
        },
      },
    },
  });

  let waSent = 0;
  let waFailed = 0;
  let codesNotified = 0;

  for (const code of codesWithAdmin) {
    if (!code.adminId) continue;
    if (!getConnectionStatus(code.adminId)) continue;

    const ranked = code.memberships
      .map((m) => ({
        userId: m.user.id,
        total: m.user.totalPoints + m.user.manualPoints + m.bonusPoints,
      }))
      .sort((a, b) => b.total - a.total);
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

    const { sent, failed } = await sendDailyResultsToAll(code.adminId, results);
    waSent += sent;
    waFailed += failed;
    codesNotified++;
  }

  return NextResponse.json({
    ok: true,
    match: {
      id: match.id,
      homeTeam: match.homeTeam.code,
      awayTeam: match.awayTeam.code,
      homeScore,
      awayScore,
    },
    scored,
    whatsapp: { codesNotified, sent: waSent, failed: waFailed },
  });
}
