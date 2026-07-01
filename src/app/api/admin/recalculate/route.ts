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
      predictions: { where: { status: "SCORED" }, select: { points: true } },
    },
  });

  let updated = 0;
  for (const user of users) {
    // User.totalPoints in DB stores prediction points only.
    // manualPoints and membership.bonusPoints are added on top by the API.
    const predPoints = user.predictions.reduce((s, p) => s + (p.points ?? 0), 0);

    await prisma.user.update({
      where: { id: user.id },
      data: { totalPoints: predPoints },
    });
    updated++;
  }

  return NextResponse.json({ ok: true, updated });
}
