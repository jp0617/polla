"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Team {
  id: string;
  name: string;
  crest: string | null;
  code: string;
  takenBy: string | null;
  isOwnTeam: boolean;
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    favoriteTeamId: "",
  });
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/teams")
      .then((r) => r.json())
      .then((d) => setTeams(d.teams ?? []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Error al registrarse");
    } else {
      router.push("/login?registered=1");
    }
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  const available = teams.filter((t) => !t.takenBy);
  const taken = teams.filter((t) => t.takenBy);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-2xl font-bold text-white">Crear cuenta</h1>
          <p className="text-slate-400 mt-1">Únete a la polla del Mundial 2026</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700 space-y-4"
        >
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Field label="Nombre completo">
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="input"
              placeholder="Juan Pérez"
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="input"
              placeholder="tu@email.com"
            />
          </Field>

          <Field label="Teléfono (con código de país)">
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              required
              className="input"
              placeholder="+57 300 123 4567"
            />
          </Field>

          <Field label="Contraseña (mínimo 6 caracteres)">
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              className="input"
              placeholder="••••••••"
            />
          </Field>

          <Field label="Equipo favorito (opcional)">
            <select
              name="favoriteTeamId"
              value={form.favoriteTeamId}
              onChange={handleChange}
              className="input"
            >
              <option value="">— Elige tu equipo —</option>

              {available.length > 0 && (
                <optgroup label="Disponibles">
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </optgroup>
              )}

              {taken.length > 0 && (
                <optgroup label="Ya elegidos">
                  {taken.map((t) => (
                    <option key={t.id} value="" disabled>
                      {t.name} ({t.code}) — {t.takenBy}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Cada equipo solo puede ser elegido por un jugador. Si tu equipo avanza de fase, ganas{" "}
              <span className="text-purple-400 font-medium">+2 puntos</span> automáticamente.
            </p>
          </Field>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-green-800 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? "Registrando..." : "Crear cuenta"}
          </button>

          <p className="text-center text-sm text-slate-400">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/login"
              className="text-green-400 hover:text-green-300 font-medium"
            >
              Inicia sesión
            </Link>
          </p>
        </form>
      </div>

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
        .input:focus {
          ring: 2px solid rgb(34 197 94);
          border-color: transparent;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
