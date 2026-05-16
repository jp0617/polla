"use client";

import { useEffect, useRef, useState } from "react";

interface ScoringConfig {
  exactScore: number;
  correctWinner: number;
  correctDraw: number;
  bonusPhaseAdvance: number;
  championBonus: number;
  lockMinutes: number;
  championTeamId: string | null;
  championBonusGiven: boolean;
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
  admin: { id: string; name: string; email: string } | null;
  users: { id: string; name: string; email: string; createdAt: string }[];
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const [scoring, setScoring] = useState<ScoringConfig>({
    exactScore: 5, correctWinner: 3, correctDraw: 2, bonusPhaseAdvance: 2, championBonus: 10, lockMinutes: 5,
    championTeamId: null, championBonusGiven: false,
  });
  const [championTeamId, setChampionTeamId] = useState("");
  const [awardingChampion, setAwardingChampion] = useState(false);
  const [championResult, setChampionResult] = useState<string | null>(null);
  const [scoringSaving, setScoringSaving] = useState(false);
  const [scoringSaved, setScoringSaved] = useState(false);

  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [newCode, setNewCode] = useState({ label: "", maxUses: 1 });
  const [creatingCode, setCreatingCode] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [savingAdmin, setSavingAdmin] = useState<Record<string, boolean>>({});
  const [deletingCode, setDeletingCode] = useState<Record<string, boolean>>({});

  const [teams, setTeams] = useState<{ id: string; name: string; crest: string | null }[]>([]);

  const [waConnected, setWaConnected] = useState(false);
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waPolling, setWaPolling] = useState(false);
  const [sendingResults, setSendingResults] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null);
  const waIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/scoring").then((r) => r.json()),
      fetch("/api/admin/invitation-codes").then((r) => r.json()),
      fetch("/api/teams").then((r) => r.json()),
    ]).then(([usersData, scoringData, codesData, teamsData]) => {
      setUsers(usersData.users ?? []);
      const initial: Record<string, string> = {};
      for (const u of usersData.users ?? []) initial[u.id] = String(u.manualPoints);
      setEditing(initial);
      if (scoringData.config) {
        setScoring({ exactScore: 5, correctWinner: 3, correctDraw: 2, bonusPhaseAdvance: 2, championBonus: 10, lockMinutes: 5, championTeamId: null, championBonusGiven: false, ...scoringData.config });
        setChampionTeamId(scoringData.config.championTeamId ?? "");
      }
      setCodes(codesData.codes ?? []);
      setTeams(teamsData.teams ?? []);
      setLoading(false);
    });
  }, []);

  async function pollWaStatus() {
    const res = await fetch("/api/whatsapp/status");
    if (!res.ok) return;
    const data = await res.json();
    setWaConnected(data.connected);
    setWaQr(data.qr ?? null);
    return data.connected as boolean;
  }

  function startWaPolling() {
    if (waIntervalRef.current) return;
    setWaPolling(true);
    pollWaStatus();
    waIntervalRef.current = setInterval(async () => {
      const connected = await pollWaStatus();
      if (connected) stopWaPolling();
    }, 4000);
  }

  function stopWaPolling() {
    if (waIntervalRef.current) {
      clearInterval(waIntervalRef.current);
      waIntervalRef.current = null;
    }
    setWaPolling(false);
  }

  async function sendDailyResults() {
    setSendingResults(true);
    setSendResult(null);
    const res = await fetch("/api/notifications/daily", { method: "POST", body: JSON.stringify({}) });
    if (res.ok) {
      const data = await res.json();
      setSendResult({ sent: data.sent, failed: data.failed });
    }
    setSendingResults(false);
  }

  async function awardChampion() {
    if (!championTeamId) return;
    setAwardingChampion(true);
    setChampionResult(null);
    const res = await fetch("/api/admin/champion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: championTeamId }),
    });
    const data = await res.json();
    if (res.ok) {
      setChampionResult(`✓ ${data.team} declarado campeón · ${data.awarded} usuario(s) recibieron +${scoring.championBonus} pts`);
      setScoring((s) => ({ ...s, championBonusGiven: true, championTeamId }));
    } else {
      setChampionResult(`Error: ${data.error}`);
    }
    setAwardingChampion(false);
  }

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

  async function deleteCode(codeId: string) {
    setDeletingCode((s) => ({ ...s, [codeId]: true }));
    const res = await fetch(`/api/admin/invitation-codes/${codeId}`, { method: "DELETE" });
    if (res.ok) {
      setCodes((prev) => prev.filter((c) => c.id !== codeId));
      // Recargar usuarios porque algunos fueron eliminados junto al código
      const usersData = await fetch("/api/admin/users").then((r) => r.json());
      setUsers(usersData.users ?? []);
      const initial: Record<string, string> = {};
      for (const u of usersData.users ?? []) initial[u.id] = String(u.manualPoints);
      setEditing(initial);
    } else {
      const data = await res.json();
      alert(data.error ?? "Error al eliminar");
    }
    setDeletingCode((s) => ({ ...s, [codeId]: false }));
  }

  async function setCodeAdmin(codeId: string, adminId: string | null) {
    setSavingAdmin((s) => ({ ...s, [codeId]: true }));
    const res = await fetch(`/api/admin/invitation-codes/${codeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId }),
    });
    if (res.ok) {
      const { code } = await res.json();
      setCodes((prev) => prev.map((c) => (c.id === codeId ? { ...c, admin: code.admin } : c)));
    }
    setSavingAdmin((s) => ({ ...s, [codeId]: false }));
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
      {/* WhatsApp */}
      <div>
        <h2 className="text-xl font-bold text-white">WhatsApp</h2>
        <p className="text-slate-400 text-sm mt-1 mb-4">
          Conecta tu WhatsApp para enviar notificaciones a los participantes.
        </p>
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 flex flex-col gap-4">
          {/* Estado */}
          <div className="flex items-center gap-3">
            <span
              className={`w-3 h-3 rounded-full shrink-0 ${waConnected ? "bg-green-500" : "bg-slate-500"}`}
            />
            <span className="text-sm text-slate-300">
              {waConnected ? "Conectado" : waPolling ? "Esperando escaneo del QR..." : "Desconectado"}
            </span>
            <div className="ml-auto flex gap-2">
              {!waConnected && (
                <button
                  onClick={waPolling ? stopWaPolling : startWaPolling}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                >
                  {waPolling ? "Cancelar" : "Conectar"}
                </button>
              )}
              {waConnected && (
                <button
                  onClick={startWaPolling}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
                >
                  Verificar
                </button>
              )}
            </div>
          </div>

          {/* QR */}
          {waQr && !waConnected && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-xs text-slate-400">
                Abrí WhatsApp → Dispositivos vinculados → Vincular un dispositivo y escanea el QR
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={waQr} alt="QR WhatsApp" className="w-52 h-52 rounded-xl border border-slate-600" />
            </div>
          )}

          {/* Enviar resultados */}
          {waConnected && (
            <div className="border-t border-slate-700 pt-4 flex items-center gap-4">
              <div>
                <p className="text-sm font-medium text-white">Resultados del día</p>
                <p className="text-xs text-slate-400">
                  Envía un resumen de puntos de hoy a todos los participantes.
                </p>
              </div>
              <button
                onClick={sendDailyResults}
                disabled={sendingResults}
                className="ml-auto px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                {sendingResults ? "Enviando..." : "Enviar ahora"}
              </button>
            </div>
          )}
          {sendResult && (
            <p className="text-xs text-slate-400">
              Enviados: <span className="text-green-400">{sendResult.sent}</span>
              {sendResult.failed > 0 && (
                <> · Fallidos: <span className="text-red-400">{sendResult.failed}</span></>
              )}
            </p>
          )}
        </div>
      </div>

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
                { key: "exactScore" as const, label: "Marcador exacto" },
                { key: "correctWinner" as const, label: "Ganador correcto" },
                { key: "correctDraw" as const, label: "Empate correcto" },
                { key: "bonusPhaseAdvance" as const, label: "Bonus fase" },
                { key: "championBonus" as const, label: "Bonus campeón" },
                { key: "lockMinutes" as const, label: "Cierre antes del partido" },
              ] as { key: "exactScore" | "correctWinner" | "correctDraw" | "bonusPhaseAdvance" | "championBonus" | "lockMinutes"; label: string }[]
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
                  <span className="text-slate-400 text-sm">{key === "lockMinutes" ? "min" : "pts"}</span>
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

      {/* Campeón */}
      <div>
        <h2 className="text-xl font-bold text-white">Campeón del torneo</h2>
        <p className="text-slate-400 text-sm mt-1 mb-4">
          Declara el equipo campeón para otorgar el bonus de {scoring.championBonus} pts a sus fanáticos. Esta acción solo se puede ejecutar una vez.
        </p>
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-4">
          {scoring.championBonusGiven ? (
            <p className="text-green-400 font-medium">
              ✓ Bonus de campeón ya otorgado a los fanáticos de {teams.find((t) => t.id === scoring.championTeamId)?.name ?? "—"}
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Equipo campeón</label>
                <select
                  value={championTeamId}
                  onChange={(e) => setChampionTeamId(e.target.value)}
                  className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500 w-56"
                >
                  <option value="">— Seleccionar equipo —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => {
                  if (confirm(`¿Declarar campeón a ${teams.find((t) => t.id === championTeamId)?.name}? Se otorgarán ${scoring.championBonus} pts. Esta acción no se puede deshacer.`)) {
                    awardChampion();
                  }
                }}
                disabled={!championTeamId || awardingChampion}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
              >
                {awardingChampion ? "Otorgando..." : "🏆 Declarar campeón"}
              </button>
            </div>
          )}
          {championResult && (
            <p className="text-sm text-slate-300">{championResult}</p>
          )}
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const msg = c.users.length > 0
                          ? `¿Eliminar este código? Se eliminarán también los ${c.users.length} usuario(s) registrados con él y todos sus pronósticos.`
                          : "¿Eliminar este código?";
                        if (confirm(msg)) deleteCode(c.id);
                      }}
                      disabled={deletingCode[c.id]}
                      className="text-xs px-2 py-0.5 rounded bg-red-900 hover:bg-red-800 text-red-300 disabled:opacity-50 transition-colors"
                    >
                      {deletingCode[c.id] ? "..." : "Eliminar"}
                    </button>
                    <span className="text-slate-500 text-xs ml-2">{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-700 px-5 py-3 space-y-4">
                      {/* Admin selector */}
                      <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                          Admin del grupo
                        </p>
                        {c.users.length === 0 ? (
                          <p className="text-slate-500 text-sm">Sin participantes aún.</p>
                        ) : (
                          <div className="flex items-center gap-3">
                            <select
                              defaultValue={c.admin?.id ?? ""}
                              onChange={(e) => setCodeAdmin(c.id, e.target.value || null)}
                              disabled={savingAdmin[c.id]}
                              className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-green-500 disabled:opacity-50"
                            >
                              <option value="">— Sin admin —</option>
                              {c.users.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name} ({u.email})
                                </option>
                              ))}
                            </select>
                            {savingAdmin[c.id] && (
                              <span className="text-xs text-slate-400">Guardando...</span>
                            )}
                            {c.admin && (
                              <span className="text-xs text-green-400">
                                Admin actual: {c.admin.name}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Members list */}
                      {c.users.length === 0 ? (
                        <p className="text-slate-500 text-sm">Nadie se ha registrado con este código aún.</p>
                      ) : (
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                            Registrados con este código
                          </p>
                          <div className="space-y-2">
                            {c.users.map((u) => (
                              <div key={u.id} className="flex items-center gap-3 text-sm">
                                <span className="text-white font-medium">{u.name}</span>
                                <span className="text-slate-400">{u.email}</span>
                                {c.admin?.id === u.id && (
                                  <span className="text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded">
                                    admin
                                  </span>
                                )}
                                <span className="text-slate-500 text-xs ml-auto">
                                  {new Date(u.createdAt).toLocaleDateString("es-CO")}
                                </span>
                              </div>
                            ))}
                          </div>
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
