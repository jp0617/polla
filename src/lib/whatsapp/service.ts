import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import path from "path";
import QRCode from "qrcode";

const AUTH_FOLDER_BASE = path.join(process.cwd(), ".whatsapp-sessions");

interface SessionState {
  sock: WASocket | null;
  qrDataUrl: string | null;
  isConnected: boolean;
  initPromise: Promise<WASocket> | null;
}

const sessions = new Map<string, SessionState>();

function getSession(userId: string): SessionState {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      sock: null,
      qrDataUrl: null,
      isConnected: false,
      initPromise: null,
    });
  }
  return sessions.get(userId)!;
}

async function init(userId: string): Promise<WASocket> {
  const authFolder = path.join(AUTH_FOLDER_BASE, userId);
  const session = getSession(userId);
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  const client = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["Polla Mundialista", "Chrome", "1.0"],
  });

  client.ev.on("creds.update", saveCreds);

  client.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      session.qrDataUrl = await QRCode.toDataURL(qr);
      session.isConnected = false;
    }
    if (connection === "open") {
      session.isConnected = true;
      session.qrDataUrl = null;
      console.log(`[WA] Conectado: ${userId}`);
    }
    if (connection === "close") {
      session.isConnected = false;
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        session.sock = null;
        session.initPromise = null;
        getWhatsAppClient(userId);
      } else {
        console.warn(`[WA] Logout: ${userId}`);
        session.sock = null;
        session.initPromise = null;
      }
    }
  });

  session.sock = client;
  return client;
}

export function getWhatsAppClient(userId: string): Promise<WASocket> {
  const session = getSession(userId);
  if (session.sock && session.isConnected) return Promise.resolve(session.sock);
  if (!session.initPromise) session.initPromise = init(userId);
  return session.initPromise;
}

export function getQRDataUrl(userId: string): string | null {
  return getSession(userId).qrDataUrl;
}

export function getConnectionStatus(userId: string): boolean {
  return getSession(userId).isConnected;
}

export async function sendWhatsAppMessage(
  userId: string,
  to: string,
  body: string
): Promise<void> {
  const client = await getWhatsAppClient(userId);
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
  const exactMsg = data.exactScores > 0
    ? `✅ ${data.exactScores} marcador${data.exactScores !== 1 ? "es" : ""} exacto${data.exactScores !== 1 ? "s" : ""}.\n`
    : "";
  return (
    `¡Hola ${data.name}! ⚽ Resultados hasta la fecha:\n` +
    exactMsg +
    `⭐ Puntos hasta la fecha: *${data.pointsToday}*\n` +
    `🏆 Total acumulado: *${data.totalPoints} pts*\n` +
    `📊 Posición: *#${data.rank}*`
  );
}

export async function sendDailyResultsToAll(
  senderId: string,
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
      await sendWhatsAppMessage(senderId, result.phone, message);
      sent++;
    } catch (err) {
      console.error(`[WA] Failed to send to ${result.phone}:`, err);
      failed++;
    }
  }

  return { sent, failed };
}
