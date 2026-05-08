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
      bonusPoints: true,
      manualPoints: true,
      isAdmin: true,
      _count: { select: { predictions: true } },
    },
    orderBy: { totalPoints: "desc" },
  });

  return NextResponse.json({ users });
}
