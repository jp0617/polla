import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { isPredictionLocked } from "@/lib/scoring/engine";

const predictionSchema = z.object({
  matchId: z.string(),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = predictionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { matchId, homeScore, awayScore } = parsed.data;

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    return NextResponse.json(
      { error: "Partido no encontrado" },
      { status: 404 }
    );
  }

  if (isPredictionLocked(match.kickoff)) {
    return NextResponse.json(
      { error: "El pronóstico está cerrado para este partido" },
      { status: 403 }
    );
  }

  if (match.status !== "SCHEDULED") {
    return NextResponse.json(
      { error: "Solo se pueden hacer pronósticos en partidos programados" },
      { status: 403 }
    );
  }

  const prediction = await prisma.prediction.upsert({
    where: { userId_matchId: { userId: session.user.id, matchId } },
    create: {
      userId: session.user.id,
      matchId,
      homeScore,
      awayScore,
    },
    update: { homeScore, awayScore },
  });

  return NextResponse.json({ prediction });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");

  const where: Record<string, string> = { userId: session.user.id };
  if (matchId) where.matchId = matchId;

  const predictions = await prisma.prediction.findMany({
    where,
    include: {
      match: {
        include: { homeTeam: true, awayTeam: true },
      },
    },
    orderBy: { match: { kickoff: "desc" } },
  });

  return NextResponse.json({ predictions });
}
