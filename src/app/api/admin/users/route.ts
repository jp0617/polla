import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      totalPoints: true,
      manualPoints: true,
      isAdmin: true,
      _count: { select: { predictions: true } },
      memberships: { select: { bonusPoints: true } },
    },
    orderBy: { totalPoints: "desc" },
  });

  const result = users.map((u) => {
    const bonusPoints = u.memberships.reduce((s, m) => s + m.bonusPoints, 0);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      totalPoints: u.totalPoints + u.manualPoints + bonusPoints,
      bonusPoints,
      manualPoints: u.manualPoints,
      isAdmin: u.isAdmin,
      _count: u._count,
    };
  });

  return NextResponse.json({ users: result });
}
