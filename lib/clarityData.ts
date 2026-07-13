import "server-only";
import type { ClarityInsights, ClarityBehavior } from "./types";
import { cacheGet, cachePut } from "./marketCache";

// ===========================================================================
//  Microsoft Clarity — Data Export API (READ aggregate stats).
//
//  Clarity records sessions client-side and keeps everything on Microsoft's
//  side; the ONLY server-readable signal is this "project-live-insights"
//  endpoint, which returns summary numbers (sessions, distinct users, plus the
//  "smart insight" behaviours: rage clicks, dead clicks, excessive scroll,
//  quick backs, JS errors) for the last 1–3 days.
//
//  Hard limits we design around:
//    • 3 days of history max (numOfDays 1..3)
//    • 10 API calls per project PER DAY
//  So the result is cached in DynamoDB (shared across Lambda instances via
//  lib/marketCache) behind a multi-hour freshness gate — normal operation makes
//  ~4 calls/day, and the gate is on ATTEMPTS so a bad token can't hammer it.
//  Never throws: on any error we serve the last good payload + an error note.
//
//  Gated: no-op (configured:false) until CLARITY_API_TOKEN is set. Generate the
//  token in Clarity → Settings → Data export.
// ===========================================================================

const TOKEN = process.env.CLARITY_API_TOKEN || "";
const ENDPOINT = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const NUM_DAYS = 3;
const CACHE_KEY = "clarity:insights:v1:3d";
const FRESH_MS = 6 * 60 * 60 * 1000; // 6h between API pulls → ≤4/day (limit is 10)
const CACHE_TTL_DAYS = 7; // keep the last-good payload for fallback well past freshness

export interface ClarityResult {
  configured: boolean;
  insights: ClarityInsights | null;
  error?: string;
}

export function clarityConfigured(): boolean {
  return Boolean(TOKEN);
}

// What we persist: the last GOOD insights + when we last ATTEMPTED a pull (the
// attempt time is what the freshness gate keys on, so failures back off too).
interface Cached {
  attemptedAt: number;
  fetchedAt: number;
  data: ClarityInsights | null;
}

// Per-instance memo so two callers in one request (health + payload) don't both
// hit DynamoDB; the DynamoDB layer is what coordinates across instances.
let memo: Cached | null = null;

const num = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : 0;
};

// The API returns an array of { metricName, information: [ row, ... ] }. Asked
// without dimensions, each metric has a single summary row. Field names vary by
// metric, so we read defensively (multiple key aliases, default 0).
interface RawMetric {
  metricName?: string;
  information?: Record<string, unknown>[];
}

// Clarity metricName → our behaviour tile. Only ones the API actually returns
// are kept, so this stays correct if Microsoft adds/removes metrics.
const BEHAVIORS: { metric: string; key: string; label: string }[] = [
  { metric: "RageClickCount", key: "rageClicks", label: "Rage clicks" },
  { metric: "DeadClickCount", key: "deadClicks", label: "Dead clicks" },
  { metric: "ExcessiveScroll", key: "excessiveScroll", label: "Excessive scrolling" },
  { metric: "QuickbackClick", key: "quickBacks", label: "Quick backs" },
  { metric: "ScriptErrorCount", key: "scriptErrors", label: "JS errors" },
  { metric: "ErrorClickCount", key: "errorClicks", label: "Error clicks" },
];

function parse(raw: unknown): ClarityInsights {
  const list: RawMetric[] = Array.isArray(raw) ? (raw as RawMetric[]) : [];
  const byName = new Map<string, Record<string, unknown>>();
  for (const m of list) {
    if (m?.metricName && Array.isArray(m.information) && m.information[0]) {
      byName.set(m.metricName, m.information[0]);
    }
  }
  const traffic = byName.get("Traffic") || {};
  const scroll = byName.get("ScrollDepth") || {};
  const engage = byName.get("EngagementTime") || {};

  const behaviors: ClarityBehavior[] = BEHAVIORS.filter((b) => byName.has(b.metric)).map((b) => {
    const row = byName.get(b.metric) as Record<string, unknown>;
    const pct = num(row.sessionsWithMetricPercentage);
    return {
      key: b.key,
      label: b.label,
      sessions: num(row.sessionsCount ?? row.subTotal),
      pct: pct > 0 ? pct : undefined,
    };
  });

  const engageSec = num(engage.activeTime ?? engage.totalTime);
  return {
    days: NUM_DAYS,
    sessions: num(traffic.totalSessionCount),
    bots: num(traffic.totalBotSessionCount),
    distinctUsers: num(traffic.distinctUserCount),
    pagesPerSession: num(traffic.pagesPerSessionPercentage),
    avgScrollDepth: num(scroll.averageScrollDepth),
    avgEngagementSec: engageSec > 0 ? engageSec : undefined,
    behaviors,
    fetchedAt: new Date().toISOString(),
  };
}

async function readCache(): Promise<Cached | null> {
  if (memo) return memo;
  const c = await cacheGet<Cached>(CACHE_KEY);
  if (c) memo = c;
  return c;
}

/** Cached fetch of Clarity's aggregate stats. Returns configured/insights/error
 *  for the Sources hub. Attempts at most one API call per FRESH_MS window. */
export async function getClarityData(): Promise<ClarityResult> {
  if (!TOKEN) return { configured: false, insights: null };

  const now = Date.now();
  const cached = await readCache();
  // Fresh enough (or we tried recently) → serve what we have, no API call.
  if (cached && now - cached.attemptedAt < FRESH_MS) {
    return { configured: true, insights: cached.data };
  }

  try {
    const r = await fetch(`${ENDPOINT}?numOfDays=${NUM_DAYS}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    if (!r.ok) {
      const body = (await r.text().catch(() => "")).slice(0, 200);
      console.error("[clarity] api", r.status, body);
      const error =
        r.status === 401 || r.status === 403
          ? "Clarity API token was rejected — regenerate it in Clarity → Settings → Data export."
          : r.status === 429
            ? "Clarity's daily export limit (10/day) is reached — showing the last cached numbers."
            : `Clarity API error (${r.status}).`;
      // Record the attempt (so we back off) but keep the last good payload.
      const entry: Cached = { attemptedAt: now, fetchedAt: cached?.fetchedAt ?? 0, data: cached?.data ?? null };
      memo = entry;
      await cachePut(CACHE_KEY, entry, CACHE_TTL_DAYS);
      return { configured: true, insights: cached?.data ?? null, error };
    }
    const data = parse(await r.json());
    const entry: Cached = { attemptedAt: now, fetchedAt: now, data };
    memo = entry;
    await cachePut(CACHE_KEY, entry, CACHE_TTL_DAYS);
    return { configured: true, insights: data };
  } catch (e) {
    console.error("[clarity] fetch error", e);
    const entry: Cached = { attemptedAt: now, fetchedAt: cached?.fetchedAt ?? 0, data: cached?.data ?? null };
    memo = entry;
    await cachePut(CACHE_KEY, entry, CACHE_TTL_DAYS);
    return { configured: true, insights: cached?.data ?? null, error: "Clarity API request failed — showing the last cached numbers." };
  }
}
