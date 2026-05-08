import { NextResponse } from "next/server";
import { getWhatsAppClient, getConnectionStatus, getQRDataUrl } from "@/lib/whatsapp/service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  // Dispara la inicialización si aún no arrancó
  getWhatsAppClient().catch(() => null);

  return NextResponse.json({
    connected: getConnectionStatus(),
    qr: getQRDataUrl(),
  });
}
