import "server-only";
import { EDMONTON, edmontonToUTC, edmontonParts } from "./time";

// Customer self-booking availability. All windows are Mountain Time. `closeMin`
// is the LAST bookable slot start. 45-min slots, up to 14 days out, >=3h notice.
// Multiple bookings are allowed per slot (no cross-lead exclusion) by design.

export const SLOT_MIN = 45;
export const HORIZON_DAYS = 14;
export const MIN_NOTICE_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

// weekday (0=Sun..6=Sat) -> [openMinuteOfDay, lastStartMinuteOfDay]. Sun omitted = closed.
const WINDOWS: Record<number, [number, number]> = {
  1: [8 * 60, 15 * 60 + 30], // Mon  8:00–15:30
  2: [8 * 60, 15 * 60 + 30], // Tue  8:00–15:30
  3: [8 * 60, 18 * 60 + 30], // Wed  8:00–18:30
  4: [8 * 60, 18 * 60 + 30], // Thu  8:00–18:30
  5: [8 * 60, 16 * 60 + 30], // Fri  8:00–16:30
  6: [8 * 60, 14 * 60 + 30], // Sat  8:00–14:30
};

export type Slot = { iso: string; timeLabel: string };
export type DaySlots = { date: string; dateLabel: string; slots: Slot[] };

function timeLabel(h: number, mi: number): string {
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mi).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

/** The next HORIZON_DAYS of bookable days (Edmonton), each with its 45-min slots.
 * Slots earlier than now + MIN_NOTICE are dropped; fully-past/closed days are omitted. */
export function availableDays(nowMs: number): DaySlots[] {
  const cutoff = nowMs + MIN_NOTICE_MS;
  const today = edmontonParts(nowMs);
  const out: DaySlots[] = [];
  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    // Noon anchor `offset` days out, then read its Edmonton calendar date (DST-safe).
    const anchor = edmontonToUTC(today.y, today.mo, today.d, 12, 0).getTime() + offset * DAY_MS;
    const dp = edmontonParts(anchor);
    const win = WINDOWS[dp.weekday];
    if (!win) continue; // closed
    const [openMin, closeMin] = win;
    const slots: Slot[] = [];
    for (let mins = openMin; mins <= closeMin; mins += SLOT_MIN) {
      const h = Math.floor(mins / 60);
      const mi = mins % 60;
      const start = edmontonToUTC(dp.y, dp.mo, dp.d, h, mi);
      if (start.getTime() < cutoff) continue;
      slots.push({ iso: start.toISOString(), timeLabel: timeLabel(h, mi) });
    }
    if (!slots.length) continue;
    const dateLabel = new Date(slots[0].iso).toLocaleDateString("en-CA", {
      timeZone: EDMONTON,
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const date = `${dp.y}-${String(dp.mo).padStart(2, "0")}-${String(dp.d).padStart(2, "0")}`;
    out.push({ date, dateLabel, slots });
  }
  return out;
}

/** True if `iso` is a real slot start: within a window, on the 45-min grid, in the
 * future by >= MIN_NOTICE, and within the horizon. */
export function isValidSlot(iso: string, nowMs: number): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  if (t < nowMs + MIN_NOTICE_MS) return false;
  if (t > nowMs + (HORIZON_DAYS + 1) * DAY_MS) return false;
  const p = edmontonParts(t);
  const win = WINDOWS[p.weekday];
  if (!win) return false;
  const mins = p.h * 60 + p.mi;
  if (mins < win[0] || mins > win[1]) return false;
  if ((mins - win[0]) % SLOT_MIN !== 0) return false;
  // Round-trip guard against odd offsets.
  return Math.abs(edmontonToUTC(p.y, p.mo, p.d, p.h, p.mi).getTime() - t) < 60_000;
}
