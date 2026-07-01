import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { notifyPhaseAdvance } from "@/lib/whatsapp/notifyPhaseAdvance";
import { getScoringConfig } from "@/lib/scoring/config";
import { isKnockoutStage } from "@/lib/scoring/engine";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { stage } = await req.json();
  if (!stage) {
    return NextResponse.json({ error: "stage requerido" }, { status: 400 });
  }

  const scoringConfig = await getScoringConfig();
  const bonusPoints = isKnockoutStage(stage)
    ? scoringConfig.bonusPhaseAdvanceKO
    : scoringConfig.bonusPhaseAdvance;

  // Find all teams currently in this stage that have fans
  const teams = await prisma.team.findMany({
    where: {
      currentStage: stage,
      favoriteMemberships: { some: {} },
    },
    select: { id: true, name: true, _count: { select: { favoriteMemberships: true } } },
  });

  if (teams.length === 0) {
    return NextResponse.json({ sent: 0, teams: 0, message: "No hay equipos en esa fase con fanáticos" });
  }

  let sent = 0;
  for (const team of teams) {
    try {
      await notifyPhaseAdvance(team.id, stage, bonusPoints);
      sent += team._count.favoriteMemberships;
    } catch (err) {
      console.error(`[WA] notify-phase error for team ${team.id}:`, err);
    }
  }

  return NextResponse.json({ sent, teams: teams.length });
}
