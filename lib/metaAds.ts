import "server-only";
import type { AdInsight, AdInsightAd } from "./types";
import type { ConnectorHealth } from "./dataSources";

// ===========================================================================
//  Meta Marketing API — read-only ad performance (spend / impressions / clicks
//  per campaign). Joined to first-party leads BY CAMPAIGN NAME on the dashboard
//  (the utm_campaign={{campaign.name}} tag on the ads makes lead.attribution
//  match campaign_name), giving true cost-per-lead + ROAS.
//
//  Gated: a no-op returning [] until META_MARKETING_TOKEN + META_AD_ACCOUNT_ID
//  are set, so it ships dormant. Never throws. Short in-memory cache so a page
//  refresh doesn't hammer the API. Needs only `ads_read`.
// ===========================================================================

const TOKEN = process.env.META_MARKETING_TOKEN;
const ACCOUNT = process.env.META_AD_ACCOUNT_ID;
const API = "https://graph.facebook.com/v21.0";
const TTL_MS = 10 * 60 * 1000;

export function metaAdsConfigured(): boolean {
  return Boolean(TOKEN && ACCOUNT);
}

// Meta returns per-action-type breakdowns as arrays; a website "Lead" appears
// under one of these action types (they all carry the same count). We read the
// first present so our number matches Ads Manager's "Website leads".
interface MetaAction { action_type: string; value: string }
const LEAD_ACTION_TYPES = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_web_lead"];
function pickAction(arr: MetaAction[] | undefined, types: string[]): number | undefined {
  if (!arr) return undefined;
  for (const t of types) {
    const hit = arr.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return undefined;
}

let cache: { at: number; range: string; data: AdInsight[] } | null = null;
let adCache: { at: number; range: string; data: AdInsightAd[] } | null = null;

// Last outcome of the campaign-insights fetch — surfaced to the Sources health
// hub so a blocked/expired token shows up instead of looking like "no spend".
let lastInsightsError: { status: number; code?: number; message?: string } | null = null;
let lastInsightsOkAt: number | null = null;

/** Per-campaign insights for a date preset (last_7d / last_30d / last_90d / …). */
export async function getAdInsights(range = "last_30d"): Promise<AdInsight[]> {
  if (!metaAdsConfigured()) return [];
  if (cache && cache.range === range && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const acct = ACCOUNT!.startsWith("act_") ? ACCOUNT! : `act_${ACCOUNT}`;
    // inline_link_clicks / inline_link_click_ctr are Meta's LINK clicks — the
    // same numbers Ads Manager shows in its "Link Clicks"/"CTR (link click-through
    // rate)" columns — as opposed to `clicks`/`ctr` which count ALL clicks
    // (photo expands, likes, etc.) and read high vs what a marketer expects.
    const fields = "campaign_name,spend,impressions,inline_link_clicks,inline_link_click_ctr,reach,actions,cost_per_action_type";
    const url =
      `${API}/${acct}/insights?level=campaign&date_preset=${encodeURIComponent(range)}` +
      `&fields=${fields}&limit=500&access_token=${encodeURIComponent(TOKEN!)}`;
    const r = await fetch(url);
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      let code: number | undefined;
      let message: string | undefined;
      try { const j = JSON.parse(body); code = j?.error?.code; message = j?.error?.message; } catch { /* non-JSON */ }
      console.error("[meta-ads] non-OK", r.status, body.slice(0, 300));
      lastInsightsError = { status: r.status, code, message: message?.slice(0, 200) };
      return cache?.data || [];
    }
    interface RawInsight {
      campaign_name?: string; spend?: string; impressions?: string;
      inline_link_clicks?: string; inline_link_click_ctr?: string; reach?: string;
      actions?: MetaAction[]; cost_per_action_type?: MetaAction[];
    }
    const j = (await r.json()) as { data?: RawInsight[] };
    const data: AdInsight[] = (j.data || []).map((d) => {
      const spend = Number(d.spend) || 0;
      const linkClicks = Number(d.inline_link_clicks) || 0;
      const leads = pickAction(d.actions, LEAD_ACTION_TYPES);
      const costPerLead = pickAction(d.cost_per_action_type, LEAD_ACTION_TYPES) ?? (leads ? spend / leads : undefined);
      return {
        campaign: d.campaign_name || "(unnamed)",
        spend,
        impressions: Number(d.impressions) || 0,
        clicks: linkClicks,
        ctr: Number(d.inline_link_click_ctr) || 0,
        cpc: linkClicks ? spend / linkClicks : 0,
        reach: d.reach ? Number(d.reach) : undefined,
        leads,
        costPerLead,
      };
    });
    data.sort((a, b) => b.spend - a.spend);
    cache = { at: Date.now(), range, data };
    lastInsightsError = null;
    lastInsightsOkAt = Date.now();
    return data;
  } catch (e) {
    console.error("[meta-ads] fetch failed", e);
    lastInsightsError = { status: -1, message: String(e).slice(0, 200) };
    return cache?.data || [];
  }
}

const AD_LEVEL_FIELDS =
  "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,frequency," +
  "inline_link_clicks,inline_link_click_ctr,actions,cost_per_action_type,video_thruplay_watched_actions";
const AD_LEVEL_PAGE_CAP = 8;

interface RawAdInsight {
  campaign_id?: string; campaign_name?: string;
  adset_id?: string; adset_name?: string;
  ad_id?: string; ad_name?: string;
  spend?: string; impressions?: string; reach?: string; frequency?: string;
  inline_link_clicks?: string; inline_link_click_ctr?: string;
  actions?: MetaAction[]; cost_per_action_type?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[];
}

/** Per-ad insights for a date preset — creative-level spend/CTR/leads plus the
 * video hook/hold metrics (3-second plays vs thruplays) used to spot weak
 * creative before it burns budget. */
export async function getAdLevelInsights(range = "last_30d"): Promise<AdInsightAd[]> {
  if (!metaAdsConfigured()) return [];
  if (adCache && adCache.range === range && Date.now() - adCache.at < TTL_MS) return adCache.data;
  try {
    const acct = ACCOUNT!.startsWith("act_") ? ACCOUNT! : `act_${ACCOUNT}`;
    let url =
      `${API}/${acct}/insights?level=ad&date_preset=${encodeURIComponent(range)}` +
      `&fields=${AD_LEVEL_FIELDS}&limit=250&access_token=${encodeURIComponent(TOKEN!)}`;
    const rows: RawAdInsight[] = [];
    let page = 0;
    while (url && page < AD_LEVEL_PAGE_CAP) {
      const r = await fetch(url);
      if (!r.ok) {
        console.error("[meta-ads] non-OK", r.status, (await r.text().catch(() => "")).slice(0, 300));
        return adCache?.data || [];
      }
      const j = (await r.json()) as { data?: RawAdInsight[]; paging?: { next?: string } };
      rows.push(...(j.data || []));
      url = j.paging?.next || "";
      page += 1;
    }
    if (url && page >= AD_LEVEL_PAGE_CAP) {
      console.warn("[meta-ads] ad-level paging hit the", AD_LEVEL_PAGE_CAP, "page cap; results may be truncated");
    }
    const data: AdInsightAd[] = rows.map((d) => {
      const spend = Number(d.spend) || 0;
      const impressions = Number(d.impressions) || 0;
      const linkClicks = Number(d.inline_link_clicks) || 0;
      const leads = pickAction(d.actions, LEAD_ACTION_TYPES);
      const costPerLead = pickAction(d.cost_per_action_type, LEAD_ACTION_TYPES) ?? (leads ? spend / leads : undefined);
      // Meta's "3-second video plays" metric is reported under the `video_view` action type.
      const video3s = pickAction(d.actions, ["video_view"]);
      const thruplay = d.video_thruplay_watched_actions?.[0] ? Number(d.video_thruplay_watched_actions[0].value) || 0 : undefined;
      return {
        campaignId: d.campaign_id || "",
        campaign: d.campaign_name || "(unnamed)",
        adsetId: d.adset_id || "",
        adset: d.adset_name || "(unnamed)",
        adId: d.ad_id || "",
        ad: d.ad_name || "(unnamed)",
        spend,
        impressions,
        reach: d.reach ? Number(d.reach) : undefined,
        frequency: d.frequency ? Number(d.frequency) : undefined,
        linkClicks,
        linkCtr: Number(d.inline_link_click_ctr) || 0,
        cpm: impressions ? (spend / impressions) * 1000 : undefined,
        leads,
        costPerLead,
        video3s,
        thruplay,
        hookRate: impressions && video3s !== undefined ? (video3s / impressions) * 100 : undefined,
        holdRate: video3s && thruplay !== undefined ? (thruplay / video3s) * 100 : undefined,
      };
    });
    data.sort((a, b) => b.spend - a.spend);
    adCache = { at: Date.now(), range, data };
    return data;
  } catch (e) {
    console.error("[meta-ads] ad-level fetch failed", e);
    return adCache?.data || [];
  }
}

/** Connector health for the Sources hub — reuses the cached campaign-insights
 * fetch (so it adds no extra load) and reports whether Meta accepted the call.
 * A blocked/expired token surfaces here as ok:false + the Meta error text,
 * instead of looking like an empty "no spend" table. */
export async function getMetaAdsHealth(): Promise<ConnectorHealth> {
  if (!metaAdsConfigured()) return { configured: false, ok: false, hasData: false };
  const rows = await getAdInsights("last_30d");
  const ok = !lastInsightsError;
  const spend = rows.reduce((s, r) => s + (r.spend || 0), 0);
  const err = lastInsightsError;
  return {
    configured: true,
    ok,
    hasData: ok && rows.length > 0,
    lastOkAt: lastInsightsOkAt ? new Date(lastInsightsOkAt).toISOString() : null,
    error: ok ? undefined : `${err?.message || "Meta API error"} (code ${err?.code ?? err?.status})`,
    summary: ok ? `${rows.length} campaign${rows.length === 1 ? "" : "s"} · $${Math.round(spend).toLocaleString("en-CA")} spend (30d)` : undefined,
  };
}
