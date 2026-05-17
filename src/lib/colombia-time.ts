/**
 * Utilidades para mostrar fechas y horas en horario de Colombia (UTC-5, sin DST).
 */

const TZ = "America/Bogota";

/** "19:30" */
export function fmtTime(date: Date | string): string {
  return new Date(date).toLocaleString("es-CO", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "jueves, 11 de junio de 2026" */
export function fmtDateLong(date: Date | string): string {
  return new Date(date).toLocaleString("es-CO", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "jueves, 11 de junio" (sin año) */
export function fmtDateMedium(date: Date | string): string {
  return new Date(date).toLocaleString("es-CO", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "11 jun 2026 · 19:30" */
export function fmtDatetime(date: Date | string): string {
  return new Date(date).toLocaleString("es-CO", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** "YYYY-MM-DD" en horario Colombia — útil como clave para agrupar partidos. */
export function fmtDateKey(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * Rango UTC que corresponde al "hoy" en Colombia.
 * Usa esto para queries de Prisma en vez de calcular con `new Date()` en UTC.
 */
export function todayInColombia(): { start: Date; end: Date } {
  const key = fmtDateKey(new Date()); // "YYYY-MM-DD" en Colombia
  // medianoche Colombia = UTC+5
  const start = new Date(key + "T05:00:00Z");
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
