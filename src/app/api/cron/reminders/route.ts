import { NextResponse } from "next/server";
import { sendMatchReminders } from "@/lib/whatsapp/sendReminders";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendMatchReminders();
    console.log("[CRON REMINDERS]", result);
    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), ...result });
  } catch (err) {
    console.error("[CRON REMINDERS] Failed:", err);
    return NextResponse.json({ error: "Failed", details: String(err) }, { status: 500 });
  }
}
