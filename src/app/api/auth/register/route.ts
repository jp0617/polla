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

    const { name, email, phone, password, favoriteTeamId } = parsed.data;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });

    if (existing) {
      return NextResponse.json(
        { error: "El email o teléfono ya está registrado" },
        { status: 409 }
      );
    }

    // Check that the chosen team is not already taken
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

    const user = await prisma.user.create({
      data: { name, email, phone, passwordHash, favoriteTeamId },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
