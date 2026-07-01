import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

/**
 * Recalculates totalPoints for all users from scratch based on
 * scored predictions + manualPoints. Fixes any drift caused by
 * past bugs or corrections.
 */
export async function POST() {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      manualPoints: true,
      memberships: { select: { bonusPoints: true } },
      predictions: { where: { status: "SCORED" }, select: { points: true } },
    },
  });

  let updated = 0;
  for (const user of users) {
    const predPoints = user.predictions.reduce((s, p) => s + (p.points ?? 0), 0);
    const bonusPoints = user.memberships.reduce((s, m) => s + m.bonusPoints, 0);
    const correct = predPoints + user.manualPoints + bonusPoints;

    await prisma.user.update({
      where: { id: user.id },
      data: { totalPoints: correct },
    });
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
