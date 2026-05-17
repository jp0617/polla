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

export default function HistoryPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "exact" | "winner" | "miss">("all");

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
  const exactCount = scored.filter((p) => p.points === 5).length;
  const winnerCount = scored.filter((p) => p.points === 3).length;
  const missCount = scored.filter((p) => p.points === 0).length;

  const filtered = predictions.filter((p) => {
    if (filter === "exact") return p.points === 5;
    if (filter === "winner") return p.points === 3;
    if (filter === "miss") return p.points === 0 && p.status === "SCORED";
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Mis Pronósticos</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatBox label="Puntos totales" value={totalPoints} color="text-white" bg="bg-green-900" />
        <StatBox label="Exactos" value={exactCount} color="text-yellow-400" bg="bg-yellow-900/40" />
        <StatBox label="Ganador" value={winnerCount} color="text-green-400" bg="bg-green-900/40" />
        <StatBox label="Fallados" value={missCount} color="text-red-400" bg="bg-red-900/40" />
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "exact", "winner", "miss"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm px-4 py-1.5 rounded-full transition-colors ${
              filter === f
                ? "bg-green-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {f === "all" ? "Todos" : f === "exact" ? "Exactos" : f === "winner" ? "Ganador" : "Fallados"}
          </button>
        ))}
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

  const pointsColor =
    pred.points === 5
      ? "bg-yellow-900 text-yellow-300"
      : pred.points === 3
      ? "bg-green-900 text-green-300"
      : pred.points === 0
      ? "bg-slate-700 text-slate-400"
      : "bg-slate-700 text-slate-500";

  const pointsLabel =
    pred.points === 5
      ? "Exacto ⭐"
      : pred.points === 3
      ? "Ganador ✓"
      : pred.points === 0
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
    ROUND_OF_16: "Octavos",
    QUARTER_FINALS: "Cuartos",
    SEMI_FINALS: "Semis",
    FINAL: "Final",
  };
  return map[stage] ?? stage;
}
