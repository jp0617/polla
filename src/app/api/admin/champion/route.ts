import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { declareChampion } from "@/lib/scoring/declareChampion";

const schema = z.object({ teamId: z.string() });

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const result = await declareChampion(parsed.data.teamId);

  if (!result.ok) {
    if (result.reason === "already_given") {
      return NextResponse.json(
        { error: "El bonus de campeón ya fue otorgado" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Equipo no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, team: result.team, awarded: result.awarded });
}
