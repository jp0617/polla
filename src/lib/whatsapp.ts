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
        // Reconectar automáticamente
        sock = null;
        initPromise = null;
        getClient();
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

export function getClient(): Promise<WASocket> {
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

function toJid(phone: string): string {
  // Acepta +56912345678, 56912345678, etc.
  return phone.replace(/\D/g, "") + "@s.whatsapp.net";
}

export async function sendText(to: string, text: string): Promise<void> {
  const client = await getClient();
  await client.sendMessage(toJid(to), { text });
}

// Notificaciones específicas de la polla
export async function notifyPredictionLocked(to: string, matchLabel: string): Promise<void> {
  await sendText(to, `🔒 Tu pronóstico para *${matchLabel}* está cerrado. ¡Buena suerte!`);
}

export async function notifyResult(
  to: string,
  matchLabel: string,
  score: string,
  points: number
): Promise<void> {
  await sendText(
    to,
    `⚽ Resultado: *${matchLabel}* terminó ${score}.\nGanaste *${points} punto${points !== 1 ? "s" : ""}* en este partido.`
  );
}

export async function notifyRanking(to: string, position: number, totalPoints: number): Promise<void> {
  await sendText(
    to,
    `🏆 Clasificación actualizada: estás en el puesto *#${position}* con *${totalPoints} puntos* en total.`
  );
}
