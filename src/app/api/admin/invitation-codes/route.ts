import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  label: z.string().optional(),
  maxUses: z.number().int().min(1).default(1),
  expiresAt: z.string().datetime().optional(),
});

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const codes = await prisma.invitationCode.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      admin: { select: { id: true, name: true, email: true } },
      users: { select: { id: true, name: true, email: true, createdAt: true } },
    },
  });

  return NextResponse.json({ codes });
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { label, maxUses, expiresAt } = parsed.data;

  // Ensure unique code (retry on collision)
  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
    if (attempts > 10) {
      return NextResponse.json({ error: "No se pudo generar código único" }, { status: 500 });
    }
  } while (await prisma.invitationCode.findUnique({ where: { code } }));

  const invitationCode = await prisma.invitationCode.create({
    data: {
      code,
      label: label || null,
      maxUses,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return NextResponse.json({ invitationCode }, { status: 201 });
}
