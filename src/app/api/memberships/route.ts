import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const joinSchema = z.object({
  invitationCode: z.string().min(1),
  favoriteTeamId: z.string().optional(),
  championPickId: z.string().optional(),
});

// Join a new group with an invitation code
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { invitationCode, favoriteTeamId, championPickId } = parsed.data;

  const code = await prisma.invitationCode.findUnique({
    where: { code: invitationCode.toUpperCase() },
  });

  if (!code) {
    return NextResponse.json({ error: "Código de invitación inválido" }, { status: 400 });
  }

  if (code.uses >= code.maxUses) {
    return NextResponse.json(
      { error: "Este código ya no tiene usos disponibles" },
      { status: 400 }
    );
  }

  if (code.expiresAt && code.expiresAt < new Date()) {
    return NextResponse.json({ error: "Este código ha expirado" }, { status: 400 });
  }

  const existingMembership = await prisma.membership.findUnique({
    where: { userId_invitationCodeId: { userId: session.user.id, invitationCodeId: code.id } },
  });

  if (existingMembership) {
    return NextResponse.json({ error: "Ya perteneces a este grupo" }, { status: 409 });
  }

  const [membership] = await prisma.$transaction([
    prisma.membership.create({
      data: {
        userId: session.user.id,
        invitationCodeId: code.id,
        favoriteTeamId: favoriteTeamId || null,
        championPickId: championPickId || null,
      },
      include: {
        invitationCode: { select: { code: true, label: true } },
        favoriteTeam: { select: { id: true, name: true, code: true, crest: true } },
        championPick: { select: { id: true, name: true, code: true, crest: true } },
      },
    }),
    prisma.invitationCode.update({
      where: { id: code.id },
      data: { uses: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({ membership }, { status: 201 });
}
