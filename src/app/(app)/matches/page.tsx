"use client";

import { useEffect, useState, useCallback } from "react";
import { fmtTime, fmtDateKey, fmtDateLong, fmtDatetime } from "@/lib/colombia-time";

interface Team {
  id: string;
  name: string;
  shortName: string;
  crest: string | null;
  code: string;
}

interface Prediction {
  id: string;
  homeScore: number;
  awayScore: number;
  advancingTeamId: string | null;
  points: number | null;
  status: string;
  userUpdatedAt: string | null;
}

const KO_STAGES = new Set(["LAST_32", "LAST_16", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"]);

interface Match {
  id: string;
  kickoff: string;
  stage: string;
  group: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeScoreET: number | null;
  awayScoreET: number | null;
  minute: number | null;
  scoreUpdatedAt: string | null;
  isLocked: boolean;
  homeTeam: Team;
  awayTeam: Team;
  userPrediction: Prediction | null;
}

interface ScoringConfig {
  exactScore: number;
  correctWinner: number;
  correctDraw: number;
  bonusPhaseAdvance: number;
  exactScoreKO: number;
  correctWinnerKO: number;
  correctAdvancingKO: number;
  advancingPickBonusKO: number;
  bonusPhaseAdvanceKO: number;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("");
  const [tabFilter, setTabFilter] = useState<"today" | "finished" | "upcoming">("today");
  const [saving, setSaving] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [scoring, setScoring] = useState<ScoringConfig>({
    exactScore: 5, correctWinner: 3, correctDraw: 2, bonusPhaseAdvance: 2,
    exactScoreKO: 10, correctWinnerKO: 6, correctAdvancingKO: 4, advancingPickBonusKO: 1, bonusPhaseAdvanceKO: 4,
  });

  useEffect(() => {
    fetch("/api/scoring-config")
      .then((r) => r.json())
      .then((d) => { if (d.config) setScoring((s) => ({ ...s, ...d.config })); })
      .catch(() => {});
  }, []);

  const loadMatches = useCallback(async () => {
    const params = new URLSearchParams();
    if (stageFilter) params.set("stage", stageFilter);

    const res = await fetch(`/api/matches?${params}`);
    const data = await res.json();
    setMatches(data);
    setLastRefresh(new Date());
    setLoading(false);
  }, [stageFilter]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // Auto-refresh every 60s when there are live matches
  useEffect(() => {
    const hasLive = matches.some((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
    if (!hasLive) return;
    const interval = setInterval(loadMatches, 60_000);
    return () => clearInterval(interval);
  }, [matches, loadMatches]);

  async function savePrediction(
    matchId: string,
    homeScore: number,
    awayScore: number,
    advancingTeamId?: string | null
  ) {
    setSaving(matchId);
    await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, homeScore, awayScore, advancingTeamId: advancingTeamId ?? null }),
    });
    setSaving(null);
    loadMatches();
  }

  const todayKey = fmtDateKey(new Date().toISOString());

  const tabFiltered = matches.filter((m) => {
    const day = fmtDateKey(m.kickoff);
    if (tabFilter === "finished") return m.status === "FINISHED";
    if (tabFilter === "today") return day === todayKey;
    // upcoming: not finished and not today
    return m.status !== "FINISHED" && day !== todayKey;
  });

  // Stages from ALL matches so the dropdown shows every phase regardless of active tab
  const STAGE_ORDER = ["GROUP_STAGE", "LAST_32", "LAST_16", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];
  const allStages = [...new Set(matches.map((m) => m.stage))].sort(
    (a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b)
  );

  // Group by Colombia date
  const byDate = tabFiltered.reduce<Record<string, Match[]>>((acc, m) => {
    if (stageFilter && m.stage !== stageFilter) return acc;
    const day = fmtDateKey(m.kickoff);
    if (!acc[day]) acc[day] = [];
    acc[day].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Partidos</h1>
        {matches.some((m) => m.status === "IN_PLAY" || m.status === "PAUSED") && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            En vivo · actualiza cada 60s
            {lastRefresh && <span>· {fmtTime(lastRefresh.toISOString())}</span>}
          </div>
        )}
      </div>

      {/* Tab filters */}
      <div className="flex gap-2">
        {(["today", "upcoming", "finished"] as const).map((f) => {
          const label = f === "today" ? "Hoy" : f === "upcoming" ? "Próximos" : "Finalizados";
          return (
            <button
              key={f}
              onClick={() => { setTabFilter(f); setStageFilter(""); }}
              className={`text-sm px-4 py-1.5 rounded-full transition-colors ${
                tabFilter === f ? "bg-green-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {label}
            </button>
          );
        })}
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="ml-auto bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Todas las fases</option>
          {allStages.map((s) => (
            <option key={s} value={s}>
              {formatStage(s)}
            </option>
          ))}
        </select>
      </div>

      {/* Scoring legend */}
      {(() => {
        const viewingKO = stageFilter ? KO_STAGES.has(stageFilter) : false;
        const showBoth = !stageFilter;
        return (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
            {(!viewingKO || showBoth) && (
              <div>
                {showBoth && <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Fase de grupos</p>}
                {!showBoth && <h3 className="text-sm font-semibold text-slate-300 mb-2">Sistema de puntos</h3>}
                <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><span className="text-yellow-400 font-bold">+{scoring.exactScore}</span> Marcador exacto</span>
                  <span className="flex items-center gap-1"><span className="text-green-400 font-bold">+{scoring.correctWinner}</span> Ganador correcto</span>
                  <span className="flex items-center gap-1"><span className="text-blue-400 font-bold">+{scoring.correctDraw}</span> Empate correcto</span>
                  <span className="flex items-center gap-1"><span className="text-purple-400 font-bold">+{scoring.bonusPhaseAdvance}</span> Equipo fav. avanza</span>
                </div>
              </div>
            )}
            {(viewingKO || showBoth) && (
              <div>
                {showBoth && <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Fase eliminatoria</p>}
                {!showBoth && <h3 className="text-sm font-semibold text-slate-300 mb-2">Sistema de puntos</h3>}
                <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><span className="text-yellow-400 font-bold">+{scoring.exactScoreKO}</span> Marcador exacto (90/120 min)</span>
                  <span className="flex items-center gap-1"><span className="text-green-400 font-bold">+{scoring.correctWinnerKO}</span> Ganador correcto</span>
                  <span className="flex items-center gap-1"><span className="text-blue-400 font-bold">+{scoring.correctAdvancingKO}</span> Empate correcto</span>
                  <span className="flex items-center gap-1"><span className="text-indigo-400 font-bold">+{scoring.advancingPickBonusKO}</span> Bonus equipo que avanza</span>
                  <span className="flex items-center gap-1"><span className="text-purple-400 font-bold">+{scoring.bonusPhaseAdvance}</span> Equipo fav. avanza</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {loading ? (
        <div className="text-center text-slate-400 py-12">Cargando partidos...</div>
      ) : Object.keys(byDate).length === 0 ? (
        <div className="text-center text-slate-400 py-12">No hay partidos disponibles.</div>
      ) : (
        Object.entries(byDate).map(([date, dayMatches]) => (
          <section key={date}>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {fmtDateLong(date + "T12:00:00")}
            </h2>
            <div className="space-y-3">
              {dayMatches.map((match) => (
                <MatchPredictionCard
                  key={match.id}
                  match={match}
                  saving={saving === match.id}
                  onSave={(h, a, adv) => savePrediction(match.id, h, a, adv)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function MatchPredictionCard({
  match,
  saving,
  onSave,
}: {
  match: Match;
  saving: boolean;
  onSave: (home: number, away: number, advancingTeamId?: string | null) => void;
}) {
  const [home, setHome] = useState<number | null>(match.userPrediction?.homeScore ?? null);
  const [away, setAway] = useState<number | null>(match.userPrediction?.awayScore ?? null);
  const [advancingTeamId, setAdvancingTeamId] = useState<string | null>(
    match.userPrediction?.advancingTeamId ?? null
  );
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "IN_PLAY" || match.status === "PAUSED";
  const canPredict = !match.isLocked && !isFinished && !isLive;
  const isKO = KO_STAGES.has(match.stage);
  const isDraw = home !== null && away !== null && home === away;
  const needsAdvancing = isKO && isDraw && canPredict;

  // Reset advancing team when scores are no longer a draw
  useEffect(() => {
    if (!isDraw) setAdvancingTeamId(null);
  }, [isDraw]);

  const points = match.userPrediction?.points;

  return (
    <div className={`bg-slate-800 rounded-xl border ${isLive ? "border-red-700" : isFinished ? "border-slate-600" : "border-slate-700"} overflow-hidden`}>
      <div className="p-4">
        {/* Stage badge */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-500">{formatStage(match.stage)}{match.group ? ` — Grupo ${match.group}` : ""}</span>
          <StatusBadge status={match.status} isLocked={match.isLocked} minute={match.minute} kickoff={match.kickoff} />
        </div>

        {/* Match */}
        <div className="flex items-center gap-3">
          <TeamCol team={match.homeTeam} />
          <div className="flex-1 text-center">
            {isFinished || isLive ? (
              <div className="text-2xl font-bold text-white">
                {match.homeScoreET ?? match.homeScore} — {match.awayScoreET ?? match.awayScore}
              </div>
            ) : (
              <div className="text-slate-400 text-sm">
                {fmtTime(match.kickoff)}
              </div>
            )}
            {match.userPrediction?.userUpdatedAt && (
              <div className="text-xs text-slate-500 mt-0.5">
                Actualizado {fmtDatetime(match.userPrediction.userUpdatedAt)}
              </div>
            )}
          </div>
          <TeamCol team={match.awayTeam} align="right" />
        </div>

        {/* Prediction input */}
        {canPredict && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 justify-center">
              <span className="text-xs text-slate-400">Tu pronóstico:</span>
              <ScoreInput value={home} onChange={setHome} />
              <span className="text-slate-500 font-bold">—</span>
              <ScoreInput value={away} onChange={setAway} />
              <button
                onClick={() => { if (home !== null && away !== null) onSave(home, away, needsAdvancing ? advancingTeamId : null); }}
                disabled={saving || home === null || away === null || (needsAdvancing && !advancingTeamId)}
                className="ml-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
              >
                {saving ? "..." : match.userPrediction ? "Actualizar" : "Guardar"}
              </button>
            </div>
            {needsAdvancing && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-amber-400">⚠️ Empate en eliminatoria — ¿quién avanza en penales?</span>
                <div className="flex gap-2">
                  {[
                    { id: match.homeTeam.id, name: match.homeTeam.shortName, crest: match.homeTeam.crest },
                    { id: match.awayTeam.id, name: match.awayTeam.shortName, crest: match.awayTeam.crest },
                  ].map((team) => (
                    <button
                      key={team.id}
                      onClick={() => setAdvancingTeamId(team.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        advancingTeamId === team.id
                          ? "border-amber-500 bg-amber-900/40 text-amber-300"
                          : "border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-400"
                      }`}
                    >
                      {team.crest && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={team.crest} alt="" className="w-5 h-5 object-contain" />
                      )}
                      {team.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Saved prediction result */}
        {match.userPrediction && (isFinished || match.isLocked) && (
          <div className="mt-3 flex flex-col items-center gap-1 text-sm">
            <div className="flex items-center gap-3">
            <span className="text-slate-400">
              Tu pronóstico: {match.userPrediction.homeScore} — {match.userPrediction.awayScore}
              {match.userPrediction.advancingTeamId && (() => {
                const t = match.userPrediction!.advancingTeamId === match.homeTeam.id ? match.homeTeam : match.awayTeam;
                return <span className="text-amber-400 ml-1">(avanza {t.shortName})</span>;
              })()}
            </span>
            {isFinished && points !== null && points !== undefined && (
              <span className={`font-bold px-2 py-0.5 rounded ${points >= 10 ? "bg-yellow-900 text-yellow-300" : points >= 6 ? "bg-green-900 text-green-300" : points >= 3 ? "bg-blue-900 text-blue-300" : "bg-slate-700 text-slate-400"}`}>
                {points > 0 ? `+${points} pts` : "0 pts"}
              </span>
            )}
            </div>
          </div>
        )}

        {!match.userPrediction && match.isLocked && !isFinished && (
          <p className="mt-3 text-center text-xs text-slate-500">
            No hiciste un pronóstico para este partido
          </p>
        )}
      </div>
    </div>
  );
}

function ScoreInput({ value, onChange }: Readonly<{ value: number | null; onChange: (v: number | null) => void }>) {
  return (
    <input
      type="number"
      value={value ?? ""}
      placeholder="–"
      onChange={(e) => {
        if (e.target.value === "") { onChange(null); return; }
        const n = Number.parseInt(e.target.value);
        onChange(Number.isNaN(n) ? null : Math.max(0, n));
      }}
      className="w-14 bg-slate-900 border border-slate-600 text-white text-center rounded-lg py-1.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-green-500"
    />
  );
}

function TeamCol({ team, align = "left" }: { team: Team; align?: "left" | "right" }) {
  return (
    <div className={`flex flex-col items-center w-24`}>
      {team.crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest} alt="" className="w-10 h-10 object-contain mb-1" />
      ) : (
        <div className="w-10 h-10 bg-slate-600 rounded-full mb-1" />
      )}
      <span className={`text-xs font-medium text-slate-200 text-center ${align === "right" ? "text-right" : "text-left"}`}>
        {team.shortName}
      </span>
    </div>
  );
}

function StatusBadge({ status, isLocked, minute, kickoff }: { status: string; isLocked: boolean; minute?: number | null; kickoff?: string }) {
  if (status === "IN_PLAY" || status === "PAUSED") {
    let label = "En vivo";
    if (status === "PAUSED") {
      label = "Medio tiempo";
    } else if (minute != null) {
      label = `${minute}'`;
    } else if (kickoff) {
      const elapsed = Math.floor((Date.now() - new Date(kickoff).getTime()) / 60000);
      if (elapsed > 0 && elapsed <= 120) label = `~${elapsed}'`;
    }
    return <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">● {label}</span>;
  }
  if (status === "FINISHED") {
    return <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">Finalizado</span>;
  }
  if (isLocked) {
    return <span className="text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded-full">🔒 Cerrado</span>;
  }
  return <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">Abierto</span>;
}

function formatStage(stage: string): string {
  const map: Record<string, string> = {
    GROUP_STAGE: "Fase de Grupos",
    LAST_32: "Dieciseisavos de Final",
    LAST_16: "Octavos de Final",
    ROUND_OF_16: "Octavos de Final",
    QUARTER_FINALS: "Cuartos de Final",
    SEMI_FINALS: "Semifinales",
    THIRD_PLACE: "Tercer Puesto",
    FINAL: "Gran Final",
  };
  return map[stage] ?? stage.replace(/_/g, " ");
}
