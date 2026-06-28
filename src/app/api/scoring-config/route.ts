import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getScoringConfig } from "@/lib/scoring/config";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getScoringConfig();
  return NextResponse.json({ config });
}
