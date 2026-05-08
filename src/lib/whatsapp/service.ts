import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import QRCode from "qrcode";

const AUTH_FOLDER = path.join(process.cwd(), ".whatsapp-session");

let sock: WASocket | null = null;
let qrDataUrl: string | null = null;
let isConnected = false;
let initPromise: Promise<WASocket> | null = null;

async function init(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  const client = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ["Polla Mundialista", "Chrome", "1.0"],
  });

  client.ev.on("creds.update", saveCreds);

  client.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrDataUrl = await QRCode.toDataURL(qr);
      isConnected = false;
    }
    if (connection === "open") {
      isConnected = true;
      qrDataUrl = null;
      console.log("WhatsApp conectado");
    }
    if (connection === "close") {
      isConnected = false;
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        sock = null;
        initPromise = null;
        getWhatsAppClient();
      } else {
        console.warn("WhatsApp desconectado (logout). Escanea el QR nuevamente.");
        sock = null;
        initPromise = null;
      }
    }
  });

  sock = client;
  return client;
}

export function getWhatsAppClient(): Promise<WASocket> {
  if (sock && isConnected) return Promise.resolve(sock);
  if (!initPromise) initPromise = init();
  return initPromise;
}

export function getQRDataUrl(): string | null {
  return qrDataUrl;
}

export function getConnectionStatus(): boolean {
  return isConnected;
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const client = await getWhatsAppClient();
  const jid = to.replace(/\D/g, "") + "@s.whatsapp.net";
  await client.sendMessage(jid, { text: body });
}

export function buildDailyResultMessage(data: {
  name: string;
  exactScores: number;
  pointsToday: number;
  totalPoints: number;
  rank: number;
}): string {
  return (
    `¡Hola ${data.name}! 🏆 Resultados procesados:\n` +
    `✅ Acertaste ${data.exactScores} marcador${data.exactScores !== 1 ? "es" : ""} exacto${data.exactScores !== 1 ? "s" : ""}.\n` +
    `⭐ Sumaste ${data.pointsToday} punto${data.pointsToday !== 1 ? "s" : ""} hoy.\n` +
    `📊 Posición actual en la tabla: #${data.rank}.`
  );
}

export async function sendDailyResultsToAll(
  results: Array<{
    phone: string;
    name: string;
    exactScores: number;
    pointsToday: number;
    totalPoints: number;
    rank: number;
  }>
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const result of results) {
    try {
      const message = buildDailyResultMessage(result);
      await sendWhatsAppMessage(result.phone, message);
      sent++;
    } catch (err) {
      console.error(`Failed to send WhatsApp to ${result.phone}:`, err);
      failed++;
    }
  }

  return { sent, failed };
}
