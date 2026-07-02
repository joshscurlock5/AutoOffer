import "server-only";

// Mountain-Time helpers (the business is in Edmonton). These let us read/emit
// wall-clock times in America/Edmonton regardless of the server's own UTC clock,
// using the Intl offset trick — no tz library needed.

export const EDMONTON = "America/Edmonton";

/** Offset (ms) of a timezone from UTC at a given instant. */
export function tzOffsetMs(tz: string, ms: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === "24" ? 0 : +p.hour, +p.minute, +p.second);
  return asUTC - ms;
}

/** Convert an Edmonton wall-clock (year, month 1-12, day, hour, minute) to a UTC Date. */
export function edmontonToUTC(y: number, mo: number, d: number, h: number, mi: number): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(guess - tzOffsetMs(EDMONTON, guess));
}

/** Parse "YYYY-MM-DD HH:MM" as an Edmonton wall clock -> a UTC Date (or null). */
export function parseEdmonton(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +m[4], +m[5]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const dt = edmontonToUTC(y, mo, d, h, mi);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

/** Edmonton-local calendar/clock parts of an instant (weekday 0=Sun..6=Sat). */
export function edmontonParts(ms: number): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  weekday: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: EDMONTON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value;
  const wk: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: +p.year,
    mo: +p.month,
    d: +p.day,
    h: p.hour === "24" ? 0 : +p.hour,
    mi: +p.minute,
    weekday: wk[p.weekday] ?? 0,
  };
}

/** Format an ISO instant in Edmonton time with the given options. */
export function formatEdmonton(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString("en-CA", { timeZone: EDMONTON, ...opts });
}
