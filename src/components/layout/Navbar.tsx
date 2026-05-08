"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const navItems = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/matches", label: "Partidos" },
  { href: "/standings", label: "Clasificación" },
  { href: "/history", label: "Mis Pronósticos" },
  { href: "/profile", label: "Perfil" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <nav className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-2xl">⚽</span>
            <span className="font-bold text-lg text-white">Polla 2026</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? "bg-green-600 text-white"
                    : "text-slate-300 hover:text-white hover:bg-slate-700"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {session?.user?.isAdmin && (
              <Link
                href="/admin"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-purple-600 text-white"
                    : "text-purple-400 hover:text-white hover:bg-purple-700"
                }`}
              >
                Admin
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3">
            {session?.user && (
              <span className="text-sm text-slate-400 hidden md:block">
                {session.user.name}
              </span>
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex gap-1 pb-2 overflow-x-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pathname === item.href
                  ? "bg-green-600 text-white"
                  : "text-slate-300 bg-slate-700"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {session?.user?.isAdmin && (
            <Link
              href="/admin"
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pathname.startsWith("/admin")
                  ? "bg-purple-600 text-white"
                  : "text-purple-400 bg-slate-700"
              }`}
            >
              Admin
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
