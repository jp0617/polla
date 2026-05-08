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

  // Recalcula totalPoints sumando puntos de predicciones + bonusPoints + manualPoints
  const agg = await prisma.prediction.aggregate({
    where: { userId: id, points: { not: null } },
    _sum: { points: true },
  });
  const predictionPoints = agg._sum.points ?? 0;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { bonusPoints: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.user.update({
    where: { id },
    data: {
      manualPoints,
      totalPoints: predictionPoints + user.bonusPoints + manualPoints,
    },
    select: { id: true, name: true, totalPoints: true, manualPoints: true, bonusPoints: true },
  });

  return NextResponse.json({ user: updated });
}
