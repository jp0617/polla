import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { scoreMatchPredictions } from "@/lib/scoring/scoreMatchPredictions";
import { notifyMatchResult } from "@/lib/whatsapp/notifyMatchResult";

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

  const codesNotified = await notifyMatchResult();

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
