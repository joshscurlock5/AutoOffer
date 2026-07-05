import "server-only";
import type { SiteEvent } from "./types";

// ===========================================================================
//  Aggregates over the first-party event stream — the "every visitor" picture
//  the lead-based dashboard sections can't see (anonymous sessions included).
//  Pure compute over the events scan; consumed by lib/analyticsData.ts.
// ===========================================================================

export interface EventAnalytics {
  totalEvents: number;
  totalSessions: number;
  /** Distinct sessions reaching each offer-funnel stage, in order. */
  funnel: { label: string; count: number }[];
  /** Median minutes between consecutive funnel stages (sessions with both). */
  stepMedianMins: { label: string; mins: number }[];
  /** Form-field friction: who touched a field, and where abandoners stopped. */
  friction: { field: string; focuses: number; abandons: number }[];
  /** form_error counts by reason (invalid_email, missing_mileage, …). */
  errorsByReason: { label: string; count: number }[];
  /** Most frequent event names — a live view of what the tee is capturing. */
  topEvents: { label: string; count: number }[];
}

/** Funnel stages: event name → display label, in journey order. */
const STAGES: { event: string; label: string }[] = [
  { event: "page_view", label: "Visited" },
  { event: "offer_flow_start", label: "Opened offer form" },
  { event: "step1_submitted", label: "Vehicle entered" },
  { event: "details_submitted", label: "Details entered" },
  { event: "contact_started", label: "Reached contact" },
  { event: "contact_engaged", label: "Typing contact info" },
  { event: "generate_lead", label: "Submitted" },
];

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeEventAnalytics(events: SiteEvent[]): EventAnalytics {
  // First occurrence of each event name per session.
  const firstAt = new Map<string, Map<string, string>>(); // sessionId -> (event -> at)
  const nameCounts = new Map<string, number>();
  const fieldFocusSessions = new Map<string, Set<string>>(); // field -> sessions
  const lastFieldBySession = new Map<string, string>(); // session -> last field touched
  const lastFieldTouchAt = new Map<string, string>(); // session -> at of that touch
  const errorCounts = new Map<string, number>();

  for (const e of events) {
    nameCounts.set(e.n, (nameCounts.get(e.n) || 0) + 1);

    let per = firstAt.get(e.sessionId);
    if (!per) {
      per = new Map();
      firstAt.set(e.sessionId, per);
    }
    const prev = per.get(e.n);
    if (!prev || e.at < prev) per.set(e.n, e.at);

    if ((e.n === "field_focus" || e.n === "field_blur") && typeof e.p?.field === "string") {
      const field = e.p.field;
      let set = fieldFocusSessions.get(field);
      if (!set) {
        set = new Set();
        fieldFocusSessions.set(field, set);
      }
      set.add(e.sessionId);
      // Track the LAST field each session touched (events aren't sorted — keep latest at).
      const prevAt = lastFieldTouchAt.get(e.sessionId);
      if (!prevAt || e.at > prevAt) {
        lastFieldTouchAt.set(e.sessionId, e.at);
        lastFieldBySession.set(e.sessionId, field);
      }
    }

    if (e.n === "form_error" && typeof e.p?.reason === "string") {
      errorCounts.set(e.p.reason, (errorCounts.get(e.p.reason) || 0) + 1);
    }
  }

  const funnel = STAGES.map((s) => ({
    label: s.label,
    count: [...firstAt.values()].filter((per) => per.has(s.event)).length,
  }));

  // Median minutes between consecutive stages, over sessions that hit both.
  const stepMedianMins: { label: string; mins: number }[] = [];
  for (let i = 1; i < STAGES.length; i += 1) {
    const a = STAGES[i - 1];
    const b = STAGES[i];
    const gaps: number[] = [];
    for (const per of firstAt.values()) {
      const ta = per.get(a.event);
      const tb = per.get(b.event);
      if (!ta || !tb) continue;
      const mins = (Date.parse(tb) - Date.parse(ta)) / 60000;
      if (Number.isFinite(mins) && mins >= 0 && mins < 24 * 60) gaps.push(mins);
    }
    if (gaps.length) {
      stepMedianMins.push({ label: `${a.label} → ${b.label}`, mins: Math.round(median(gaps) * 10) / 10 });
    }
  }

  // Abandons: sessions that reached the contact step but never submitted,
  // attributed to the last field they touched.
  const abandonsByField = new Map<string, number>();
  for (const [sid, per] of firstAt) {
    if (!per.has("contact_started") || per.has("generate_lead")) continue;
    const field = lastFieldBySession.get(sid);
    if (field) abandonsByField.set(field, (abandonsByField.get(field) || 0) + 1);
  }
  const friction = [...fieldFocusSessions.entries()]
    .map(([field, sessions]) => ({
      field,
      focuses: sessions.size,
      abandons: abandonsByField.get(field) || 0,
    }))
    .sort((a, b) => b.abandons - a.abandons || b.focuses - a.focuses);

  const toCounts = (m: Map<string, number>, limit: number) =>
    [...m.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

  return {
    totalEvents: events.length,
    totalSessions: firstAt.size,
    funnel,
    stepMedianMins,
    friction,
    errorsByReason: toCounts(errorCounts, 12),
    topEvents: toCounts(nameCounts, 15),
  };
}
