"use client";

import { useEffect, useState } from "react";

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  totalPoints: number;
  bonusPoints: number;
  livePoints?: number;
  isLive?: boolean;
  exactScores: number;
  correctWinners: number;
  correctDraws: number;
  favoriteTeam: { name: string; crest: string | null; code: string } | null;
  championPick: { name: string; crest: string | null; code: string } | null;
  isCurrentUser: boolean;
}

interface Group {
  id: string;
  code: string;
  label: string | null;
}

interface ScoringConfig {
  exactScore: number;
  correctWinner: number;
  correctDraw: number;
  exactScoreKO: number;
  correctWinnerKO: number;
  correctAdvancingKO: number;
  advancingPickBonusKO: number;
}

export default function StandingsPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [phase, setPhase] = useState<"all" | "groups" | "ko">("all");
  const [loading, setLoading] = useState(true);
  const [hasLiveMatch, setHasLiveMatch] = useState(false);
  const [scoring, setScoring] = useState<ScoringConfig>({
    exactScore: 5, correctWinner: 3, correctDraw: 2,
    exactScoreKO: 10, correctWinnerKO: 6, correctAdvancingKO: 4, advancingPickBonusKO: 1,
  });

  useEffect(() => {
    fetch("/api/scoring-config")
      .then((r) => r.json())
      .then((d) => { if (d.config) setScoring((s) => ({ ...s, ...d.config })); })
      .catch(() => {});
  }, []);

  // Load user's groups from profile
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p) => {
        const memberships: { invitationCode: Group }[] = p.memberships ?? [];
        const g = memberships.map((m) => m.invitationCode);
        setGroups(g);
        if (g.length > 0) setSelectedGroup(g[0].id);
      });
  }, []);

  useEffect(() => {
    if (selectedGroup === undefined) return;

    let cancelled = false;
    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      const params = new URLSearchParams();
      if (selectedGroup) params.set("groupId", selectedGroup);
      if (phase !== "all") params.set("phase", phase);
      const url = `/api/standings${params.size ? `?${params}` : ""}`;
      fetch(url)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          setLeaderboard(d.leaderboard ?? []);
          setHasLiveMatch(Boolean(d.hasLiveMatch));
          setLoading(false);
        });
    };

    load(true);
    // Poll every 15s so the table "moves" live while a match is in play
    const interval = setInterval(() => load(false), 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedGroup, phase]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-white">Clasificación</h1>
          {hasLiveMatch && (
            <span className="flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-950/50 border border-red-800 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              EN VIVO
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-slate-600">
            {(["all", "groups", "ko"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  phase === p
                    ? "bg-green-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {p === "all" ? "Todo" : p === "groups" ? "Grupos" : "Eliminatoria"}
              </button>
            ))}
          </div>

        {groups.length > 1 && (
          <select
            value={selectedGroup ?? ""}
            onChange={(e) => setSelectedGroup(e.target.value || null)}
            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-500"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label ? `${g.label} (${g.code})` : g.code}
              </option>
            ))}
          </select>
        )}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-16">Cargando clasificación...</div>
      ) : (
        <>
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
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-px bg-slate-700">
              <Cell header>#</Cell>
              <Cell header>Jugador</Cell>
              <Cell header center>Pts</Cell>
              <Cell header center>⭐</Cell>
              <Cell header center>✓</Cell>
              <Cell header center>=</Cell>
              <Cell header center>🎁</Cell>
            </div>

            {leaderboard.map((entry) => (
              <div
                key={entry.userId}
                className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-px bg-slate-700 ${
                  entry.isCurrentUser ? "ring-2 ring-green-500 ring-inset" : ""
                }`}
              >
                <Cell>
                  <RankBadge rank={entry.rank} />
                </Cell>
                <Cell>
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.favoriteTeam?.crest && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.favoriteTeam.crest}
                        alt=""
                        title={`Favorito: ${entry.favoriteTeam.name}`}
                        className="w-5 h-5 object-contain shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <span className={`text-sm ${entry.isCurrentUser ? "text-green-400 font-semibold" : "text-slate-200"}`}>
                        {entry.name}
                        {entry.isCurrentUser && <span className="ml-1 text-xs text-green-500">(tú)</span>}
                        {entry.isLive && <span className="ml-1 text-xs text-red-400">●</span>}
                      </span>
                      {entry.championPick?.crest && (
                        <div
                          className="flex items-center gap-1 mt-0.5"
                          title={`Campeón elegido: ${entry.championPick.name}`}
                        >
                          <span className="text-[10px]">🏆</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={entry.championPick.crest} alt="" className="w-3.5 h-3.5 object-contain" />
                        </div>
                      )}
                    </div>
                  </div>
                </Cell>
                <Cell center>
                  <span className="font-bold text-white">{entry.totalPoints}</span>
                  {!!entry.livePoints && (
                    <span className="ml-1 text-xs text-red-400 font-semibold">
                      ({entry.livePoints > 0 ? "+" : ""}{entry.livePoints})
                    </span>
                  )}
                </Cell>
                <Cell center><span className="text-yellow-400">{entry.exactScores}</span></Cell>
                <Cell center><span className="text-green-400">{entry.correctWinners}</span></Cell>
                <Cell center><span className="text-blue-400">{entry.correctDraws}</span></Cell>
                <Cell center><span className="text-purple-400">{entry.bonusPoints}</span></Cell>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-500 text-center space-y-1">
            <div>
              <span className="text-slate-400 font-medium">Grupos:</span>{" "}
              ⭐ exacto (+{scoring.exactScore}) · ✓ ganador (+{scoring.correctWinner}) · = empate (+{scoring.correctDraw})
            </div>
            <div>
              <span className="text-slate-400 font-medium">Eliminatoria:</span>{" "}
              ⭐ exacto (+{scoring.exactScoreKO}) · ✓ ganador (+{scoring.correctWinnerKO}) · = empate (+{scoring.correctAdvancingKO}) · avanza (+{scoring.advancingPickBonusKO})
            </div>
            <div>🎁 bonus equipo favorito / campeón</div>
          </div>
        </>
      )}
    </div>
  );
}

function Cell({ children, header, center }: { children?: React.ReactNode; header?: boolean; center?: boolean }) {
  return (
    <div className={`${header ? "bg-slate-900 text-slate-400 text-xs font-semibold uppercase tracking-wider" : "bg-slate-800 text-slate-300"} px-3 py-3 flex items-center ${center ? "justify-center" : ""}`}>
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

function PodiumCard({ entry, position }: { entry: LeaderboardEntry; position: 1 | 2 | 3 }) {
  const heights = { 1: "pt-2", 2: "pt-8", 3: "pt-8" };
  const colors = {
    1: "from-yellow-800 to-yellow-700 border-yellow-600",
    2: "from-slate-600 to-slate-500 border-slate-400",
    3: "from-orange-900 to-orange-800 border-orange-700",
  };
  return (
    <div className={`${heights[position]} flex flex-col`}>
      <div className={`flex-1 bg-gradient-to-b ${colors[position]} border rounded-xl p-3 text-center flex flex-col items-center justify-end ${entry.isCurrentUser ? "ring-2 ring-green-400" : ""}`}>
        <div className="text-2xl mb-1">{position === 1 ? "🥇" : position === 2 ? "🥈" : "🥉"}</div>
        {entry.favoriteTeam?.crest && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.favoriteTeam.crest} alt="" className="w-8 h-8 object-contain mb-1" />
        )}
        <div className="text-sm font-semibold text-white truncate w-full">{entry.name.split(" ")[0]}</div>
        <div className="text-lg font-bold text-white">{entry.totalPoints}</div>
        <div className="text-xs text-slate-300">pts</div>
      </div>
    </div>
  );
}
