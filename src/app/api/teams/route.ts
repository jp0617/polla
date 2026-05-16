import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  const currentUserId = session?.user?.id;

  // If an invitation code is provided, scope team availability to that code group
  const invitationCode = req.nextUrl.searchParams.get("invitationCode")?.toUpperCase() ?? null;

  let codeGroupUserIds: Set<string> | null = null;

  if (invitationCode) {
    const code = await prisma.invitationCode.findUnique({
      where: { code: invitationCode },
      include: { users: { select: { id: true } } },
    });
    if (code) {
      codeGroupUserIds = new Set(code.users.map((u: { id: string }) => u.id));
    }
  }

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      favoritedBy: {
        select: { id: true, name: true },
      },
    },
  });

  const result = teams.map(
    (team: {
      id: string;
      name: string;
      shortName: string;
      code: string;
      crest: string | null;
      group: string | null;
      currentStage: string;
      eliminated: boolean;
      favoritedBy: { id: string; name: string }[];
    }) => {
      // If scoping by code group, only consider owners within that group
      const owner = codeGroupUserIds
        ? (team.favoritedBy.find((u) => codeGroupUserIds!.has(u.id)) ?? null)
        : (team.favoritedBy[0] ?? null);

      const takenByOther = owner !== null && owner.id !== currentUserId;
      return {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        code: team.code,
        crest: team.crest,
        group: team.group,
        takenBy: takenByOther ? owner.name : null,
        isOwnTeam: owner?.id === currentUserId,
      };
    }
  );

  return NextResponse.json({ teams: result });
}
