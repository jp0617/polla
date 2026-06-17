import { NextResponse } from "next/server";
import { syncLiveScores } from "@/lib/football-api/syncLive";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncLiveScores();
    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), ...result });
  } catch (err) {
    console.error("[CRON LIVE] Failed:", err);
    return NextResponse.json({ error: "Sync failed", details: String(err) }, { status: 500 });
  }
}
