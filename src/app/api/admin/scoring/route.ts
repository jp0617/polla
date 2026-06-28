import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getScoringConfig } from "@/lib/scoring/config";
import type { Session } from "next-auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

function isAdmin(session: Session | null) {
  return (session?.user as { isAdmin?: boolean })?.isAdmin;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await getScoringConfig();
  return NextResponse.json({ config });
}

const schema = z.object({
  exactScore: z.number().int().min(0),
  correctWinner: z.number().int().min(0),
  correctDraw: z.number().int().min(0),
  bonusPhaseAdvance: z.number().int().min(0),
  exactScoreKO: z.number().int().min(0),
  correctWinnerKO: z.number().int().min(0),
  correctAdvancingKO: z.number().int().min(0),
  advancingPickBonusKO: z.number().int().min(0),
  bonusPhaseAdvanceKO: z.number().int().min(0),
  championBonus: z.number().int().min(0),
  lockMinutes: z.number().int().min(0),
});

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const config = await prisma.scoringConfig.upsert({
    where: { id: "singleton" },
    update: parsed.data,
    create: { id: "singleton", ...parsed.data },
  });

  return NextResponse.json({ config });
}
