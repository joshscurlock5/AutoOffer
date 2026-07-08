import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getLeads, getReferrals, getConversations, getLookups, getAllEvents } from "@/lib/store";
import { DATA_SOURCES, statusFor, type SourceHealth, type SourceStatus, type ConnectorHealth } from "@/lib/dataSources";
import type { Attribution } from "@/lib/types";
import { getMetaAdsHealth } from "@/lib/metaAds";
import { getGa4Health } from "@/lib/ga4Data";
import { marketCheckEnabled } from "@/lib/marketcheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** True when the attribution object carries any real marketing signal (i.e. the
 * person didn't arrive fully "direct"). */
function hasSignal(a?: Attribution): boolean {
  if (!a) return false;
  return Boolean(
    a.utmSource || a.utmMedium || a.utmCampaign || a.utmContent || a.utmTerm || a.gclid || a.fbclid || a.referrer,
  );
}

/** Map a pull-connector's live health onto the shared SourceHealth shape. */
function fromConnector(id: string, h: ConnectorHealth): SourceHealth {
  const status: SourceStatus = !h.configured ? "unconfigured" : !h.ok ? "stale" : h.hasData ? "active" : "quiet";
  return { id, configured: h.configured, lastAt: h.lastOkAt ?? null, count24h: 0, count7d: 0, status, error: h.error, note: h.summary };
}

// Authed. Passive "data-sources health": first-party sources report their most
// recent stored datapoint + 24h/7d counts; the read-connectors (Meta / GA4)
// report the result of their (cached) live fetch, so a blocked/expired token
// surfaces as an error instead of an empty table. No PII leaves this endpoint.
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [leads, referrals, chats, lookups, events, metaH, ga4H] = await Promise.all([
    getLeads(),
    getReferrals(),
    getConversations(),
    getLookups(),
    getAllEvents(),
    getMetaAdsHealth(),
    getGa4Health(),
  ]);

  const now = Date.now();
  const D1 = 86_400_000;
  const D7 = 7 * D1;

  const realLeads = leads.filter((l) => l.status !== "partial");
  const partials = leads.filter((l) => l.status === "partial");
  const leadsWithAttr = leads.filter((l) => hasSignal(l.attribution));
  const leadsWithGeo = leads.filter((l) => l.geo?.resolvedAt);
  const leadsWithIp = leads.filter((l) => l.meta?.clientIp);
  const mcConfigured = marketCheckEnabled();
  const mcLiveCalls = lookups.filter((l) => (l.apiCalls || 0) > 0);

  const pct = (have: number, total: number, label: string) =>
    total > 0 ? `${Math.round((have / total) * 100)}% of ${label}` : undefined;

  // Per source: the timestamps that count as "a datapoint arrived", plus an
  // optional note and a configured flag (defaults true for pure first-party).
  const feeds: Record<string, { times: (string | undefined)[]; note?: string; configured?: boolean }> = {
    leads: { times: realLeads.map((l) => l.createdAt) },
    partials: { times: partials.map((l) => l.createdAt) },
    events: {
      times: events.map((e) => e.at),
      note: events.length === 0 ? "No events found yet — the AutoOfferEvents table may not exist, or consent is being declined." : undefined,
    },
    attribution: { times: leadsWithAttr.map((l) => l.createdAt), note: pct(leadsWithAttr.length, realLeads.length, "leads arrived tagged") },
    lookups: { times: lookups.map((l) => l.createdAt) },
    referrals: { times: referrals.map((r) => r.createdAt) },
    chat: { times: chats.map((c) => c.updatedAt || c.createdAt) },
    geo: { times: leadsWithGeo.map((l) => l.geo?.resolvedAt), note: pct(leadsWithGeo.length, leadsWithIp.length, "IP-carrying leads resolved") },
    marketcheck: {
      times: mcLiveCalls.map((l) => l.createdAt),
      configured: mcConfigured,
      note: mcConfigured ? "Last live call (cache hits excluded)." : "MARKETCHECK_API_KEY not set — running on the local estimate model.",
    },
  };

  const connectors: Record<string, SourceHealth> = {
    metaAds: fromConnector("metaAds", metaH),
    ga4Data: fromConnector("ga4Data", ga4H),
  };

  const sources: SourceHealth[] = DATA_SOURCES.map((def) => {
    if (def.healthKind === "liveFetch") {
      return connectors[def.id] ?? fromConnector(def.id, { configured: false, ok: false, hasData: false });
    }
    const feed = feeds[def.id] || { times: [] };
    const configured = feed.configured ?? true;
    let lastAt: string | null = null;
    let count24h = 0;
    let count7d = 0;
    for (const raw of feed.times) {
      if (!raw) continue;
      if (!lastAt || raw > lastAt) lastAt = raw;
      const age = now - Date.parse(raw);
      if (Number.isFinite(age)) {
        if (age <= D1) count24h += 1;
        if (age <= D7) count7d += 1;
      }
    }
    return {
      id: def.id,
      configured,
      lastAt,
      count24h,
      count7d,
      status: statusFor(lastAt, def, now, configured),
      note: feed.note,
    };
  });

  return NextResponse.json({ sources });
}
