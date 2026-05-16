import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { getWhatsAppClient, getConnectionStatus, getQRDataUrl } from "@/lib/whatsapp/service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = (session.user as { isAdmin?: boolean }).isAdmin;

  if (!isAdmin) {
    const codeAdmin = await prisma.invitationCode.findFirst({
      where: { adminId: userId },
      select: { id: true },
    });
    if (!codeAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Trigger session init for this user
  getWhatsAppClient(userId).catch(() => null);

  return NextResponse.json({
    connected: getConnectionStatus(userId),
    qr: getQRDataUrl(userId),
  });
}
