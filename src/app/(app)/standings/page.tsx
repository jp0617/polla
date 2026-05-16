"use client";

import { useEffect, useState } from "react";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  totalPoints: number;
  bonusPoints: number;
  exactScores: number;
  correctWinners: number;
  favoriteTeam: { name: string; crest: string | null; code: string } | null;
  isCurrentUser: boolean;
}

export default function StandingsPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/standings")
      .then((r) => r.json())
      .then((d) => {
        setLeaderboard(d.leaderboard ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="text-center text-slate-400 py-16">Cargando clasificación...</div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Clasificación</h1>

      {/* Podium */}
      {leaderboard.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <PodiumCard entry={leaderboard[1]} position={2} />
          <PodiumCard entry={leaderboard[0]} position={1} />
          <PodiumCard entry={leaderboard[2]} position={3} />
        </div>
      )}

      {/* Full table */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-px bg-slate-700">
          <Cell header>#</Cell>
          <Cell header>Jugador</Cell>
          <Cell header center>Pts</Cell>
          <Cell header center>Exactos</Cell>
          <Cell header center>Ganador</Cell>
          <Cell header center>Bonus</Cell>
        </div>

        {leaderboard.map((entry) => (
          <div
            key={entry.userId}
            className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-px bg-slate-700 ${
              entry.isCurrentUser ? "ring-2 ring-green-500 ring-inset" : ""
            }`}
          >
            <Cell>
              <RankBadge rank={entry.rank} />
            </Cell>
            <Cell>
              <div className="flex items-center gap-2">
                {entry.favoriteTeam?.crest && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.favoriteTeam.crest}
                    alt=""
                    className="w-5 h-5 object-contain"
                  />
                )}
                <span className={`text-sm ${entry.isCurrentUser ? "text-green-400 font-semibold" : "text-slate-200"}`}>
                  {entry.name}
                  {entry.isCurrentUser && (
                    <span className="ml-1 text-xs text-green-500">(tú)</span>
                  )}
                </span>
              </div>
            </Cell>
            <Cell center>
              <span className="font-bold text-white">{entry.totalPoints}</span>
            </Cell>
            <Cell center>
              <span className="text-yellow-400">{entry.exactScores}</span>
            </Cell>
            <Cell center>
              <span className="text-green-400">{entry.correctWinners}</span>
            </Cell>
            <Cell center>
              <span className="text-purple-400">{entry.bonusPoints}</span>
            </Cell>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="text-xs text-slate-500 text-center">
        Pts = puntos totales · Exactos = marcador exacto (+5) · Ganador = resultado correcto (+3) · Bonus = equipo favorito (+2)
      </div>
    </div>
  );
}

function Cell({
  children,
  header,
  center,
}: {
  children?: React.ReactNode;
  header?: boolean;
  center?: boolean;
}) {
  return (
    <div
      className={`${header ? "bg-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-wider" : "bg-slate-800 text-slate-300"} px-3 py-3 flex items-center ${center ? "justify-center" : ""}`}
    >
      {children}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return <span className="text-slate-400 text-sm font-mono w-6 text-center">{rank}</span>;
}

function PodiumCard({
  entry,
  position,
}: {
  entry: LeaderboardEntry;
  position: 1 | 2 | 3;
}) {
  const heights = { 1: "pt-2", 2: "pt-8", 3: "pt-8" };
  const colors = {
    1: "from-yellow-800 to-yellow-700 border-yellow-600",
    2: "from-slate-600 to-slate-500 border-slate-400",
    3: "from-orange-900 to-orange-800 border-orange-700",
  };

  return (
    <div className={`${heights[position]} flex flex-col`}>
      <div
        className={`flex-1 bg-gradient-to-b ${colors[position]} border rounded-xl p-3 text-center flex flex-col items-center justify-end ${entry.isCurrentUser ? "ring-2 ring-green-400" : ""}`}
      >
        <div className="text-2xl mb-1">
          {position === 1 ? "🥇" : position === 2 ? "🥈" : "🥉"}
        </div>
        {entry.favoriteTeam?.crest && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.favoriteTeam.crest} alt="" className="w-8 h-8 object-contain mb-1" />
        )}
        <div className="text-sm font-semibold text-white truncate w-full">
          {entry.name.split(" ")[0]}
        </div>
        <div className="text-lg font-bold text-white">{entry.totalPoints}</div>
        <div className="text-xs text-slate-300">pts</div>
      </div>
    </div>
  );
}
