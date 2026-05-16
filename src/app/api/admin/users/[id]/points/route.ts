import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const schema = z.object({ manualPoints: z.number().int() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { manualPoints } = parsed.data;

  // totalPoints = prediction points + manualPoints (bonus is per-membership, computed at query time)
  const agg = await prisma.prediction.aggregate({
    where: { userId: id, points: { not: null } },
    _sum: { points: true },
  });
  const predictionPoints = agg._sum.points ?? 0;

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.user.update({
    where: { id },
    data: {
      manualPoints,
      totalPoints: predictionPoints,
    },
    select: { id: true, name: true, totalPoints: true, manualPoints: true },
  });

  const bonusAgg = await prisma.membership.aggregate({
    where: { userId: id },
    _sum: { bonusPoints: true },
  });
  const bonusPoints = bonusAgg._sum.bonusPoints ?? 0;

  return NextResponse.json({
    user: {
      ...updated,
      bonusPoints,
      totalPoints: updated.totalPoints + updated.manualPoints + bonusPoints,
    },
  });
}
