"use client";

import { useEffect, useState } from "react";
import { fmtDatetime, fmtDateKey } from "@/lib/colombia-time";

interface Member {
  id: string;
  name: string;
}

interface Prediction {
  id: string;
  homeScore: number;
  awayScore: number;
  points: number | null;
  status: string;
  userUpdatedAt: string | null;
  match: {
    id: string;
    kickoff: string;
    stage: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: { name: string; shortName: string; crest: string | null; code: string };
    awayTeam: { name: string; shortName: string; crest: string | null; code: string };
  };
}

function getPredType(pred: Prediction): "exact" | "draw" | "winner" | "miss" | "pending" {
  if (pred.status !== "SCORED") return "pending";
  const { match } = pred;
  if (match.homeScore === null || match.awayScore === null) return "pending";
  if (pred.homeScore === match.homeScore && pred.awayScore === match.awayScore) return "exact";
  if (match.homeScore === match.awayScore && pred.homeScore === pred.awayScore) return "draw";
  const mw = match.homeScore > match.awayScore ? "home" : match.awayScore > match.homeScore ? "away" : "draw";
  const pw = pred.homeScore > pred.awayScore ? "home" : pred.awayScore > pred.homeScore ? "away" : "draw";
  if (mw === pw && (pred.points ?? 0) > 0) return "winner";
  return "miss";
}

export default function PredictionsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [tabFilter, setTabFilter] = useState<"today" | "finished" | "upcoming">("today");
  const [stageFilter, setStageFilter] = useState("");

  useEffect(() => {
    fetch("/api/predictions/user")
      .then((r) => r.json())
      .then((d) => {
        setMembers(d.members ?? []);
        setLoadingMembers(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) { setPredictions([]); return; }
    setLoading(true);
    fetch(`/api/predictions/user?userId=${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        setPredictions(d.predictions ?? []);
        setLoading(false);
      });
  }, [selectedId]);

  const todayKey = fmtDateKey(new Date().toISOString());

  const STAGE_ORDER = ["GROUP_STAGE", "LAST_32", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];
  const allStages = [...new Set(predictions.map((p) => p.match.stage))].sort(
    (a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b)
  );

  const filtered = predictions.filter((p) => {
    const day = fmtDateKey(p.match.kickoff);
    if (stageFilter && p.match.stage !== stageFilter) return false;
    if (tabFilter === "finished") return p.match.status === "FINISHED";
    if (tabFilter === "today") return day === todayKey;
    return p.match.status !== "FINISHED" && day !== todayKey;
  });

  const scored = filtered.filter((p) => p.status === "SCORED");
  const totalPoints = scored.reduce((s, p) => s + (p.points ?? 0), 0);
  const exactCount = filtered.filter((p) => getPredType(p) === "exact").length;
  const winnerCount = filtered.filter((p) => getPredType(p) === "winner").length;
  const missCount = filtered.filter((p) => getPredType(p) === "miss").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Pronósticos del grupo</h1>

      {/* User selector */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <label className="block text-sm text-slate-400 mb-2">Ver pronósticos de:</label>
        {loadingMembers ? (
          <p className="text-slate-500 text-sm">Cargando participantes...</p>
        ) : (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Selecciona un participante —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
      </div>

      {selectedId && (
        <>
          {/* Tab + stage filters */}
          <div className="flex gap-2 flex-wrap">
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

          {/* Stats */}
          {scored.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Puntos" value={totalPoints} color="text-white" bg="bg-green-900" />
              <StatBox label="Exactos" value={exactCount} color="text-yellow-400" bg="bg-yellow-900/40" />
              <StatBox label="Ganador" value={winnerCount} color="text-green-400" bg="bg-green-900/40" />
              <StatBox label="Fallados" value={missCount} color="text-red-400" bg="bg-red-900/40" />
            </div>
          )}

          {loading ? (
            <div className="text-center text-slate-400 py-12">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              No hay pronósticos en esta categoría.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((pred) => (
                <PredCard key={pred.id} pred={pred} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PredCard({ pred }: { pred: Prediction }) {
  const { match } = pred;
  const isFinished = match.status === "FINISHED";
  const predType = getPredType(pred);

  const badge =
    predType === "exact" ? { label: "Exacto ⭐", cls: "bg-yellow-900 text-yellow-300" }
    : predType === "draw" ? { label: "Empate ✓", cls: "bg-blue-900 text-blue-300" }
    : predType === "winner" ? { label: "Ganador ✓", cls: "bg-green-900 text-green-300" }
    : predType === "miss" ? { label: "Fallado ✗", cls: "bg-slate-700 text-slate-400" }
    : null;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">
          {fmtDatetime(match.kickoff)} — {formatStage(match.stage)}
        </span>
        {badge && isFinished && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
            {badge.label}{pred.points && pred.points > 0 ? ` +${pred.points}` : ""}
          </span>
        )}
        {!isFinished && (
          <span className="text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded-full">En curso</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <TeamMini team={match.homeTeam} />
        <div className="flex-1 text-center space-y-1">
          {isFinished && (
            <div className="text-xl font-bold text-white">
              {match.homeScore} — {match.awayScore}
            </div>
          )}
          <div className={`text-sm ${isFinished ? "text-slate-400" : "text-white font-bold text-lg"}`}>
            {isFinished ? "Pronóstico: " : ""}{pred.homeScore} — {pred.awayScore}
          </div>
          {pred.userUpdatedAt && (
            <div className="text-xs text-slate-500">
              Modificado {fmtDatetime(pred.userUpdatedAt)}
            </div>
          )}
        </div>
        <TeamMini team={match.awayTeam} align="right" />
      </div>
    </div>
  );
}

function StatBox({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`${bg} border border-slate-700 rounded-xl p-4 text-center`}>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  );
}

function TeamMini({ team, align = "left" }: { team: { shortName: string; crest: string | null }; align?: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-1.5 w-20 ${align === "right" ? "flex-row-reverse" : ""}`}>
      {team.crest
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={team.crest} alt="" className="w-7 h-7 object-contain" />
        : <div className="w-7 h-7 bg-slate-600 rounded-full" />
      }
      <span className="text-xs text-slate-300 truncate">{team.shortName}</span>
    </div>
  );
}

function formatStage(stage: string): string {
  const map: Record<string, string> = {
    GROUP_STAGE: "Grupos", LAST_32: "Dieciseisavos", ROUND_OF_16: "Octavos",
    QUARTER_FINALS: "Cuartos", SEMI_FINALS: "Semis", THIRD_PLACE: "3er puesto", FINAL: "Final",
  };
  return map[stage] ?? stage;
}
