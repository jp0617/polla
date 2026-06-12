import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(7).optional(),
  // per-membership fields require membershipId
  membershipId: z.string().optional(),
  favoriteTeamId: z.string().nullable().optional(),
  championPickId: z.string().nullable().optional(),
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
      manualPoints: true,
      memberships: {
        include: {
          invitationCode: { select: { id: true, code: true, label: true } },
          favoriteTeam: { select: { id: true, name: true, crest: true, code: true } },
          championPick: { select: { id: true, name: true, crest: true, code: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
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
  const totalBonusPoints = user.memberships.reduce((sum, m) => sum + m.bonusPoints, 0);

  const tournamentStarted = await prisma.match.count({
    where: { status: "FINISHED" },
  }).then((n) => n > 0);

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    totalPoints: user.totalPoints + user.manualPoints + totalBonusPoints,
    predictionPoints: user.totalPoints,
    manualPoints: user.manualPoints,
    bonusPoints: totalBonusPoints,
    memberships: user.memberships,
    stats: { exactScores, correctWinners },
    adminOfCode: codeAdmin ?? null,
    tournamentStarted,
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

  const { name, phone, membershipId, favoriteTeamId, championPickId } = parsed.data;

  // Update global user fields
  if (name || phone) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { ...(name && { name }), ...(phone && { phone }) },
    });
  }

  // Update membership-specific fields
  if (membershipId) {
    if (favoriteTeamId !== undefined || championPickId !== undefined) {
      const firstMatchPlayed = await prisma.match.count({
        where: { status: "FINISHED" },
      }).then((n) => n > 0);
      if (firstMatchPlayed) {
        return NextResponse.json(
          { error: "Ya se jugó el primer partido. No puedes cambiar tu equipo favorito ni pronóstico de campeón." },
          { status: 403 }
        );
      }
    }

    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, userId: session.user.id },
    });

    if (!membership) {
      return NextResponse.json({ error: "Membresía no encontrada" }, { status: 404 });
    }

    await prisma.membership.update({
      where: { id: membershipId },
      data: {
        ...(favoriteTeamId !== undefined && { favoriteTeamId: favoriteTeamId || null }),
        ...(championPickId !== undefined && { championPickId: championPickId || null }),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
