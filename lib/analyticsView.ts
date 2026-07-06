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

/** Recompute every chart from a (filtered) profile set. */
export function computeView(profiles: Profile[]): View {
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

  const funnel: Count[] = [
    { label: "People", count: profiles.length },
    { label: "Leads", count: leadsP.length },
    { label: "Offers", count: leadsP.filter((p) => p.offer).length },
    { label: "Bookings", count: leadsP.filter((p) => p.appointmentAt || p.stage === "scheduled" || p.stage === "closed").length },
    { label: "Closed", count: closedP.length },
  ];

  // Leads over time by day (whatever range the filter leaves).
  const dayMap = new Map<string, number>();
  for (const p of leadsP) {
    const t = p.createdAt ? Date.parse(p.createdAt) : NaN;
    if (Number.isFinite(t)) {
      const d = new Date(t).toISOString().slice(0, 10);
      dayMap.set(d, (dayMap.get(d) || 0) + 1);
    }
  }
  const overTime = [...dayMap.entries()].map(([date, leads]) => ({ date, leads })).sort((a, b) => a.date.localeCompare(b.date));

  // Day×hour heatmap of lead creation (owner's local time).
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const p of leadsP) {
    const t = p.createdAt ? new Date(p.createdAt) : null;
    if (t && Number.isFinite(t.getTime())) heatmap[t.getDay()][t.getHours()] += 1;
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
