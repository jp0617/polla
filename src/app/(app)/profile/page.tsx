"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Team {
  id: string;
  name: string;
  crest: string | null;
  code: string;
  takenBy: string | null;
  isOwnTeam: boolean;
}
interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string;
  totalPoints: number;
  bonusPoints: number;
  favoriteTeam: { id: string; name: string; crest: string | null; code: string } | null;
  stats: { exactScores: number; correctWinners: number };
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.isAdmin;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", favoriteTeamId: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifResult, setNotifResult] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  function loadData() {
    Promise.all([
      fetch("/api/profile").then((r) => r.json()),
      fetch("/api/teams").then((r) => r.json()),
    ]).then(([p, t]) => {
      setProfile(p);
      setTeams(t.teams ?? []);
      setForm({
        name: p.name,
        phone: p.phone,
        favoriteTeamId: p.favoriteTeam?.id ?? "",
      });
    });
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaveError("");
    setSaving(true);

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setSaveError(data.error || "Error al guardar");
      return;
    }

    setSuccess(true);
    setEditing(false);
    loadData();
    setTimeout(() => setSuccess(false), 3000);
  }

  async function sendDailyResults() {
    setNotifLoading(true);
    setNotifResult(null);
    const res = await fetch("/api/notifications/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setNotifLoading(false);
    setNotifResult(`Enviados: ${data.sent} · Fallidos: ${data.failed}`);
  }

  if (!profile) {
    return (
      <div className="text-center text-slate-400 py-16">Cargando perfil...</div>
    );
  }

  const availableTeams = teams.filter((t) => !t.takenBy || t.isOwnTeam);
  const takenTeams = teams.filter((t) => t.takenBy && !t.isOwnTeam);

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
          <MiniStat label="Bonus" value={profile.bonusPoints} />
        </div>
      </div>

      {/* Favorite team */}
      {profile.favoriteTeam ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 flex items-center gap-3">
          {profile.favoriteTeam.crest && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.favoriteTeam.crest}
              alt=""
              className="w-12 h-12 object-contain"
            />
          )}
          <div>
            <p className="text-xs text-slate-400">Tu equipo favorito</p>
            <p className="font-semibold text-white">{profile.favoriteTeam.name}</p>
            <p className="text-xs text-purple-400">
              +{profile.bonusPoints} puntos de bonus ganados
            </p>
          </div>
          <div className="ml-auto bg-green-900/50 border border-green-700 text-green-300 text-xs px-2 py-1 rounded-full">
            🔒 Reservado
          </div>
        </div>
      ) : (
        <div className="bg-slate-800/50 rounded-xl border border-dashed border-slate-600 p-4 text-center">
          <p className="text-slate-400 text-sm">No tienes equipo favorito seleccionado</p>
          <p className="text-xs text-slate-500 mt-1">
            Elige uno para ganar +2 pts cada vez que avance de fase
          </p>
        </div>
      )}

      {/* Edit form */}
      {success && (
        <div className="bg-green-900/50 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-sm">
          ✓ Perfil actualizado correctamente
        </div>
      )}

      {editing ? (
        <form
          onSubmit={saveProfile}
          className="bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-4"
        >
          <h3 className="font-semibold text-white">Editar perfil</h3>

          {saveError && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
              {saveError}
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-300 mb-1">Nombre</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Teléfono</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Equipo favorito
            </label>
            <select
              value={form.favoriteTeamId}
              onChange={(e) =>
                setForm((f) => ({ ...f, favoriteTeamId: e.target.value }))
              }
              className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">— Sin equipo favorito —</option>

              {availableTeams.length > 0 && (
                <optgroup label="Disponibles">
                  {availableTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                      {t.isOwnTeam ? " — tu equipo actual" : ""}
                    </option>
                  ))}
                </optgroup>
              )}

              {takenTeams.length > 0 && (
                <optgroup label="Ya elegidos por otros">
                  {takenTeams.map((t) => (
                    <option key={t.id} value="" disabled>
                      {t.name} ({t.code}) — {t.takenBy}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Cada equipo puede ser elegido por un solo jugador.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white py-2 rounded-lg font-medium transition-colors"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setSaveError("");
              }}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-lg font-medium transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 py-3 rounded-xl font-medium transition-colors"
        >
          ✏️ Editar perfil
        </button>
      )}

      {/* WhatsApp notifications — solo admin */}
      {isAdmin && <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 space-y-3">
        <h3 className="font-semibold text-white">Notificaciones WhatsApp</h3>
        <p className="text-sm text-slate-400">
          Envía un resumen de resultados del día a todos los participantes vía WhatsApp.
        </p>
        <button
          onClick={sendDailyResults}
          disabled={notifLoading}
          className="w-full bg-green-700 hover:bg-green-600 disabled:bg-green-900 text-white py-2.5 rounded-lg font-medium transition-colors"
        >
          {notifLoading ? "Enviando..." : "📱 Enviar resultados del día"}
        </button>
        {notifResult && (
          <p className="text-sm text-slate-300 text-center">{notifResult}</p>
        )}
      </div>}
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
