"use client";

import { useEffect, useState } from "react";

interface ScoringConfig {
  exactScore: number;
  correctWinner: number;
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

interface InvitationCode {
  id: string;
  code: string;
  label: string | null;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  users: { id: string; name: string; email: string; createdAt: string }[];
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const [scoring, setScoring] = useState<ScoringConfig>({
    exactScore: 5, correctWinner: 3, bonusPhaseAdvance: 2,
  });
  const [scoringSaving, setScoringSaving] = useState(false);
  const [scoringSaved, setScoringSaved] = useState(false);

  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [newCode, setNewCode] = useState({ label: "", maxUses: 1 });
  const [creatingCode, setCreatingCode] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/scoring").then((r) => r.json()),
      fetch("/api/admin/invitation-codes").then((r) => r.json()),
    ]).then(([usersData, scoringData, codesData]) => {
      setUsers(usersData.users ?? []);
      const initial: Record<string, string> = {};
      for (const u of usersData.users ?? []) initial[u.id] = String(u.manualPoints);
      setEditing(initial);
      if (scoringData.config) setScoring(scoringData.config);
      setCodes(codesData.codes ?? []);
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

  async function createCode() {
    setCreatingCode(true);
    const res = await fetch("/api/admin/invitation-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newCode.label || undefined, maxUses: newCode.maxUses }),
    });
    if (res.ok) {
      const { invitationCode } = await res.json();
      setCodes((prev) => [{ ...invitationCode, users: [] }, ...prev]);
      setNewCode({ label: "", maxUses: 1 });
    }
    setCreatingCode(false);
  }

  if (loading) {
    return <div className="text-center text-slate-400 py-16">Cargando...</div>;
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

      {/* Invitation codes */}
      <div>
        <h2 className="text-xl font-bold text-white">Códigos de invitación</h2>
        <p className="text-slate-400 text-sm mt-1 mb-4">
          Genera códigos para que nuevas personas puedan registrarse. Cada código puede tener un límite de usos.
        </p>

        {/* Create new code */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 mb-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Nuevo código</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Etiqueta (opcional)</label>
              <input
                value={newCode.label}
                onChange={(e) => setNewCode((p) => ({ ...p, label: e.target.value }))}
                placeholder="ej. Familia, Trabajo..."
                className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 w-48"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Usos máximos</label>
              <input
                type="number"
                min={1}
                value={newCode.maxUses}
                onChange={(e) => setNewCode((p) => ({ ...p, maxUses: parseInt(e.target.value) || 1 }))}
                className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 w-24"
              />
            </div>
            <button
              onClick={createCode}
              disabled={creatingCode}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
            >
              {creatingCode ? "Generando..." : "Generar código"}
            </button>
          </div>
        </div>

        {/* Codes list */}
        {codes.length === 0 ? (
          <p className="text-slate-500 text-sm">No hay códigos creados aún.</p>
        ) : (
          <div className="space-y-2">
            {codes.map((c) => {
              const expired = c.expiresAt ? new Date(c.expiresAt) < new Date() : false;
              const full = c.uses >= c.maxUses;
              const isExpanded = expandedCode === c.id;
              return (
                <div key={c.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
                  <div
                    className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-slate-750"
                    onClick={() => setExpandedCode(isExpanded ? null : c.id)}
                  >
                    <span className="font-mono text-lg font-bold text-green-400 tracking-widest">
                      {c.code}
                    </span>
                    {c.label && (
                      <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                        {c.label}
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ml-auto ${
                        expired || full
                          ? "bg-red-900 text-red-300"
                          : "bg-green-900 text-green-300"
                      }`}
                    >
                      {expired ? "Expirado" : full ? "Agotado" : "Activo"}
                    </span>
                    <span className="text-sm text-slate-400">
                      {c.uses}/{c.maxUses} usos
                    </span>
                    <span className="text-slate-500 text-xs ml-2">{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-700 px-5 py-3">
                      {c.users.length === 0 ? (
                        <p className="text-slate-500 text-sm">Nadie se ha registrado con este código aún.</p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                            Registrados con este código
                          </p>
                          {c.users.map((u) => (
                            <div key={u.id} className="flex items-center gap-3 text-sm">
                              <span className="text-white font-medium">{u.name}</span>
                              <span className="text-slate-400">{u.email}</span>
                              <span className="text-slate-500 text-xs ml-auto">
                                {new Date(u.createdAt).toLocaleDateString("es-CO")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Users */}
      <div>
        <h2 className="text-xl font-bold text-white">Usuarios</h2>
        <p className="text-slate-400 text-sm mt-1">
          Ajusta los puntos manuales de cada participante. El total se recalcula automáticamente.
        </p>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
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

              <div className="bg-slate-800 px-4 py-3 flex items-center justify-center">
                <span className="text-sm text-slate-300">{user._count.predictions}</span>
              </div>

              <div className="bg-slate-800 px-4 py-3 flex items-center justify-center">
                <span className="text-sm text-slate-300">{predPoints}</span>
              </div>

              <div className="bg-slate-800 px-4 py-3 flex items-center justify-center">
                <span className="text-sm text-purple-400">{user.bonusPoints}</span>
              </div>

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
