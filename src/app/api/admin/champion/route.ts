import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";
import { sendWhatsAppMessage, getConnectionStatus } from "@/lib/whatsapp/service";

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

  // Award bonus to all memberships that picked this team as champion
  const winningMemberships = await prisma.membership.findMany({
    where: { championPickId: teamId },
    select: {
      id: true,
      user: { select: { name: true, phone: true } },
      invitationCode: { select: { adminId: true } },
    },
  });

  for (const m of winningMemberships) {
    await prisma.membership.update({
      where: { id: m.id },
      data: { bonusPoints: { increment: config.championBonus } },
    });
  }

  await prisma.scoringConfig.update({
    where: { id: "singleton" },
    data: { championTeamId: teamId, championBonusGiven: true },
  });

  // Send WA notification to each winner (fire-and-forget)
  Promise.all(
    winningMemberships.map(async (m) => {
      const adminId = m.invitationCode.adminId;
      if (!adminId || !getConnectionStatus(adminId) || !m.user.phone) return;
      const message =
        `🏆 ¡Felicidades ${m.user.name}! *${team.name}* es el CAMPEÓN del Mundial 2026.\n` +
        `🎁 Bonus campeón: *+${config.championBonus} pts*`;
      try {
        await sendWhatsAppMessage(adminId, m.user.phone, message);
      } catch (err) {
        console.error(`[WA] Failed to send champion bonus to ${m.user.phone}:`, err);
      }
    })
  ).catch((err) => console.error("[WA] champion notifications error:", err));

  return NextResponse.json({ ok: true, team: team.name, awarded: winningMemberships.length });
}
