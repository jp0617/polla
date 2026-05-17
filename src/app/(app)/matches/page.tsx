"use client";

import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
  points: number | null;
  status: string;
}

interface Match {
  id: string;
  kickoff: string;
  stage: string;
  group: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  isLocked: boolean;
  homeTeam: Team;
  awayTeam: Team;
  userPrediction: Prediction | null;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const loadMatches = useCallback(async () => {
    const params = new URLSearchParams();
    if (stageFilter) params.set("stage", stageFilter);

    const res = await fetch(`/api/matches?${params}`);
    const data = await res.json();
    setMatches(data);
    setLoading(false);
  }, [stageFilter]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  async function savePrediction(
    matchId: string,
    homeScore: number,
    awayScore: number
  ) {
    setSaving(matchId);
    await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, homeScore, awayScore }),
    });
    setSaving(null);
    loadMatches();
  }

  const stages = [...new Set(matches.map((m) => m.stage))];

  // Group by date
  const byDate = matches.reduce<Record<string, Match[]>>((acc, m) => {
    const day = m.kickoff.split("T")[0];
    if (!acc[day]) acc[day] = [];
    acc[day].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Partidos</h1>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todas las fases</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {formatStage(s)}
            </option>
          ))}
        </select>
      </div>

      {/* Scoring legend */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Sistema de puntos</h3>
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><span className="text-yellow-400 font-bold">+5</span> Marcador exacto</span>
          <span className="flex items-center gap-1"><span className="text-green-400 font-bold">+3</span> Ganador correcto</span>
          <span className="flex items-center gap-1"><span className="text-blue-400 font-bold">+2</span> Empate correcto</span>
          <span className="flex items-center gap-1"><span className="text-purple-400 font-bold">+2</span> Equipo fav. avanza</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-12">Cargando partidos...</div>
      ) : Object.keys(byDate).length === 0 ? (
        <div className="text-center text-slate-400 py-12">No hay partidos disponibles.</div>
      ) : (
        Object.entries(byDate).map(([date, dayMatches]) => (
          <section key={date}>
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {format(new Date(date + "T12:00:00"), "EEEE, d 'de' MMMM yyyy", { locale: es })}
            </h2>
            <div className="space-y-3">
              {dayMatches.map((match) => (
                <MatchPredictionCard
                  key={match.id}
                  match={match}
                  saving={saving === match.id}
                  onSave={(h, a) => savePrediction(match.id, h, a)}
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
  onSave: (home: number, away: number) => void;
}) {
  const [home, setHome] = useState(match.userPrediction?.homeScore ?? 0);
  const [away, setAway] = useState(match.userPrediction?.awayScore ?? 0);
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "IN_PLAY" || match.status === "PAUSED";
  const canPredict = !match.isLocked && !isFinished && !isLive;

  const points = match.userPrediction?.points;

  return (
    <div className={`bg-slate-800 rounded-xl border ${isLive ? "border-red-700" : isFinished ? "border-slate-600" : "border-slate-700"} overflow-hidden`}>
      <div className="p-4">
        {/* Stage badge */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-500">{formatStage(match.stage)}{match.group ? ` — Grupo ${match.group}` : ""}</span>
          <StatusBadge status={match.status} isLocked={match.isLocked} />
        </div>

        {/* Match */}
        <div className="flex items-center gap-3">
          <TeamCol team={match.homeTeam} />
          <div className="flex-1 text-center">
            {isFinished || isLive ? (
              <div className="text-2xl font-bold text-white">
                {match.homeScore} — {match.awayScore}
              </div>
            ) : (
              <div className="text-slate-400 text-sm">
                {format(new Date(match.kickoff), "HH:mm")}
              </div>
            )}
          </div>
          <TeamCol team={match.awayTeam} align="right" />
        </div>

        {/* Prediction input */}
        {canPredict && (
          <div className="mt-4 flex items-center gap-2 justify-center">
            <span className="text-xs text-slate-400">Tu pronóstico:</span>
            <ScoreInput value={home} onChange={setHome} />
            <span className="text-slate-500 font-bold">—</span>
            <ScoreInput value={away} onChange={setAway} />
            <button
              onClick={() => onSave(home, away)}
              disabled={saving}
              className="ml-2 bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white text-sm px-4 py-1.5 rounded-lg transition-colors"
            >
              {saving ? "..." : match.userPrediction ? "Actualizar" : "Guardar"}
            </button>
          </div>
        )}

        {/* Saved prediction result */}
        {match.userPrediction && (isFinished || match.isLocked) && (
          <div className="mt-3 flex items-center justify-center gap-3 text-sm">
            <span className="text-slate-400">
              Tu pronóstico: {match.userPrediction.homeScore} — {match.userPrediction.awayScore}
            </span>
            {isFinished && points !== null && points !== undefined && (
              <span className={`font-bold px-2 py-0.5 rounded ${points === 5 ? "bg-yellow-900 text-yellow-300" : points === 3 ? "bg-green-900 text-green-300" : points === 1 ? "bg-blue-900 text-blue-300" : "bg-slate-700 text-slate-400"}`}>
                {points > 0 ? `+${points} pts` : "0 pts"}
              </span>
            )}
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

function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={30}
      value={value}
      onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
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

function StatusBadge({ status, isLocked }: { status: string; isLocked: boolean }) {
  if (status === "IN_PLAY" || status === "PAUSED") {
    return <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full">● En vivo</span>;
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
    ROUND_OF_16: "Octavos de Final",
    QUARTER_FINALS: "Cuartos de Final",
    SEMI_FINALS: "Semifinales",
    THIRD_PLACE: "Tercer Puesto",
    FINAL: "Gran Final",
  };
  return map[stage] ?? stage.replace(/_/g, " ");
}
