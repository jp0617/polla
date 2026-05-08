"use client";

import { useEffect, useState } from "react";

interface ScoringConfig {
  exactScore: number;
  correctWinner: number;
  correctDraw: number;
  bonusPhaseAdvance: number;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalPoints: number;
  bonusPoints: number;
  manualPoints: number;
  isAdmin: boolean;
  _count: { predictions: number };
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const [scoring, setScoring] = useState<ScoringConfig>({
    exactScore: 5, correctWinner: 3, correctDraw: 1, bonusPhaseAdvance: 2,
  });
  const [scoringSaving, setScoringSaving] = useState(false);
  const [scoringSaved, setScoringSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/scoring").then((r) => r.json()),
    ]).then(([usersData, scoringData]) => {
      setUsers(usersData.users ?? []);
      const initial: Record<string, string> = {};
      for (const u of usersData.users ?? []) initial[u.id] = String(u.manualPoints);
      setEditing(initial);
      if (scoringData.config) setScoring(scoringData.config);
      setLoading(false);
    });
  }, []);

  async function saveScoring() {
    setScoringSaving(true);
    const res = await fetch("/api/admin/scoring", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scoring),
    });
    if (res.ok) {
      setScoringSaved(true);
      setTimeout(() => setScoringSaved(false), 2000);
    }
    setScoringSaving(false);
  }

  async function savePoints(userId: string) {
    const val = parseInt(editing[userId] ?? "0", 10);
    if (isNaN(val)) return;
    setSaving((s) => ({ ...s, [userId]: true }));
    const res = await fetch(`/api/admin/users/${userId}/points`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualPoints: val }),
    });
    if (res.ok) {
      const { user } = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...user } : u)));
      setSaved((s) => ({ ...s, [userId]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [userId]: false })), 2000);
    }
    setSaving((s) => ({ ...s, [userId]: false }));
  }

  if (loading) {
    return <div className="text-center text-slate-400 py-16">Cargando usuarios...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Scoring config */}
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración de puntos</h1>
        <p className="text-slate-400 text-sm mt-1 mb-4">
          Se aplican en la próxima sincronización de resultados.
        </p>
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(
              [
                { key: "exactScore", label: "Marcador exacto" },
                { key: "correctWinner", label: "Ganador correcto" },
                { key: "correctDraw", label: "Empate correcto" },
                { key: "bonusPhaseAdvance", label: "Bonus equipo favorito" },
              ] as { key: keyof ScoringConfig; label: string }[]
            ).map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-slate-400 font-medium">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={scoring[key]}
                    onChange={(e) =>
                      setScoring((s) => ({ ...s, [key]: parseInt(e.target.value) || 0 }))
                    }
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  />
                  <span className="text-slate-400 text-sm">pts</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={saveScoring}
              disabled={scoringSaving}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {scoringSaved ? "✓ Guardado" : scoringSaving ? "Guardando..." : "Guardar puntos"}
            </button>
          </div>
        </div>
      </div>

      {/* Users */}
      <div>
        <h2 className="text-xl font-bold text-white">Usuarios</h2>
        <p className="text-slate-400 text-sm mt-1">
          Ajusta los puntos manuales de cada participante. El total se recalcula automáticamente.
        </p>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-px bg-slate-700">
          {["Jugador", "Pronóst.", "Pred. pts", "Bonus", "Manual", "Total"].map((h) => (
            <div key={h} className="bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-center first:justify-start">
              {h}
            </div>
          ))}
        </div>

        {users.map((user) => {
          const predPoints = user.totalPoints - user.bonusPoints - user.manualPoints;
          return (
            <div
              key={user.id}
              className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-px bg-slate-700"
            >
              {/* Jugador */}
              <div className="bg-slate-800 px-4 py-3">
                <div className="flex items-center gap-2">
                  {user.isAdmin && (
                    <span className="text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded font-medium">
                      admin
                    </span>
                  )}
                  <span className="text-sm text-white font-medium">{user.name}</span>
                </div>
                <div className="text-xs text-slate-500">{user.email}</div>
              </div>

              {/* Pronósticos */}
              <div className="bg-slate-800 px-4 py-3 flex items-center justify-center">
                <span className="text-sm text-slate-300">{user._count.predictions}</span>
              </div>

              {/* Puntos de predicciones */}
              <div className="bg-slate-800 px-4 py-3 flex items-center justify-center">
                <span className="text-sm text-slate-300">{predPoints}</span>
              </div>

              {/* Bonus fase */}
              <div className="bg-slate-800 px-4 py-3 flex items-center justify-center">
                <span className="text-sm text-purple-400">{user.bonusPoints}</span>
              </div>

              {/* Puntos manuales — editable */}
              <div className="bg-slate-800 px-3 py-2 flex items-center justify-center gap-1">
                <input
                  type="number"
                  value={editing[user.id] ?? "0"}
                  onChange={(e) => setEditing((prev) => ({ ...prev, [user.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && savePoints(user.id)}
                  className="w-16 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-center text-white focus:outline-none focus:border-green-500"
                />
                <button
                  onClick={() => savePoints(user.id)}
                  disabled={saving[user.id]}
                  className="text-xs px-2 py-1 rounded bg-green-700 hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  {saved[user.id] ? "✓" : saving[user.id] ? "..." : "OK"}
                </button>
              </div>

              {/* Total */}
              <div className="bg-slate-800 px-4 py-3 flex items-center justify-center">
                <span className="font-bold text-white">{user.totalPoints}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        Total = puntos de predicciones + bonus de fases + puntos manuales
      </p>
    </div>
  );
}
