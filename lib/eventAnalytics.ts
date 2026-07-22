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
  /** phone_click counts by p.location (top 12) — which "Call" placements get used. */
  phoneClicks: { label: string; count: number }[];
  /** Click→form-load drop-off per placement: cta_click (by p.location) vs
   * offer_flow_start (by p.cta_source) in the same key space. */
  ctaPairs: { label: string; ctaClicks: number; flowStarts: number }[];
  /** Exit-intent popup performance. */
  exitIntent: { shown: number; clicked: number; emailCaptured: number };
  /** Abandoned-form "resume" banner performance. */
  resume: { shown: number; clicked: number };
  /** VIN decode funnel. */
  vin: { submitted: number; failed: number; confirmed: number; rejected: number };
  /** Per-field input behavior from field_timing events (Batch 3): average seconds
   * in the field, total backspaces/retypes, and share filled by paste/autofill. */
  fieldTiming: { field: string; count: number; avgDwellSec: number; corrections: number; pasteAutofillPct: number }[];
  /** Scroll-depth reach on the offer page — scroll_depth events per bucket. */
  scrollDepth: { bucket: string; count: number }[];
  /** Frustration / high-intent micro-signals (raw counts). */
  frustration: { rageClicks: number; tabSwitches: number; copies: number };
  /** Raw event volume per day (Mountain Time), zero-filled — data-health strip. */
  eventsPerDay: { day: string; events: number; sessions: number }[];
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

/** Mountain-Time day bucket key (YYYY-MM-DD). Duplicated from lib/analyticsView.ts's
 * dayKeyMT (not imported) — that module is the client-safe view engine and this
 * one is server-only; importing across would risk a circular/needless coupling
 * for one one-line helper. */
const MT_DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" });
function dayKeyMT(iso: string): string {
  // Hoisted formatter — this runs once per event row across four windows, and
  // constructing an Intl.DateTimeFormat per call costs ~100x the format() itself.
  return MT_DAY_FMT.format(new Date(iso));
}

/** Zero-fill every day between the first and last event, in order. */
function zeroFillEventDays(
  perDay: Map<string, { events: number; sessions: Set<string> }>,
): { day: string; events: number; sessions: number }[] {
  const keys = [...perDay.keys()].sort();
  if (!keys.length) return [];
  const out: { day: string; events: number; sessions: number }[] = [];
  let cur = new Date(keys[0] + "T12:00:00Z");
  const last = new Date(keys[keys.length - 1] + "T12:00:00Z");
  while (cur.getTime() <= last.getTime()) {
    const key = cur.toISOString().slice(0, 10);
    const bucket = perDay.get(key);
    out.push({ day: key, events: bucket?.events || 0, sessions: bucket?.sessions.size || 0 });
    cur = new Date(cur.getTime() + 86_400_000);
  }
  return out;
}

export function computeEventAnalytics(events: SiteEvent[]): EventAnalytics {
  // First occurrence of each event name per session.
  const firstAt = new Map<string, Map<string, string>>(); // sessionId -> (event -> at)
  const nameCounts = new Map<string, number>();
  const fieldFocusSessions = new Map<string, Set<string>>(); // field -> sessions
  const lastFieldBySession = new Map<string, string>(); // session -> last field touched
  const lastFieldTouchAt = new Map<string, string>(); // session -> at of that touch
  const errorCounts = new Map<string, number>();
  const phoneClickCounts = new Map<string, number>(); // p.location -> count
  const ctaClickCounts = new Map<string, number>(); // p.location -> count
  const flowStartCounts = new Map<string, number>(); // p.cta_source -> count
  let exitShown = 0;
  let exitClicked = 0;
  let exitEmailCaptured = 0;
  let resumeShown = 0;
  let resumeClicked = 0;
  let vinSubmitted = 0;
  let vinFailed = 0;
  let vinConfirmed = 0;
  let vinRejected = 0;
  // Batch 3 form-behavior signals.
  const fieldTimingAgg = new Map<string, { count: number; dwellSum: number; corrections: number; pasteAutofill: number }>();
  const scrollDepthCounts = new Map<string, number>();
  let rageClicks = 0;
  let tabSwitches = 0;
  let copies = 0;
  const perDay = new Map<string, { events: number; sessions: Set<string> }>();

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

    // Phone/CTA click→form-load drop-off per placement.
    if (e.n === "phone_click" && typeof e.p?.location === "string") {
      phoneClickCounts.set(e.p.location, (phoneClickCounts.get(e.p.location) || 0) + 1);
    }
    if (e.n === "cta_click" && typeof e.p?.location === "string") {
      ctaClickCounts.set(e.p.location, (ctaClickCounts.get(e.p.location) || 0) + 1);
    }
    if (e.n === "offer_flow_start" && typeof e.p?.cta_source === "string") {
      flowStartCounts.set(e.p.cta_source, (flowStartCounts.get(e.p.cta_source) || 0) + 1);
    }

    // Exit-intent popup.
    if (e.n === "exit_intent_shown") exitShown += 1;
    if (e.n === "exit_intent_clicked") exitClicked += 1;
    if (e.n === "exit_intent_email_captured") exitEmailCaptured += 1;

    // Abandoned-form resume banner.
    if (e.n === "resume_shown") resumeShown += 1;
    if (e.n === "resume_clicked") resumeClicked += 1;

    // VIN decode funnel.
    if (e.n === "vin_submitted") vinSubmitted += 1;
    if (e.n === "vin_failed") vinFailed += 1;
    if (e.n === "vin_confirmed") vinConfirmed += 1;
    if (e.n === "vin_rejected") vinRejected += 1;

    // Batch 3 form-behavior signals.
    if (e.n === "field_timing" && typeof e.p?.field === "string") {
      let agg = fieldTimingAgg.get(e.p.field);
      if (!agg) {
        agg = { count: 0, dwellSum: 0, corrections: 0, pasteAutofill: 0 };
        fieldTimingAgg.set(e.p.field, agg);
      }
      agg.count += 1;
      if (typeof e.p.dwellMs === "number") agg.dwellSum += e.p.dwellMs;
      if (typeof e.p.corrections === "number") agg.corrections += e.p.corrections;
      if (e.p.method === "paste" || e.p.method === "autofill") agg.pasteAutofill += 1;
    }
    if (e.n === "scroll_depth" && e.p?.pct != null) {
      const bucket = String(e.p.pct);
      scrollDepthCounts.set(bucket, (scrollDepthCounts.get(bucket) || 0) + 1);
    }
    if (e.n === "rage_click") rageClicks += 1;
    if (e.n === "tab_switch") tabSwitches += 1;
    if (e.n === "copy_action") copies += 1;

    // Raw volume per day (data-health strip).
    const day = dayKeyMT(e.at);
    let bucket = perDay.get(day);
    if (!bucket) {
      bucket = { events: 0, sessions: new Set() };
      perDay.set(day, bucket);
    }
    bucket.events += 1;
    bucket.sessions.add(e.sessionId);
  }

  // Funnel as "sessions that reached AT LEAST this stage". The offer flow is a
  // linear pipeline, so reaching any stage implies the earlier ones happened —
  // even when the earlier stage's event never fired. That gap is real: a vehicle
  // arriving pre-filled (a deep link / the make-model widget, or a restored
  // in-progress session) skips the manual step and never fires step1_submitted,
  // yet those sessions DO reach details_submitted and beyond. Counting each stage
  // as "fired exactly this event" then made "Vehicle entered" read LOWER than the
  // later "Details entered" — an impossible funnel. So for each session we find
  // the deepest stage it reached and credit every stage up to it. This both
  // backfills history correctly and guarantees a monotonic funnel going forward.
  const stageIndex = new Map(STAGES.map((s, i) => [s.event, i]));
  const reached = new Array(STAGES.length).fill(0);
  for (const per of firstAt.values()) {
    let deepest = -1;
    for (const evt of per.keys()) {
      const idx = stageIndex.get(evt);
      if (idx !== undefined && idx > deepest) deepest = idx;
    }
    for (let i = 0; i <= deepest; i += 1) reached[i] += 1;
  }
  const funnel = STAGES.map((s, i) => ({ label: s.label, count: reached[i] }));

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

  // Click→form-load drop-off per placement: cta_click (by p.location) paired
  // with offer_flow_start (by p.cta_source) in the same key space.
  const ctaKeys = new Set([...ctaClickCounts.keys(), ...flowStartCounts.keys()]);
  const ctaPairs = [...ctaKeys]
    .map((label) => ({
      label,
      ctaClicks: ctaClickCounts.get(label) || 0,
      flowStarts: flowStartCounts.get(label) || 0,
    }))
    .sort((a, b) => b.ctaClicks - a.ctaClicks)
    .slice(0, 12);

  const fieldTiming = [...fieldTimingAgg.entries()]
    .map(([field, a]) => ({
      field,
      count: a.count,
      avgDwellSec: a.count ? Math.round((a.dwellSum / a.count / 1000) * 10) / 10 : 0,
      corrections: a.corrections,
      pasteAutofillPct: a.count ? Math.round((a.pasteAutofill / a.count) * 100) : 0,
    }))
    .sort((a, b) => b.avgDwellSec - a.avgDwellSec);
  const scrollDepth = ["25", "50", "75", "100"]
    .filter((b) => scrollDepthCounts.has(b))
    .map((bucket) => ({ bucket, count: scrollDepthCounts.get(bucket) || 0 }));

  return {
    totalEvents: events.length,
    totalSessions: firstAt.size,
    funnel,
    stepMedianMins,
    friction,
    errorsByReason: toCounts(errorCounts, 12),
    topEvents: toCounts(nameCounts, 15),
    phoneClicks: toCounts(phoneClickCounts, 12),
    ctaPairs,
    exitIntent: { shown: exitShown, clicked: exitClicked, emailCaptured: exitEmailCaptured },
    resume: { shown: resumeShown, clicked: resumeClicked },
    vin: { submitted: vinSubmitted, failed: vinFailed, confirmed: vinConfirmed, rejected: vinRejected },
    fieldTiming,
    scrollDepth,
    frustration: { rageClicks, tabSwitches, copies },
    eventsPerDay: zeroFillEventDays(perDay),
  };
}
