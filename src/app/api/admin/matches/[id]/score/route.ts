import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { scoreMatchPredictions } from "@/lib/scoring/scoreMatchPredictions";
import { notifyMatchResult } from "@/lib/whatsapp/notifyMatchResult";

const schema = z.object({
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
  // force=true allows correcting an already-finished match
  force: z.boolean().default(false),
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

  const { homeScore, awayScore, force } = parsed.data;

  const existing = await prisma.match.findUnique({
    where: { id: matchId },
    select: { status: true },
  });

  if (existing?.status === "FINISHED" && !force) {
    return NextResponse.json(
      { error: "El partido ya está terminado. Usa force=true para corregir el marcador." },
      { status: 409 }
    );
  }

  // If correcting a finished match, reverse previously awarded points first
  if (existing?.status === "FINISHED" && force) {
    const scoredPredictions = await prisma.prediction.findMany({
      where: { matchId, status: "SCORED" },
      select: { id: true, userId: true, points: true },
    });

    for (const pred of scoredPredictions) {
      if (pred.points && pred.points > 0) {
        await prisma.user.update({
          where: { id: pred.userId },
          data: { totalPoints: { decrement: pred.points } },
        });
      }
      // Reset to LOCKED so scoreMatchPredictions picks it up again
      await prisma.prediction.update({
        where: { id: pred.id },
        data: { points: null, status: "LOCKED" },
      });
    }
  }

  // Save score and mark as manual
  const match = await prisma.match.update({
    where: { id: matchId },
    data: { homeScore, awayScore, status: "FINISHED", manualScore: true, scoreUpdatedAt: new Date() },
    include: {
      homeTeam: { select: { name: true, code: true } },
      awayTeam: { select: { name: true, code: true } },
    },
  });

  // Score all predictions with the new/corrected result
  const scored = await scoreMatchPredictions(matchId, homeScore, awayScore);

  // Don't send WhatsApp when correcting an already-finished match
  const codesNotified = force ? 0 : await notifyMatchResult();

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
    whatsapp: { codesNotified },
  });
}
