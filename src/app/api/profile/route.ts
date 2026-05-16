import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const updateSchema = z.object({
  favoriteTeamId: z.string().optional(),
  championPickId: z.string().nullable().optional(),
  name: z.string().min(2).optional(),
  phone: z.string().min(7).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      totalPoints: true,
      bonusPoints: true,
      favoriteTeam: true,
      championPick: { select: { id: true, name: true, crest: true, code: true } },
      predictions: {
        where: { status: "SCORED" },
        select: { points: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const codeAdmin = await prisma.invitationCode.findFirst({
    where: { adminId: session.user.id },
    select: { id: true, label: true },
  });

  const exactScores = user.predictions.filter((p: { points: number | null }) => p.points === 5).length;
  const correctWinners = user.predictions.filter((p: { points: number | null }) => p.points === 3).length;

  return NextResponse.json({
    ...user,
    predictions: undefined,
    stats: { exactScores, correctWinners },
    adminOfCode: codeAdmin ?? null,
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // If changing favorite team, verify it's not taken by another user
  if (parsed.data.favoriteTeamId) {
    const teamTaken = await prisma.user.findFirst({
      where: {
        favoriteTeamId: parsed.data.favoriteTeamId,
        NOT: { id: session.user.id },
      },
      select: { name: true },
    });
    if (teamTaken) {
      return NextResponse.json(
        { error: `Este equipo ya fue elegido por ${teamTaken.name}. Cada equipo solo puede tener un fanático.` },
        { status: 409 }
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: { id: true, name: true, email: true, phone: true, favoriteTeamId: true, championPickId: true },
  });

  return NextResponse.json({ user });
}
