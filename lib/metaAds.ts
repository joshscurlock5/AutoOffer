import "server-only";
import type { AdInsight } from "./types";

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

let cache: { at: number; range: string; data: AdInsight[] } | null = null;

/** Per-campaign insights for a date preset (last_7d / last_30d / last_90d / …). */
export async function getAdInsights(range = "last_30d"): Promise<AdInsight[]> {
  if (!metaAdsConfigured()) return [];
  if (cache && cache.range === range && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const acct = ACCOUNT!.startsWith("act_") ? ACCOUNT! : `act_${ACCOUNT}`;
    const fields = "campaign_name,spend,impressions,clicks,ctr,cpc,reach";
    const url =
      `${API}/${acct}/insights?level=campaign&date_preset=${encodeURIComponent(range)}` +
      `&fields=${fields}&limit=500&access_token=${encodeURIComponent(TOKEN!)}`;
    const r = await fetch(url);
    if (!r.ok) {
      console.error("[meta-ads] non-OK", r.status, (await r.text().catch(() => "")).slice(0, 300));
      return cache?.data || [];
    }
    const j = (await r.json()) as { data?: Record<string, string>[] };
    const data: AdInsight[] = (j.data || []).map((d) => ({
      campaign: d.campaign_name || "(unnamed)",
      spend: Number(d.spend) || 0,
      impressions: Number(d.impressions) || 0,
      clicks: Number(d.clicks) || 0,
      ctr: Number(d.ctr) || 0,
      cpc: Number(d.cpc) || 0,
      reach: d.reach ? Number(d.reach) : undefined,
    }));
    data.sort((a, b) => b.spend - a.spend);
    cache = { at: Date.now(), range, data };
    return data;
  } catch (e) {
    console.error("[meta-ads] fetch failed", e);
    return cache?.data || [];
  }
}
