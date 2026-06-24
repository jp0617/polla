import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin;
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const matches = await prisma.match.findMany({
    include: {
      homeTeam: { select: { id: true, name: true, code: true, crest: true } },
      awayTeam: { select: { id: true, name: true, code: true, crest: true } },
    },
    orderBy: { kickoff: "asc" },
  });

  return NextResponse.json({ matches });
}

const createSchema = z.object({
  homeTeamId: z.string(),
  awayTeamId: z.string(),
  kickoff: z.string().datetime(),
  stage: z.string(),
  group: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin;
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", details: parsed.error.issues }, { status: 400 });

  const { homeTeamId, awayTeamId, kickoff, stage, group } = parsed.data;

  if (homeTeamId === awayTeamId) {
    return NextResponse.json({ error: "Los equipos deben ser distintos" }, { status: 400 });
  }

  const match = await prisma.match.create({
    data: {
      apiMatchId: -Date.now(), // negative ID to avoid collision with real API IDs
      homeTeamId,
      awayTeamId,
      kickoff: new Date(kickoff),
      stage,
      group: group ?? null,
      status: "SCHEDULED",
      manualScore: false,
    },
    include: {
      homeTeam: { select: { id: true, name: true, code: true, crest: true } },
      awayTeam: { select: { id: true, name: true, code: true, crest: true } },
    },
  });

  return NextResponse.json({ match }, { status: 201 });
}
