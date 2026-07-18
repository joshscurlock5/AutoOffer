import "server-only";
import type { MetaSnapshot } from "./types";

// ===========================================================================
//  Comprehensive Meta Marketing API reader — the DAILY, ALL-COLUMN, MULTI-LEVEL
//  companion to lib/metaAds.ts (which stays as the dashboard's live per-preset
//  reader). This module pulls day-by-day insights (time_increment=1) across
//  account / campaign / adset / ad levels plus demographic & placement
//  breakdowns, flattens Meta's container arrays (actions / action_values /
//  cost_per_action_type / conversions / video_*) into keyed columns, and shapes
//  them into MetaSnapshot rows for the daily-sync cron to persist.
//
//  Gated + resilient like metaAds.ts: no-ops until META_MARKETING_TOKEN +
//  META_AD_ACCOUNT_ID are set, never throws, returns a {rows, error} so the
//  caller can record health. Field list is deliberately a single exported
//  constant so it can be trimmed to whatever the account's API tier actually
//  serves (see scripts/probe-meta-fields.mjs).
// ===========================================================================

const TOKEN = process.env.META_MARKETING_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const API_VERSION = "v21.0";
const API = `https://graph.facebook.com/${API_VERSION}`;
const PAGE_CAP = 25; // safety cap on paging (25 * up-to-500 rows)

export function metaInsightsConfigured(): boolean {
  return Boolean(TOKEN && ACCOUNT);
}
function acct(): string {
  return ACCOUNT!.startsWith("act_") ? ACCOUNT! : `act_${ACCOUNT}`;
}

// --- level → the id/name dimension fields valid at that level ----------------
type Level = "account" | "campaign" | "adset" | "ad";
const DIMENSION_FIELDS: Record<Level, string[]> = {
  account: ["account_id", "account_name"],
  campaign: ["account_id", "account_name", "campaign_id", "campaign_name"],
  adset: ["account_id", "campaign_id", "campaign_name", "adset_id", "adset_name"],
  ad: ["campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name"],
};

// --- metric fields ----------------------------------------------------------
// FULL set for the no-breakdown pulls. Every column that carries data for a
// website-lead advertiser. Container arrays (actions/action_values/…) are
// requested once here and expanded into per-action columns. Trim this list to
// the probe-validated set if any field is rejected by the account's API tier.
export const FULL_METRIC_FIELDS = [
  // delivery / cost
  "spend", "impressions", "reach", "frequency", "cpm",
  // clicks
  "clicks", "ctr", "cpc",
  "inline_link_clicks", "inline_link_click_ctr", "cost_per_inline_link_click",
  "outbound_clicks", "outbound_clicks_ctr", "cost_per_outbound_click",
  "website_ctr",
  // engagement
  "inline_post_engagement", "cost_per_inline_post_engagement",
  // quality diagnostics
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
  // config (constant per entity, handy on rows)
  "objective", "optimization_goal", "buying_type", "attribution_setting",
  // conversion containers (expanded to per-action columns)
  "actions", "action_values", "cost_per_action_type",
  "conversions", "conversion_values", "cost_per_conversion",
  // video
  "video_play_actions", "video_thruplay_watched_actions", "cost_per_thruplay",
  "video_p25_watched_actions", "video_p50_watched_actions",
  "video_p75_watched_actions", "video_p100_watched_actions",
  "video_avg_time_watched_actions",
];

// REDUCED set for breakdown pulls — Meta disallows several field/breakdown combos
// (video & unique metrics can't cross some breakdowns; region/dma don't carry
// off-Meta action metrics). Keep breakdown rows to universally-safe columns.
export const BREAKDOWN_METRIC_FIELDS = [
  "spend", "impressions", "reach", "frequency",
  "clicks", "ctr", "cpc", "inline_link_clicks", "inline_link_click_ctr",
  "actions", "action_values", "cost_per_action_type",
];

// --- breakdowns we snapshot daily -------------------------------------------
interface BreakdownDef { key: string; params: string; levels: Level[] }
export const BREAKDOWNS: BreakdownDef[] = [
  { key: "none", params: "", levels: ["account", "campaign", "adset", "ad"] },
  { key: "age", params: "age", levels: ["campaign"] },
  { key: "gender", params: "gender", levels: ["campaign"] },
  { key: "region", params: "region", levels: ["campaign"] },
  { key: "placement", params: "publisher_platform,platform_position", levels: ["campaign"] },
  { key: "device", params: "impression_device", levels: ["campaign"] },
];

// --- raw Meta row shape (loose — Meta returns strings + arrays) --------------
interface Pair { action_type: string; value: string }
type RawRow = Record<string, unknown>;

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function firstPairValue(v: unknown): number | undefined {
  if (Array.isArray(v) && v.length && typeof v[0] === "object") return num((v[0] as Pair).value);
  return undefined;
}

// Container arrays expand into `${prefix}.${action_type}` metric keys.
const CONTAINERS: { field: string; prefix: string }[] = [
  { field: "actions", prefix: "action" },
  { field: "action_values", prefix: "value" },
  { field: "cost_per_action_type", prefix: "cpa" },
  { field: "conversions", prefix: "conv" },
  { field: "conversion_values", prefix: "conv_value" },
  { field: "cost_per_conversion", prefix: "cost_per_conv" },
];
// Video "…_watched_actions" arrays collapse to a single number under a clean key.
const VIDEO_SINGLE: Record<string, string> = {
  video_play_actions: "video_plays",
  video_thruplay_watched_actions: "video_thruplay",
  video_p25_watched_actions: "video_p25",
  video_p50_watched_actions: "video_p50",
  video_p75_watched_actions: "video_p75",
  video_p100_watched_actions: "video_p100",
  video_avg_time_watched_actions: "video_avg_secs",
};
const SCALAR_STRINGS = new Set([
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
  "objective", "optimization_goal", "buying_type", "attribution_setting",
]);

/** Flatten one raw Meta row into a flat metrics map (numbers + a few labels). */
function flatten(raw: RawRow): Record<string, number | string | null> {
  const m: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k in VIDEO_SINGLE) { const n = firstPairValue(v); if (n !== undefined) m[VIDEO_SINGLE[k]] = n; continue; }
    const container = CONTAINERS.find((c) => c.field === k);
    if (container) {
      if (Array.isArray(v)) for (const p of v as Pair[]) { const n = num(p.value); if (n !== undefined) m[`${container.prefix}.${p.action_type}`] = n; }
      continue;
    }
    if (SCALAR_STRINGS.has(k)) { if (typeof v === "string" && v) m[k] = v; continue; }
    if (["date_start", "date_stop", "account_id", "account_name", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
      "age", "gender", "region", "publisher_platform", "platform_position", "impression_device"].includes(k)) continue; // dimensions handled separately
    const n = num(v);
    if (n !== undefined) m[k] = n;
  }
  return m;
}

function entityOf(level: Level, raw: RawRow): { id: string; name: string } {
  switch (level) {
    case "account": return { id: String(raw.account_id || ""), name: String(raw.account_name || "Account") };
    case "campaign": return { id: String(raw.campaign_id || ""), name: String(raw.campaign_name || "(unnamed)") };
    case "adset": return { id: String(raw.adset_id || ""), name: String(raw.adset_name || "(unnamed)") };
    case "ad": return { id: String(raw.ad_id || ""), name: String(raw.ad_name || "(unnamed)") };
  }
}
function breakdownValueOf(key: string, raw: RawRow): string {
  switch (key) {
    case "none": return "none";
    case "age": return String(raw.age || "unknown");
    case "gender": return String(raw.gender || "unknown");
    case "region": return String(raw.region || "unknown");
    case "device": return String(raw.impression_device || "unknown");
    case "placement": return `${raw.publisher_platform || "?"}/${raw.platform_position || "?"}`;
    default: return "none";
  }
}

const THREE_YEARS_SECS = 3 * 365 * 24 * 3600;

/** Fetch one (level × breakdown) daily-bucketed pull and return MetaSnapshot rows.
 * Best-effort: returns {rows, error}. `error` is a short string when Meta rejected
 * the call (so the caller can surface health) — rows is [] in that case. */
export async function fetchSnapshotSlice(
  level: Level,
  bd: BreakdownDef,
  since: string,
  until: string,
  syncedAt: string,
): Promise<{ rows: MetaSnapshot[]; error?: string }> {
  if (!metaInsightsConfigured()) return { rows: [], error: "not configured" };
  const fields = [
    ...DIMENSION_FIELDS[level],
    "date_start", "date_stop",
    ...(bd.key === "none" ? FULL_METRIC_FIELDS : BREAKDOWN_METRIC_FIELDS),
  ].join(",");
  const base =
    `${API}/${acct()}/insights?level=${level}` +
    `&time_increment=1&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
    (bd.params ? `&breakdowns=${encodeURIComponent(bd.params)}` : "") +
    `&fields=${encodeURIComponent(fields)}&limit=500`;
  let url: string = `${base}&access_token=${encodeURIComponent(TOKEN!)}`;
  const raws: RawRow[] = [];
  try {
    let page = 0;
    while (url && page < PAGE_CAP) {
      const r = await fetch(url);
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        let msg = `HTTP ${r.status}`;
        try { const j = JSON.parse(body); if (j?.error?.message) msg = `${j.error.message} (code ${j.error.code})`; } catch { /* non-JSON */ }
        console.error(`[meta-insights] ${level}/${bd.key} non-OK`, r.status, body.slice(0, 300));
        return { rows: [], error: msg.slice(0, 220) };
      }
      const j = (await r.json()) as { data?: RawRow[]; paging?: { next?: string } };
      raws.push(...(j.data || []));
      url = j.paging?.next || "";
      page += 1;
    }
  } catch (e) {
    console.error(`[meta-insights] ${level}/${bd.key} fetch failed`, e);
    return { rows: [], error: String(e).slice(0, 220) };
  }
  const rows: MetaSnapshot[] = raws.map((raw) => {
    const date = String(raw.date_start || "").slice(0, 10);
    const { id, name } = entityOf(level, raw);
    const bv = breakdownValueOf(bd.key, raw);
    const metrics = flatten(raw);
    return {
      pk: `${level}#${bd.key}`,
      sk: `${date}#${id}#${bv}`,
      level,
      date,
      entityId: id,
      entityName: name,
      campaignId: raw.campaign_id ? String(raw.campaign_id) : undefined,
      campaignName: raw.campaign_name ? String(raw.campaign_name) : undefined,
      adsetId: raw.adset_id ? String(raw.adset_id) : undefined,
      adsetName: raw.adset_name ? String(raw.adset_name) : undefined,
      breakdownKey: bd.key,
      breakdownValue: bv,
      spend: num(raw.spend) || 0,
      metrics,
      syncedAt,
      ttl: Math.floor(Date.parse(syncedAt) / 1000) + THREE_YEARS_SECS,
    };
  }).filter((row) => row.date && row.entityId);
  return { rows };
}

/** Build the full set of daily snapshots for a date window across every
 * configured level × breakdown. Returns all rows plus any per-slice errors.
 * Sequential (one slice at a time) to stay well under Meta's rate budget. */
export async function buildDailySnapshots(
  since: string,
  until: string,
  syncedAt: string,
): Promise<{ rows: MetaSnapshot[]; errors: string[]; slices: number }> {
  const all: MetaSnapshot[] = [];
  const errors: string[] = [];
  let slices = 0;
  for (const bd of BREAKDOWNS) {
    for (const level of bd.levels) {
      slices += 1;
      const { rows, error } = await fetchSnapshotSlice(level as Level, bd, since, until, syncedAt);
      if (error) errors.push(`${level}/${bd.key}: ${error}`);
      all.push(...rows);
    }
  }
  return { rows: all, errors, slices };
}
