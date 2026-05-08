import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Polla Mundialista 2026",
  description: "Predice los resultados del Mundial 2026",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full">
      <body className={`${inter.className} min-h-full bg-slate-900 text-slate-100`}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
