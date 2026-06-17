import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

// Returns group members + optionally a user's predictions (only for locked/finished matches)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get("userId");

  // Get current user's group
  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { joinedAt: "asc" },
    select: { invitationCodeId: true },
  });

  if (!membership) {
    return NextResponse.json({ members: [], predictions: [] });
  }

  // Get all group members
  const members = await prisma.membership.findMany({
    where: { invitationCodeId: membership.invitationCodeId },
    select: {
      user: { select: { id: true, name: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  if (!targetUserId) {
    return NextResponse.json({ members: members.map((m) => m.user) });
  }

  // Verify target is in the same group
  const inGroup = members.some((m) => m.user.id === targetUserId);
  if (!inGroup) {
    return NextResponse.json({ error: "Usuario no pertenece al grupo" }, { status: 403 });
  }

  const predictions = await prisma.prediction.findMany({
    where: {
      userId: targetUserId,
      match: { status: { in: ["FINISHED", "IN_PLAY", "PAUSED"] } },
    },
    include: {
      match: {
        include: {
          homeTeam: { select: { name: true, shortName: true, crest: true, code: true } },
          awayTeam: { select: { name: true, shortName: true, crest: true, code: true } },
        },
      },
    },
    orderBy: { match: { kickoff: "desc" } },
  });

  return NextResponse.json({
    members: members.map((m) => m.user),
    predictions,
  });
}
