"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { teamName } from "@/lib/team-names";

interface Team {
  id: string;
  name: string;
  crest: string | null;
  code: string;
  takenBy: string | null;
  isOwnTeam: boolean;
}

interface Membership {
  id: string;
  bonusPoints: number;
  invitationCode: { id: string; code: string; label: string | null };
  favoriteTeam: { id: string; name: string; crest: string | null; code: string } | null;
  championPick: { id: string; name: string; crest: string | null; code: string } | null;
}

interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalPoints: number;
  predictionPoints: number;
  manualPoints: number;
  bonusPoints: number;
  memberships: Membership[];
  stats: { exactScores: number; correctWinners: number };
  adminOfCode: { id: string; label: string | null } | null;
  tournamentStarted: boolean;
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState(false);

  // Edit name/phone
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ name: "", phone: "" });

  // Edit membership (favorite/champion per group)
  const [editingMembership, setEditingMembership] = useState<string | null>(null);
  const [membershipForm, setMembershipForm] = useState({ favoriteTeamId: "", championPickId: "" });

  // Join new group
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [joinForm, setJoinForm] = useState({ invitationCode: "", favoriteTeamId: "", championPickId: "" });
  const [joinTeams, setJoinTeams] = useState<Team[]>([]);
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const [notifLoading, setNotifLoading] = useState(false);
  const [notifResult, setNotifResult] = useState<string | null>(null);
  const [waConnected, setWaConnected] = useState(false);
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waPolling, setWaPolling] = useState(false);
  const waIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Group admin rules
  const [groupRules, setGroupRules] = useState<{
    allowDraws: boolean;
    exactScore: number | null;
    correctWinner: number | null;
    correctDraw: number | null;
    bonusPhaseAdvance: number | null;
    lockMinutes: number | null;
  } | null>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesMsg, setRulesMsg] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Load teams when join code changes
  useEffect(() => {
    const code = joinForm.invitationCode.trim();
    if (code.length !== 9) { setJoinTeams([]); return; }
    const url = `/api/teams?invitationCode=${encodeURIComponent(code)}`;
    fetch(url).then((r) => r.json()).then((d) => setJoinTeams(d.teams ?? [])).catch(() => {});
  }, [joinForm.invitationCode]);

  function loadData() {
    Promise.all([
      fetch("/api/profile").then((r) => r.json()),
      fetch("/api/teams").then((r) => r.json()),
    ]).then(([p, t]) => {
      setProfile(p);
      setTeams(t.teams ?? []);
      setInfoForm({ name: p.name, phone: p.phone });
      if (p.adminOfCode?.id) {
        setRulesLoading(true);
        fetch(`/api/group-admin/${p.adminOfCode.id}`)
          .then((r) => r.json())
          .then((d) => setGroupRules({
            allowDraws: d.allowDraws ?? true,
            exactScore: d.exactScore ?? null,
            correctWinner: d.correctWinner ?? null,
            correctDraw: d.correctDraw ?? null,
            bonusPhaseAdvance: d.bonusPhaseAdvance ?? null,
            lockMinutes: d.lockMinutes ?? null,
          }))
          .finally(() => setRulesLoading(false));
      }
    });
  }

  async function saveGroupRules(update: Record<string, unknown>) {
    if (!profile?.adminOfCode?.id) return;
    setRulesSaving(true); setRulesMsg(null);
    const res = await fetch(`/api/group-admin/${profile.adminOfCode.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    setRulesSaving(false);
    if (!res.ok) { setRulesMsg("Error al guardar"); return; }
    const d = await res.json();
    setGroupRules({
      allowDraws: d.allowDraws ?? true,
      exactScore: d.exactScore ?? null,
      correctWinner: d.correctWinner ?? null,
      correctDraw: d.correctDraw ?? null,
      bonusPhaseAdvance: d.bonusPhaseAdvance ?? null,
      lockMinutes: d.lockMinutes ?? null,
    });
    setRulesMsg("Guardado");
    setTimeout(() => setRulesMsg(null), 2500);
  }

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(""); setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: infoForm.name, phone: infoForm.phone }),
    });
    setSaving(false);
    if (!res.ok) { setSaveError((await res.json()).error || "Error al guardar"); return; }
    setSuccess(true); setEditingInfo(false); loadData();
    setTimeout(() => setSuccess(false), 3000);
  }

  function startEditMembership(m: Membership) {
    setEditingMembership(m.id);
    setMembershipForm({
      favoriteTeamId: m.favoriteTeam?.id ?? "",
      championPickId: m.championPick?.id ?? "",
    });
    setSaveError("");
  }

  async function saveMembership(e: React.FormEvent) {
    e.preventDefault();
    if (!editingMembership) return;
    setSaveError(""); setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        membershipId: editingMembership,
        favoriteTeamId: membershipForm.favoriteTeamId || null,
        championPickId: membershipForm.championPickId || null,
      }),
    });
    setSaving(false);
    if (!res.ok) { setSaveError((await res.json()).error || "Error al guardar"); return; }
    setSuccess(true); setEditingMembership(null); loadData();
    setTimeout(() => setSuccess(false), 3000);
  }

  async function joinGroup(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(""); setJoining(true);
    const res = await fetch("/api/memberships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invitationCode: joinForm.invitationCode,
        favoriteTeamId: joinForm.favoriteTeamId || undefined,
        championPickId: joinForm.championPickId || undefined,
      }),
    });
    setJoining(false);
    if (!res.ok) { setJoinError((await res.json()).error || "Error al unirse"); return; }
    setJoiningGroup(false);
    setJoinForm({ invitationCode: "", favoriteTeamId: "", championPickId: "" });
    loadData();
  }

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
    if (waIntervalRef.current) { clearInterval(waIntervalRef.current); waIntervalRef.current = null; }
    setWaPolling(false);
  }

  async function sendDailyResults() {
    setNotifLoading(true); setNotifResult(null);
    const res = await fetch("/api/notifications/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json();
    setNotifLoading(false);
    setNotifResult(`Enviados: ${data.sent} · Fallidos: ${data.failed}`);
  }

  if (!profile) {
    return <div className="text-center text-slate-400 py-16">Cargando perfil...</div>;
  }

  const allTeams = teams;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Mi Perfil</h1>

      {/* Stats card */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-green-700 rounded-full flex items-center justify-center text-2xl font-bold text-white">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{profile.name}</h2>
            <p className="text-slate-400 text-sm">{profile.email}</p>
            <p className="text-slate-400 text-sm">{profile.phone}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-6">
          <MiniStat label="Puntos" value={profile.totalPoints} />
          <MiniStat label="Exactos" value={profile.stats.exactScores} />
          <MiniStat label="Bonus total" value={profile.bonusPoints} />
        </div>
      </div>

      {success && (
        <div className="bg-green-900/50 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-sm">
          ✓ Guardado correctamente
        </div>
      )}

      {/* Edit name/phone */}
      {editingInfo ? (
        <form onSubmit={saveInfo} className="bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-4">
          <h3 className="font-semibold text-white">Editar información</h3>
          {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
          <Field label="Nombre">
            <input value={infoForm.name} onChange={(e) => setInfoForm((f) => ({ ...f, name: e.target.value }))} className="input" />
          </Field>
          <Field label="Teléfono">
            <input value={infoForm.phone} onChange={(e) => setInfoForm((f) => ({ ...f, phone: e.target.value }))} className="input" />
          </Field>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white py-2 rounded-lg font-medium">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditingInfo(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg font-medium">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setEditingInfo(true)} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 py-3 rounded-xl font-medium">
          ✏️ Editar nombre y teléfono
        </button>
      )}

      {/* Memberships */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Mis grupos</h2>

        {profile.memberships.length === 0 && (
          <p className="text-slate-400 text-sm">No perteneces a ningún grupo aún.</p>
        )}

        {profile.memberships.map((m) => (
          <div key={m.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            {/* Group header */}
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <div>
                <span className="font-mono font-bold text-green-400 tracking-widest text-sm">{m.invitationCode.code}</span>
                {m.invitationCode.label && (
                  <span className="ml-2 text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">{m.invitationCode.label}</span>
                )}
              </div>
              <span className="text-xs text-purple-400">+{m.bonusPoints} bonus</span>
            </div>

            <div className="p-4 space-y-3">
              {/* Favorite team */}
              {m.favoriteTeam ? (
                <div className="flex items-center gap-3">
                  {m.favoriteTeam.crest && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.favoriteTeam.crest} alt="" className="w-8 h-8 object-contain" />
                  )}
                  <div>
                    <p className="text-xs text-slate-400">Equipo favorito</p>
                    <p className="text-sm font-semibold text-white">{teamName(m.favoriteTeam.name)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Sin equipo favorito</p>
              )}

              {/* Champion pick */}
              {m.championPick ? (
                <div className="flex items-center gap-3">
                  {m.championPick.crest && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.championPick.crest} alt="" className="w-8 h-8 object-contain" />
                  )}
                  <div>
                    <p className="text-xs text-slate-400">Pronóstico de campeón 🏆</p>
                    <p className="text-sm font-semibold text-white">{teamName(m.championPick.name)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Sin pronóstico de campeón</p>
              )}

              {/* Edit membership */}
              {editingMembership === m.id ? (
                <form onSubmit={saveMembership} className="space-y-3 pt-2 border-t border-slate-700">
                  {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
                  <Field label="Equipo favorito">
                    <select value={membershipForm.favoriteTeamId} onChange={(e) => setMembershipForm((f) => ({ ...f, favoriteTeamId: e.target.value }))} className="input">
                      <option value="">— Sin equipo favorito —</option>
                      {allTeams.map((t) => (
                        <option key={t.id} value={t.id}>{teamName(t.name)} ({t.code})</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Pronóstico de campeón 🏆">
                    <select value={membershipForm.championPickId} onChange={(e) => setMembershipForm((f) => ({ ...f, championPickId: e.target.value }))} className="input">
                      <option value="">— Sin pronóstico —</option>
                      {allTeams.map((t) => (
                        <option key={t.id} value={t.id}>{teamName(t.name)} ({t.code})</option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving} className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white py-1.5 rounded-lg text-sm font-medium">
                      {saving ? "Guardando..." : "Guardar"}
                    </button>
                    <button type="button" onClick={() => { setEditingMembership(null); setSaveError(""); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-1.5 rounded-lg text-sm font-medium">
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => startEditMembership(m)} className="text-xs text-slate-400 hover:text-slate-200 underline">
                  Cambiar favorito / campeón
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Join new group */}
        {joiningGroup ? (
          <form onSubmit={joinGroup} className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
            <h3 className="font-semibold text-white text-sm">Unirse a un grupo</h3>
            {joinError && <p className="text-red-400 text-sm">{joinError}</p>}
            <Field label="Código de invitación">
              <input
                value={joinForm.invitationCode}
                onChange={(e) => setJoinForm((f) => ({ ...f, invitationCode: e.target.value }))}
                className="input uppercase tracking-widest"
                placeholder="XXXX-XXXX"
                maxLength={9}
                required
              />
            </Field>
            <Field label="Equipo favorito en este grupo (opcional)">
              <select value={joinForm.favoriteTeamId} onChange={(e) => setJoinForm((f) => ({ ...f, favoriteTeamId: e.target.value }))} className="input">
                <option value="">— Elige tu equipo —</option>
                {(joinTeams.length > 0 ? joinTeams : allTeams).map((t) => (
                  <option key={t.id} value={t.id}>{teamName(t.name)} ({t.code})</option>
                ))}
              </select>
            </Field>
            <Field label="Pronóstico de campeón 🏆 (opcional)">
              <select value={joinForm.championPickId} onChange={(e) => setJoinForm((f) => ({ ...f, championPickId: e.target.value }))} className="input">
                <option value="">— Elige el campeón —</option>
                {(joinTeams.length > 0 ? joinTeams : allTeams).map((t) => (
                  <option key={t.id} value={t.id}>{teamName(t.name)} ({t.code})</option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2">
              <button type="submit" disabled={joining} className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white py-2 rounded-lg text-sm font-medium">
                {joining ? "Uniéndose..." : "Unirse al grupo"}
              </button>
              <button type="button" onClick={() => { setJoiningGroup(false); setJoinError(""); setJoinForm({ invitationCode: "", favoriteTeamId: "", championPickId: "" }); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg text-sm font-medium">
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setJoiningGroup(true)} className="w-full border border-dashed border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-200 py-3 rounded-xl text-sm transition-colors">
            + Unirse a otro grupo
          </button>
        )}
      </div>

      {/* WhatsApp — admin global o admin de grupo */}
      {(isAdmin || profile?.adminOfCode) && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-white">WhatsApp</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              {profile?.adminOfCode
                ? `Grupo: ${profile.adminOfCode.label ?? profile.adminOfCode.id}`
                : "Todos los participantes"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full shrink-0 ${waConnected ? "bg-green-500" : "bg-slate-500"}`} />
            <span className="text-sm text-slate-300">
              {waConnected ? "Conectado" : waPolling ? "Esperando escaneo del QR..." : "Desconectado"}
            </span>
            <div className="ml-auto">
              {!waConnected ? (
                <button onClick={waPolling ? stopWaPolling : startWaPolling} className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors">
                  {waPolling ? "Cancelar" : "Conectar"}
                </button>
              ) : (
                <button onClick={startWaPolling} className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors">
                  Verificar
                </button>
              )}
            </div>
          </div>
          {waQr && !waConnected && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-slate-400 text-center">
                Abrí WhatsApp → Dispositivos vinculados → Vincular un dispositivo
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={waQr} alt="QR WhatsApp" className="w-52 h-52 rounded-xl border border-slate-600" />
            </div>
          )}
          {waConnected && (
            <div className="border-t border-slate-700 pt-4">
              <button onClick={sendDailyResults} disabled={notifLoading} className="w-full bg-green-700 hover:bg-green-600 disabled:bg-green-900 text-white py-2.5 rounded-lg font-medium transition-colors">
                {notifLoading ? "Enviando..." : "📱 Enviar resultados del día"}
              </button>
              {notifResult && <p className="text-sm text-slate-300 text-center mt-2">{notifResult}</p>}
            </div>
          )}
        </div>
      )}

      {/* Group admin rules panel */}
      {profile.adminOfCode && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-5">
          <div>
            <h3 className="font-semibold text-white">Reglas del grupo</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              {profile.adminOfCode.label ?? profile.adminOfCode.id} · Los valores en blanco usan la configuración global.
            </p>
          </div>
          {rulesLoading ? (
            <p className="text-sm text-slate-400">Cargando...</p>
          ) : groupRules ? (
            <div className="space-y-4">
              {/* Puntajes */}
              <div className="grid grid-cols-2 gap-3">
                <GroupScoreField
                  label="Marcador exacto"
                  placeholder="5"
                  value={groupRules.exactScore}
                  onSave={(v) => saveGroupRules({ exactScore: v })}
                  disabled={rulesSaving}
                />
                <GroupScoreField
                  label="Ganador correcto"
                  placeholder="3"
                  value={groupRules.correctWinner}
                  onSave={(v) => saveGroupRules({ correctWinner: v })}
                  disabled={rulesSaving}
                />
                <GroupScoreField
                  label="Empate correcto"
                  placeholder="2"
                  value={groupRules.correctDraw}
                  onSave={(v) => saveGroupRules({ correctDraw: v })}
                  disabled={rulesSaving || !groupRules.allowDraws}
                />
                <GroupScoreField
                  label="Bonus fase (favorito)"
                  placeholder="2"
                  value={groupRules.bonusPhaseAdvance}
                  onSave={(v) => saveGroupRules({ bonusPhaseAdvance: v })}
                  disabled={rulesSaving}
                />
              </div>

              {/* Toggle empates */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-700">
                <div>
                  <p className="text-sm font-medium text-white">Empates suman puntos</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {groupRules.allowDraws ? "Activo" : "Desactivado — los empates no puntúan"}
                  </p>
                </div>
                <button
                  onClick={() => saveGroupRules({ allowDraws: !groupRules.allowDraws })}
                  disabled={rulesSaving}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                    groupRules.allowDraws ? "bg-green-600" : "bg-slate-600"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${groupRules.allowDraws ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {rulesMsg && <p className="text-xs text-green-400">{rulesMsg}</p>}
            </div>
          ) : null}
        </div>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          background: rgb(15 23 42);
          border: 1px solid rgb(71 85 105);
          color: white;
          border-radius: 0.5rem;
          padding: 0.625rem 1rem;
          outline: none;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 rounded-lg p-3 text-center">
      <div className="text-xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function GroupScoreField({
  label,
  placeholder,
  value,
  onSave,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: number | null;
  onSave: (v: number | null) => void;
  disabled?: boolean;
}) {
  const [local, setLocal] = React.useState(value !== null ? String(value) : "");

  React.useEffect(() => {
    setLocal(value !== null ? String(value) : "");
  }, [value]);

  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        max={100}
        placeholder={placeholder}
        value={local}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const parsed = local === "" ? null : parseInt(local, 10);
          if (!isNaN(parsed as number) || parsed === null) onSave(parsed);
        }}
        className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-40"
      />
    </div>
  );
}
