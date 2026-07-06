import type { Profile } from "./types";

// ===========================================================================
//  Client-safe analytics view engine (PURE — no server imports, no "server-only").
//  The dashboard loads all profiles once, then filters + recomputes every chart
//  here, instantly, as the filter bar changes. Keeps the server light and the UI
//  snappy. All inputs are already-computed Profiles (see lib/profiles.ts).
// ===========================================================================

export interface Filters {
  dateFrom?: string; // YYYY-MM-DD (inclusive)
  dateTo?: string; // YYYY-MM-DD (inclusive)
  country?: string;
  region?: string;
  source?: string;
  device?: string;
  stage?: string;
  contactMethod?: string;
  make?: string;
  /** Lead-score band: hot (70+), warm (40–69), cool (<40). */
  scoreBand?: string;
}

/** Score → band, one place so the badge, filter and segments agree. */
export function scoreBand(score: number): "hot" | "warm" | "cool" {
  return score >= 70 ? "hot" : score >= 40 ? "warm" : "cool";
}

export type Count = { label: string; count: number };

export interface View {
  totals: {
    people: number;
    leads: number;
    partials: number;
    closed: number;
    cashPaidOut: number;
    revenue: number;
    margin: number;
    medianResponseMins: number | null;
    /** Share (rounded %) of first-responded leads answered within 5 minutes. */
    pctUnder5Min: number | null;
  };
  funnel: Count[];
  /** Same funnel as raw counts, keyed by stage — for callers that want a value
   * without matching on the `label` string. */
  funnelByRank: { leads: number; contacted: number; offerSent: number; booked: number; closed: number };
  overTime: { date: string; leads: number }[];
  bySource: Count[];
  byCampaign: Count[];
  byStatus: Count[];
  byCountry: Count[];
  byRegion: Count[];
  byDevice: Count[];
  byMake: Count[];
  byContactMethod: Count[];
  /** [dayOfWeek 0=Sun..6][hour 0..23] = lead counts, for the activity heatmap. */
  heatmap: number[][];
}

export interface FilterOptions {
  countries: string[];
  regions: string[];
  sources: string[];
  devices: string[];
  stages: string[];
  contactMethods: string[];
  makes: string[];
  scoreBands: string[];
}

const isRealLead = (p: Profile): boolean => p.hasRealLead;

/** Mountain-Time day bucket key (YYYY-MM-DD) for a UTC ISO timestamp — so "leads
 * over time" and the heatmap group by the owner's actual day, not UTC's. */
export function dayKeyMT(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });
}

/** Mountain-Time weekday (0=Sun..6) + hour (0..23) for the activity heatmap. */
function weekdayHourMT(iso: string): { day: number; hour: number } | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hourStr = parts.find((p) => p.type === "hour")?.value;
  const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = weekday ? WEEKDAYS[weekday] : undefined;
  // hour12:false can format midnight as "24" in some ICU builds — normalize.
  let hour = hourStr ? parseInt(hourStr, 10) : NaN;
  if (hour === 24) hour = 0;
  if (day === undefined || !Number.isFinite(hour)) return null;
  return { day, hour };
}

/** Fill every missing day between `from` and `to` (both YYYY-MM-DD, MT) with 0. */
function zeroFillDays(dayMap: Map<string, number>, from?: string, to?: string): { date: string; leads: number }[] {
  const keys = [...dayMap.keys()].sort();
  const start = from || keys[0];
  const end = to || keys[keys.length - 1];
  if (!start || !end) return [];
  const out: { date: string; leads: number }[] = [];
  // Step day-by-day using UTC-noon anchors so DST transitions can't skip/repeat a day.
  let cur = new Date(start + "T12:00:00Z");
  const last = new Date(end + "T12:00:00Z");
  while (cur.getTime() <= last.getTime()) {
    const key = cur.toISOString().slice(0, 10);
    out.push({ date: key, leads: dayMap.get(key) || 0 });
    cur = new Date(cur.getTime() + 86_400_000);
  }
  return out;
}

/** Standard even/odd median of a numeric list (undefined when empty). */
function median(ns: number[]): number | null {
  if (!ns.length) return null;
  const sorted = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function topCounts(labels: (string | undefined)[], limit = 12): Count[] {
  const m = new Map<string, number>();
  for (const l of labels) {
    const k = (l || "").trim();
    if (!k) continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Distinct filter values across ALL profiles (so any value is selectable). */
export function computeFilterOptions(profiles: Profile[]): FilterOptions {
  const uniq = (xs: (string | undefined)[]) =>
    [...new Set(xs.map((x) => (x || "").trim()).filter(Boolean))].sort();
  return {
    countries: uniq(profiles.map((p) => p.geo?.country)),
    regions: uniq(profiles.map((p) => p.geo?.region)),
    sources: uniq(profiles.map((p) => p.source)),
    devices: uniq(profiles.map((p) => p.device?.type)),
    stages: uniq(profiles.map((p) => p.stage)),
    contactMethods: uniq(profiles.map((p) => p.contactMethod)),
    makes: uniq(profiles.map((p) => p.make)),
    scoreBands: ["hot", "warm", "cool"],
  };
}

/** Apply the filter bar to the profile set. */
export function filterProfiles(profiles: Profile[], f: Filters): Profile[] {
  const from = f.dateFrom ? Date.parse(f.dateFrom + "T00:00:00") : null;
  const to = f.dateTo ? Date.parse(f.dateTo + "T23:59:59") : null;
  return profiles.filter((p) => {
    if (from != null || to != null) {
      const t = p.createdAt ? Date.parse(p.createdAt) : NaN;
      if (!Number.isFinite(t)) return false;
      if (from != null && t < from) return false;
      if (to != null && t > to) return false;
    }
    if (f.country && p.geo?.country !== f.country) return false;
    if (f.region && p.geo?.region !== f.region) return false;
    if (f.source && p.source !== f.source) return false;
    if (f.device && p.device?.type !== f.device) return false;
    if (f.stage && p.stage !== f.stage) return false;
    if (f.contactMethod && p.contactMethod !== f.contactMethod) return false;
    if (f.make && p.make !== f.make) return false;
    if (f.scoreBand && scoreBand(p.score) !== f.scoreBand) return false;
    return true;
  });
}

/** Recompute every chart from a (filtered) profile set. `dateBounds` (from the
 * active date filter, when set) anchors the zero-fill range; otherwise it spans
 * the data's own first..last day. */
export function computeView(profiles: Profile[], dateBounds?: { dateFrom?: string; dateTo?: string }): View {
  const leadsP = profiles.filter(isRealLead);
  const partials = profiles.filter((p) => p.stage === "partial");
  const closedP = profiles.filter((p) => p.stage === "closed");
  const cashPaidOut = closedP.reduce((s, p) => s + (p.cashPaidOut || 0), 0);
  const revenue = closedP.reduce((s, p) => s + (p.revenue || 0), 0);
  const margin = closedP.reduce((s, p) => s + (p.margin || 0), 0);

  const latencies = profiles
    .map((p) => p.firstResponseMins)
    .filter((m): m is number => typeof m === "number" && m >= 0);
  const medianResponseMins = median(latencies);
  const pctUnder5Min = latencies.length
    ? Math.round((latencies.filter((m) => m <= 5).length / latencies.length) * 100)
    : null;

  // Canonical monotonic lead funnel (audit B4): rank each hasRealLead profile by
  // the FURTHEST stage it has ever reached, then count profiles whose max rank
  // is >= k. Monotonic by construction — never dips below the stage before it.
  let rank1 = 0; // Lead (always true for hasRealLead profiles)
  let rank2 = 0; // Contacted
  let rank3 = 0; // Offer sent
  let rank4 = 0; // Booked
  let rank5 = 0; // Closed
  for (const p of leadsP) {
    let r = 1;
    if (p.contactedAt || p.offerSentAt || p.stage === "contacted" || p.stage === "scheduled" || p.stage === "closed") r = 2;
    if (p.offer || p.offerSentAt) r = Math.max(r, 3);
    if (p.scheduledAt || p.appointmentAt || p.stage === "scheduled" || p.stage === "closed") r = Math.max(r, 4);
    if (p.stage === "closed" || p.closedAt) r = Math.max(r, 5);
    if (r >= 1) rank1 += 1;
    if (r >= 2) rank2 += 1;
    if (r >= 3) rank3 += 1;
    if (r >= 4) rank4 += 1;
    if (r >= 5) rank5 += 1;
  }
  const funnel: Count[] = [
    { label: "Leads", count: rank1 },
    { label: "Contacted", count: rank2 },
    { label: "Offer sent", count: rank3 },
    { label: "Booked", count: rank4 },
    { label: "Closed", count: rank5 },
  ];
  const funnelByRank = { leads: rank1, contacted: rank2, offerSent: rank3, booked: rank4, closed: rank5 };

  // Leads over time by day, Mountain Time, zero-filled across the range.
  const dayMap = new Map<string, number>();
  for (const p of leadsP) {
    if (p.createdAt) {
      const d = dayKeyMT(p.createdAt);
      dayMap.set(d, (dayMap.get(d) || 0) + 1);
    }
  }
  const overTime = zeroFillDays(dayMap, dateBounds?.dateFrom, dateBounds?.dateTo);

  // Day×hour heatmap of lead creation, Mountain Time.
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const p of leadsP) {
    if (!p.createdAt) continue;
    const wh = weekdayHourMT(p.createdAt);
    if (wh) heatmap[wh.day][wh.hour] += 1;
  }

  return {
    totals: {
      people: profiles.length,
      leads: leadsP.length,
      partials: partials.length,
      closed: closedP.length,
      cashPaidOut,
      revenue,
      margin,
      medianResponseMins,
      pctUnder5Min,
    },
    funnel,
    funnelByRank,
    overTime,
    bySource: topCounts(profiles.map((p) => p.source)),
    byCampaign: topCounts(profiles.map((p) => p.attribution?.utmCampaign)),
    byStatus: topCounts(profiles.map((p) => p.stage), 8),
    byCountry: topCounts(profiles.map((p) => p.geo?.country)),
    byRegion: topCounts(profiles.map((p) => p.geo?.region)),
    byDevice: topCounts(profiles.map((p) => p.device?.type)),
    byMake: topCounts(profiles.map((p) => p.make)),
    byContactMethod: topCounts(profiles.map((p) => p.contactMethod)),
    heatmap,
  };
}

// ---- Segment Performance: compare outcomes across any dimension ----------------

export const SEGMENT_DIMENSIONS = [
  { key: "source", label: "Source" },
  { key: "campaign", label: "Campaign" },
  { key: "device", label: "Device" },
  { key: "country", label: "Country" },
  { key: "region", label: "Province/Region" },
  { key: "make", label: "Vehicle make" },
  { key: "contactMethod", label: "Contact method" },
  { key: "stage", label: "Stage" },
] as const;

export type SegmentDimension = (typeof SEGMENT_DIMENSIONS)[number]["key"];

export interface SegmentRow {
  group: string;
  people: number;
  leads: number;
  offers: number;
  closed: number;
  closeRate: number; // % of leads that closed
  avgOffer: number;
  margin: number;
  medianResponseMins: number | null;
  /** Average lead score across the group's people. */
  avgScore: number;
}

function dimValue(p: Profile, dim: SegmentDimension): string {
  switch (dim) {
    case "source":
      return p.source || "Direct";
    case "campaign":
      return p.attribution?.utmCampaign || "(untagged)";
    case "device":
      return p.device?.type || "unknown";
    case "country":
      return p.geo?.country || "Unknown";
    case "region":
      return p.geo?.region || "Unknown";
    case "make":
      return p.make || "(none)";
    case "contactMethod":
      return p.contactMethod || "unknown";
    case "stage":
      return p.stage;
    default:
      return "—";
  }
}

/** Group the (filtered) profiles by `dim` and compute each group's outcomes. */
export function segmentTable(profiles: Profile[], dim: SegmentDimension): SegmentRow[] {
  const groups = new Map<string, Profile[]>();
  for (const p of profiles) {
    const k = dimValue(p, dim);
    const arr = groups.get(k);
    if (arr) arr.push(p);
    else groups.set(k, [p]);
  }
  const rows: SegmentRow[] = [];
  for (const [group, ps] of groups) {
    const leadsP = ps.filter(isRealLead);
    const offers = leadsP.filter((p) => p.offer);
    const closed = ps.filter((p) => p.stage === "closed");
    const margin = closed.reduce((s, p) => s + (p.margin || 0), 0);
    const offerMids = offers.map((p) => p.offerMid || 0).filter((n) => n > 0);
    const avgOffer = offerMids.length ? Math.round(offerMids.reduce((a, b) => a + b, 0) / offerMids.length) : 0;
    const lat = ps.map((p) => p.firstResponseMins).filter((m): m is number => typeof m === "number" && m >= 0);
    const medianResponseMins = median(lat);
    const avgScore = Math.round(ps.reduce((s, p) => s + (p.score || 0), 0) / ps.length);
    rows.push({
      group,
      people: ps.length,
      leads: leadsP.length,
      offers: offers.length,
      closed: closed.length,
      closeRate: leadsP.length ? Math.round((closed.length / leadsP.length) * 100) : 0,
      avgOffer,
      margin,
      medianResponseMins,
      avgScore,
    });
  }
  return rows.sort((a, b) => b.people - a.people);
}
