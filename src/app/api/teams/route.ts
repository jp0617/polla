import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  const currentUserId = session?.user?.id;

  const invitationCode = req.nextUrl.searchParams.get("invitationCode")?.toUpperCase() ?? null;

  let codeId: string | null = null;

  if (invitationCode) {
    const code = await prisma.invitationCode.findUnique({
      where: { code: invitationCode },
      select: { id: true },
    });
    codeId = code?.id ?? null;
  } else if (currentUserId) {
    // Scope to the user's first group by default
    const membership = await prisma.membership.findFirst({
      where: { userId: currentUserId },
      orderBy: { joinedAt: "asc" },
      select: { invitationCodeId: true },
    });
    codeId = membership?.invitationCodeId ?? null;
  }

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      memberFavorites: codeId
        ? {
            where: { invitationCodeId: codeId },
            select: { userId: true, user: { select: { name: true } } },
          }
        : { select: { userId: true, user: { select: { name: true } } } },
    },
  });

  const result = teams.map((team) => {
    const owner = team.memberFavorites[0] ?? null;
    const takenByOther = owner !== null && owner.userId !== currentUserId;
    return {
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      code: team.code,
      crest: team.crest,
      group: team.group,
      takenBy: takenByOther ? owner.user.name : null,
      isOwnTeam: owner?.userId === currentUserId,
    };
  });

  return NextResponse.json({ teams: result });
}
