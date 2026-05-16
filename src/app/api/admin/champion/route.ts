import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const schema = z.object({ teamId: z.string() });

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const config = await prisma.scoringConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  if (config.championBonusGiven) {
    return NextResponse.json(
      { error: "El bonus de campeón ya fue otorgado" },
      { status: 409 }
    );
  }

  const { teamId } = parsed.data;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
  }

  // Award bonus to all users who picked this team as champion
  const winners = await prisma.user.findMany({
    where: { championPickId: teamId },
    select: { id: true },
  });

  for (const user of winners) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        bonusPoints: { increment: config.championBonus },
        totalPoints: { increment: config.championBonus },
      },
    });
  }

  await prisma.scoringConfig.update({
    where: { id: "singleton" },
    data: { championTeamId: teamId, championBonusGiven: true },
  });

  return NextResponse.json({ ok: true, team: team.name, awarded: winners.length });
}
