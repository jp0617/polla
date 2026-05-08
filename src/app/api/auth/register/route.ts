import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7),
  password: z.string().min(6),
  favoriteTeamId: z.string().optional(),
  invitationCode: z.string().min(1, "El código de invitación es requerido"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { name, email, phone, password, favoriteTeamId, invitationCode } = parsed.data;

    // Validate invitation code
    const code = await prisma.invitationCode.findUnique({
      where: { code: invitationCode.toUpperCase() },
    });

    if (!code) {
      return NextResponse.json(
        { error: "Código de invitación inválido" },
        { status: 400 }
      );
    }

    if (code.uses >= code.maxUses) {
      return NextResponse.json(
        { error: "Este código de invitación ya no tiene usos disponibles" },
        { status: 400 }
      );
    }

    if (code.expiresAt && code.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Este código de invitación ha expirado" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });

    if (existing) {
      return NextResponse.json(
        { error: "El email o teléfono ya está registrado" },
        { status: 409 }
      );
    }

    if (favoriteTeamId) {
      const teamTaken = await prisma.user.findFirst({
        where: { favoriteTeamId },
        select: { name: true },
      });
      if (teamTaken) {
        return NextResponse.json(
          { error: `Este equipo ya fue elegido por ${teamTaken.name}. Cada equipo solo puede tener un fanático.` },
          { status: 409 }
        );
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await prisma.$transaction([
      prisma.user.create({
        data: { name, email, phone, passwordHash, favoriteTeamId, invitationCodeId: code.id },
        select: { id: true, name: true, email: true },
      }),
      prisma.invitationCode.update({
        where: { id: code.id },
        data: { uses: { increment: 1 } },
      }),
    ]);

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
