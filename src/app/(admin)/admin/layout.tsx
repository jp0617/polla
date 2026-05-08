import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    redirect("/dashboard");
  }
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-4 flex items-center gap-3">
        <span className="text-xl">⚙️</span>
        <span className="font-bold text-white">Panel de administración</span>
        <a href="/dashboard" className="ml-auto text-sm text-slate-400 hover:text-white">
          ← Volver al inicio
        </a>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
