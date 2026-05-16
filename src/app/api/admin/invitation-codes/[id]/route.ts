import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const patchSchema = z.object({
  adminId: z.string().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { adminId } = parsed.data;

  // Verify the user belongs to this invitation code via Membership
  if (adminId !== null) {
    const membership = await prisma.membership.findUnique({
      where: { userId_invitationCodeId: { userId: adminId, invitationCodeId: id } },
    });
    if (!membership) {
      return NextResponse.json(
        { error: "El usuario no pertenece a este código" },
        { status: 400 }
      );
    }
  }

  const code = await prisma.invitationCode.update({
    where: { id },
    data: { adminId },
    include: {
      admin: { select: { id: true, name: true, email: true } },
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  // Flatten to the shape the UI expects
  const result = {
    ...code,
    users: code.memberships.map((m) => ({ ...m.user })),
  };

  return NextResponse.json({ code: result });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const code = await prisma.invitationCode.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!code) {
    return NextResponse.json({ error: "Código no encontrado" }, { status: 404 });
  }

  // Delete memberships only; users keep their account and predictions
  // (Cascade on InvitationCode → Membership handles this)
  await prisma.invitationCode.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
