import { NextResponse } from "next/server";
import { getConnectionStatus, getQRDataUrl, getClient } from "@/lib/whatsapp";

export async function GET(): Promise<NextResponse> {
  // Inicializa el cliente si no está corriendo
  getClient().catch(() => null);

  return NextResponse.json({
    connected: getConnectionStatus(),
    qr: getQRDataUrl(),
  });
}
