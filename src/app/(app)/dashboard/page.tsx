import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [user, todayMatches, totalPlayers, liveMatches] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        totalPoints: true,
        manualPoints: true,
        memberships: {
          select: {
            bonusPoints: true,
            favoriteTeam: { select: { name: true, crest: true } },
          },
          orderBy: { joinedAt: "asc" },
          take: 1,
        },
      },
    }),
    prisma.match.findMany({
      where: { kickoff: { gte: todayStart, lt: todayEnd } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoff: "asc" },
    }),
    prisma.user.count(),
    prisma.match.findMany({
      where: { status: { in: ["IN_PLAY", "PAUSED"] } },
      include: { homeTeam: true, awayTeam: true },
      take: 5,
    }),
  ]);

  const primaryMembership = user?.memberships[0] ?? null;
  const bonusPoints = user?.memberships.reduce((s, m) => s + m.bonusPoints, 0) ?? 0;
  const displayPoints = (user?.totalPoints ?? 0) + (user?.manualPoints ?? 0) + bonusPoints;

  // Rank within primary group, or global if no group
  let userRank = 1;
  if (primaryMembership) {
    // Count members in primary group with higher total
    const firstMembership = await prisma.membership.findFirst({
      where: { userId: session.user.id },
      orderBy: { joinedAt: "asc" },
      select: { invitationCodeId: true },
    });
    if (firstMembership) {
      const membersAbove = await prisma.membership.count({
        where: {
          invitationCodeId: firstMembership.invitationCodeId,
          user: { totalPoints: { gt: user?.totalPoints ?? 0 } },
        },
      });
      userRank = membersAbove + 1;
    }
  }

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="bg-gradient-to-r from-green-800 to-emerald-700 rounded-2xl p-6 border border-green-600">
        <h1 className="text-2xl font-bold text-white mb-1">
          ¡Hola, {user?.name?.split(" ")[0]}! 👋
        </h1>
        <p className="text-green-200">Mundial 2026 — Polla de pronósticos</p>

        <div className="grid grid-cols-3 gap-4 mt-5">
          <StatCard label="Puntos" value={displayPoints} emoji="⭐" />
          <StatCard label="Posición" value={`#${userRank}`} emoji="🏆" />
          <StatCard label="Jugadores" value={totalPlayers} emoji="👥" />
        </div>
      </div>

      {/* Primary favorite team */}
      {primaryMembership?.favoriteTeam && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex items-center gap-3">
          {primaryMembership.favoriteTeam.crest && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={primaryMembership.favoriteTeam.crest} alt="" className="w-10 h-10 object-contain" />
          )}
          <div>
            <p className="text-sm text-slate-400">Tu equipo favorito</p>
            <p className="font-semibold text-white">{primaryMembership.favoriteTeam.name}</p>
          </div>
          {bonusPoints > 0 && (
            <div className="ml-auto bg-green-900 text-green-300 text-sm px-3 py-1 rounded-full">
              +{bonusPoints} bonus
            </div>
          )}
        </div>
      )}

      {/* Live matches */}
      {liveMatches.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            En juego ahora
          </h2>
          <div className="space-y-2">
            {liveMatches.map((m: typeof liveMatches[number]) => (
              <MatchCard key={m.id} match={m} isLive />
            ))}
          </div>
        </section>
      )}

      {/* Today's matches */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">
            Partidos de hoy —{" "}
            <span className="text-slate-400 font-normal text-sm">
              {format(now, "EEEE d 'de' MMMM", { locale: es })}
            </span>
          </h2>
          <Link href="/matches" className="text-sm text-green-400 hover:text-green-300">
            Ver todos →
          </Link>
        </div>

        {todayMatches.length === 0 ? (
          <p className="text-slate-400 text-sm">No hay partidos hoy.</p>
        ) : (
          <div className="space-y-2">
            {todayMatches.map((m: typeof todayMatches[number]) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        )}
      </section>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/matches" className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl p-4 text-center transition-colors">
          <div className="text-2xl mb-1">📋</div>
          <div className="font-medium text-white">Hacer pronósticos</div>
          <div className="text-xs text-slate-400 mt-0.5">Predice los marcadores</div>
        </Link>
        <Link href="/standings" className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl p-4 text-center transition-colors">
          <div className="text-2xl mb-1">🏅</div>
          <div className="font-medium text-white">Clasificación</div>
          <div className="text-xs text-slate-400 mt-0.5">Ver tabla de posiciones</div>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, emoji }: { label: string; value: number | string; emoji: string }) {
  return (
    <div className="bg-green-900/50 rounded-xl p-3 text-center">
      <div className="text-xl mb-0.5">{emoji}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-green-300">{label}</div>
    </div>
  );
}

interface MatchCardProps {
  match: {
    id: string;
    kickoff: Date;
    status: string;
    stage: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: { name: string; shortName: string; crest: string | null };
    awayTeam: { name: string; shortName: string; crest: string | null };
  };
  isLive?: boolean;
}

function MatchCard({ match, isLive }: MatchCardProps) {
  const kickoffTime = format(new Date(match.kickoff), "HH:mm");
  return (
    <div className={`bg-slate-800 rounded-xl p-4 border ${isLive ? "border-red-700" : "border-slate-700"} flex items-center gap-3`}>
      <TeamDisplay team={match.homeTeam} />
      <div className="flex-1 text-center">
        {match.status === "FINISHED" || isLive ? (
          <div className="text-xl font-bold text-white">{match.homeScore ?? 0} — {match.awayScore ?? 0}</div>
        ) : (
          <div className="text-sm text-slate-400">{kickoffTime}</div>
        )}
        <div className={`text-xs mt-0.5 ${isLive ? "text-red-400" : "text-slate-500"}`}>
          {isLive ? "● En juego" : match.status === "FINISHED" ? "FT" : match.stage.replace(/_/g, " ")}
        </div>
      </div>
      <TeamDisplay team={match.awayTeam} align="right" />
    </div>
  );
}

function TeamDisplay({ team, align = "left" }: { team: { name: string; shortName: string; crest: string | null }; align?: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-2 w-24 ${align === "right" ? "flex-row-reverse" : ""}`}>
      {team.crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest} alt="" className="w-8 h-8 object-contain" />
      ) : (
        <div className="w-8 h-8 bg-slate-600 rounded-full" />
      )}
      <span className="text-sm font-medium text-slate-200 truncate">{team.shortName}</span>
    </div>
  );
}
