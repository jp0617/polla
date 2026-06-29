"use client";

import { useEffect, useState } from "react";
import { fmtDatetime } from "@/lib/colombia-time";

interface Prediction {
  id: string;
  homeScore: number;
  awayScore: number;
  points: number | null;
  status: string;
  match: {
    id: string;
    kickoff: string;
    stage: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: { name: string; shortName: string; crest: string | null };
    awayTeam: { name: string; shortName: string; crest: string | null };
  };
}

const KO_STAGES = new Set(["LAST_32", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"]);

function getPredType(pred: Prediction): "exact" | "draw" | "winner" | "miss" | "pending" {
  if (pred.status !== "SCORED") return "pending";
  const { match } = pred;
  if (match.homeScore === null || match.awayScore === null) return "pending";
  const pts = pred.points ?? 0;
  const isExact = pred.homeScore === match.homeScore && pred.awayScore === match.awayScore;
  if (isExact) return "exact";
  // For KO matches, use stored points as source of truth since draws/penalties
  // create complex scoring that can't be inferred from score comparison alone.
  if (KO_STAGES.has(match.stage)) {
    if (pts > 0) return "winner";
    return "miss";
  }
  const matchIsDraw = match.homeScore === match.awayScore;
  const predIsDraw = pred.homeScore === pred.awayScore;
  if (matchIsDraw && predIsDraw) return "draw";
  const matchWinner = match.homeScore > match.awayScore ? "home" : match.awayScore > match.homeScore ? "away" : "draw";
  const predWinner = pred.homeScore > pred.awayScore ? "home" : pred.awayScore > pred.homeScore ? "away" : "draw";
  if (matchWinner === predWinner && pts > 0) return "winner";
  return "miss";
}

export default function HistoryPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "exact" | "draw" | "winner" | "miss">("all");
  const [stageFilter, setStageFilter] = useState("");

  useEffect(() => {
    fetch("/api/predictions")
      .then((r) => r.json())
      .then((d) => {
        setPredictions(d.predictions ?? []);
        setLoading(false);
      });
  }, []);

  const scored = predictions.filter((p) => p.status === "SCORED");
  const totalPoints = scored.reduce((s, p) => s + (p.points ?? 0), 0);
  const exactCount = predictions.filter((p) => getPredType(p) === "exact").length;
  const drawCount = predictions.filter((p) => getPredType(p) === "draw").length;
  const winnerCount = predictions.filter((p) => getPredType(p) === "winner").length;
  const missCount = predictions.filter((p) => getPredType(p) === "miss").length;

  const STAGE_ORDER = ["GROUP_STAGE", "LAST_32", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];
  const allStages = [...new Set(predictions.map((p) => p.match.stage))].sort(
    (a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b)
  );

  const filtered = predictions.filter((p) => {
    if (stageFilter && p.match.stage !== stageFilter) return false;
    if (filter === "all") return true;
    return getPredType(p) === filter;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Mis Pronósticos</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatBox label="Puntos totales" value={totalPoints} color="text-white" bg="bg-green-900" />
        <StatBox label="Exactos" value={exactCount} color="text-yellow-400" bg="bg-yellow-900/40" />
        <StatBox label="Empate" value={drawCount} color="text-blue-400" bg="bg-blue-900/40" />
        <StatBox label="Ganador" value={winnerCount} color="text-green-400" bg="bg-green-900/40" />
        <StatBox label="Fallados" value={missCount} color="text-red-400" bg="bg-red-900/40" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "exact", "draw", "winner", "miss"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm px-4 py-1.5 rounded-full transition-colors ${
              filter === f
                ? "bg-green-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {f === "all" ? "Todos" : f === "exact" ? "Exactos" : f === "draw" ? "Empate" : f === "winner" ? "Ganador" : "Fallados"}
          </button>
        ))}
        {allStages.length > 1 && (
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="ml-auto bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">Todas las fases</option>
            {allStages.map((s) => (
              <option key={s} value={s}>{formatStage(s)}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="text-center text-slate-400 py-12">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-400 py-12">No hay pronósticos en esta categoría.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((pred) => (
            <PredictionCard key={pred.id} prediction={pred} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className={`${bg} border border-slate-700 rounded-xl p-4 text-center`}>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

function PredictionCard({ prediction: pred }: { prediction: Prediction }) {
  const { match } = pred;
  const isFinished = match.status === "FINISHED";
  const predType = getPredType(pred);

  const pointsColor =
    predType === "exact"
      ? "bg-yellow-900 text-yellow-300"
      : predType === "draw"
      ? "bg-blue-900 text-blue-300"
      : predType === "winner"
      ? "bg-green-900 text-green-300"
      : predType === "miss"
      ? "bg-slate-700 text-slate-400"
      : "bg-slate-700 text-slate-500";

  const pointsLabel =
    predType === "exact"
      ? "Exacto ⭐"
      : predType === "draw"
      ? "Empate ✓"
      : predType === "winner"
      ? "Ganador ✓"
      : predType === "miss"
      ? "Fallado ✗"
      : "Pendiente";

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">
          {fmtDatetime(match.kickoff)} —{" "}
          {formatStage(match.stage)}
        </span>
        {isFinished && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pointsColor}`}>
            {pointsLabel}
            {pred.points && pred.points > 0 ? ` +${pred.points}` : ""}
          </span>
        )}
        {!isFinished && pred.status === "LOCKED" && (
          <span className="text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded-full">
            🔒 Cerrado
          </span>
        )}
        {pred.status === "PENDING" && (
          <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">
            Abierto
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <TeamMini team={match.homeTeam} />
        <div className="flex-1 text-center space-y-1">
          {/* Official result */}
          {isFinished && (
            <div className="text-xl font-bold text-white">
              {match.homeScore} — {match.awayScore}
            </div>
          )}
          {/* User prediction */}
          <div className={`text-sm ${isFinished ? "text-slate-400" : "font-bold text-white text-xl"}`}>
            {isFinished ? "Tu: " : ""}{pred.homeScore} — {pred.awayScore}
          </div>
        </div>
        <TeamMini team={match.awayTeam} align="right" />
      </div>
    </div>
  );
}

function TeamMini({
  team,
  align = "left",
}: {
  team: { name: string; shortName: string; crest: string | null };
  align?: "left" | "right";
}) {
  return (
    <div className={`flex items-center gap-1.5 w-20 ${align === "right" ? "flex-row-reverse" : ""}`}>
      {team.crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest} alt="" className="w-7 h-7 object-contain" />
      ) : (
        <div className="w-7 h-7 bg-slate-600 rounded-full" />
      )}
      <span className="text-xs text-slate-300 truncate">{team.shortName}</span>
    </div>
  );
}

function formatStage(stage: string): string {
  const map: Record<string, string> = {
    GROUP_STAGE: "Grupos",
    LAST_32: "Dieciseisavos",
    ROUND_OF_16: "Octavos",
    QUARTER_FINALS: "Cuartos",
    SEMI_FINALS: "Semis",
    THIRD_PLACE: "3er puesto",
    FINAL: "Final",
  };
  return map[stage] ?? stage;
}
