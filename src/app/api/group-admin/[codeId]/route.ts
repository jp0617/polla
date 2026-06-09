import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const settingsSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  allowDraws: z.boolean().optional(),
  exactScore: z.number().int().min(0).max(100).nullable().optional(),
  correctWinner: z.number().int().min(0).max(100).nullable().optional(),
  correctDraw: z.number().int().min(0).max(100).nullable().optional(),
  bonusPhaseAdvance: z.number().int().min(0).max(100).nullable().optional(),
  lockMinutes: z.number().int().min(0).max(1440).nullable().optional(),
});

async function getCodeAndVerifyAdmin(codeId: string, userId: string) {
  const code = await prisma.invitationCode.findUnique({
    where: { id: codeId },
    select: {
      id: true,
      label: true,
      allowDraws: true,
      exactScore: true,
      correctWinner: true,
      correctDraw: true,
      bonusPhaseAdvance: true,
      lockMinutes: true,
      adminId: true,
    },
  });
  if (!code) return null;
  if (code.adminId !== userId) return null;
  return code;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ codeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { codeId } = await params;
  const code = await getCodeAndVerifyAdmin(codeId, session.user.id);
  if (!code) {
    return NextResponse.json({ error: "No encontrado o sin permisos" }, { status: 403 });
  }

  return NextResponse.json(code);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ codeId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { codeId } = await params;
  const code = await getCodeAndVerifyAdmin(codeId, session.user.id);
  if (!code) {
    return NextResponse.json({ error: "No encontrado o sin permisos" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const updated = await prisma.invitationCode.update({
    where: { id: codeId },
    data: parsed.data,
    select: {
      id: true,
      label: true,
      allowDraws: true,
      exactScore: true,
      correctWinner: true,
      correctDraw: true,
      bonusPhaseAdvance: true,
      lockMinutes: true,
    },
  });

  return NextResponse.json(updated);
}
