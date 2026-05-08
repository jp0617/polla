import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const session = await auth();
  const currentUserId = session?.user?.id;

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      favoritedBy: {
        select: { id: true, name: true },
      },
    },
  });

  // Mark each team as taken (by someone other than the current user)
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
      const owner = team.favoritedBy[0] ?? null;
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
