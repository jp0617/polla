import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

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

  for (const user of users) {
    const predPoints = user.predictions.reduce((s, p) => s + (p.points ?? 0), 0);
    await prisma.user.update({
      where: { id: user.id },
      data: { totalPoints: predPoints },
    });
  }

  return NextResponse.json({ ok: true, updated: users.length });
}
