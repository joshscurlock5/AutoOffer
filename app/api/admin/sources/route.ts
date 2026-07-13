import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getLeads, getReferrals, getConversations, getLookups, getAllEvents } from "@/lib/store";
import { DATA_SOURCES, statusFor, type SourceHealth, type SourceStatus, type ConnectorHealth } from "@/lib/dataSources";
import type { Attribution } from "@/lib/types";
import { getMetaAdsHealth } from "@/lib/metaAds";
import { getGa4Health } from "@/lib/ga4Data";
import { getClarityData } from "@/lib/clarityData";
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

  const [leads, referrals, chats, lookups, events, metaH, ga4H, clarityRes] = await Promise.all([
    getLeads(),
    getReferrals(),
    getConversations(),
    getLookups(),
    getAllEvents(),
    getMetaAdsHealth(),
    getGa4Health(),
    getClarityData(),
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
  // Client-side trackers: NEXT_PUBLIC_* are present in process.env server-side
  // too (same pattern metaCapi.ts already relies on). Health is a proxy from the
  // signals those browser tags stamp onto leads.
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID;
  const leadsWithGaClient = leads.filter((l) => l.gaClientId);
  const leadsWithFbCookie = leads.filter((l) => l.meta?.fbp || l.meta?.fbc);
  // Messaging channels: outbound receipts (commsEvents) + inbound replies stamped
  // on leads, split by channel. commsEvents is the authoritative receipt log
  // (avoids double-counting the emailEngagement/smsEngagement summary fields).
  const resendConfigured = Boolean(process.env.RESEND_API_KEY || process.env.RESEND_WEBHOOK_SECRET);
  const twilioConfigured = Boolean(process.env.TWILIO_AUTH_TOKEN);
  const emailTimes: string[] = [];
  const smsTimes: string[] = [];
  let emailOptOuts = 0;
  let smsOptOuts = 0;
  for (const l of leads) {
    if (l.emailOptOut || l.emailBounced) emailOptOuts += 1;
    if (l.smsOptOut) smsOptOuts += 1;
    for (const e of l.commsEvents || []) {
      if (e.channel === "email") emailTimes.push(e.at);
      else if (e.channel === "sms") smsTimes.push(e.at);
    }
    if (l.lastReplyAt) {
      if (l.lastInboundChannel === "email") emailTimes.push(l.lastReplyAt);
      else if (l.lastInboundChannel === "sms") smsTimes.push(l.lastReplyAt);
    }
  }

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
    gtag: {
      times: leadsWithGaClient.map((l) => l.createdAt),
      configured: Boolean(gaId),
      note: gaId ? pct(leadsWithGaClient.length, realLeads.length, "recent leads carried a GA client id") : "NEXT_PUBLIC_GA_ID not set.",
    },
    pixel: {
      times: leadsWithFbCookie.map((l) => l.createdAt),
      configured: Boolean(pixelId),
      note: pixelId ? pct(leadsWithFbCookie.length, realLeads.length, "recent leads carried a Meta cookie") : "NEXT_PUBLIC_META_PIXEL_ID not set.",
    },
    email: {
      times: emailTimes,
      configured: resendConfigured,
      note: resendConfigured ? (emailOptOuts ? `${emailOptOuts} opted out / bounced` : undefined) : "RESEND_API_KEY / RESEND_WEBHOOK_SECRET not set.",
    },
    sms: {
      times: smsTimes,
      configured: twilioConfigured,
      note: twilioConfigured ? (smsOptOuts ? `${smsOptOuts} opted out (STOP)` : undefined) : "TWILIO_AUTH_TOKEN not set — SMS is dormant.",
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
    if (def.healthKind === "external") {
      // The recorder fires in the browser (no server signal), so status reflects
      // whether the client tag is installed (env set). For Clarity we ALSO pull
      // aggregate stats via the Data Export API when CLARITY_API_TOKEN is set —
      // surface the session count (or the API error) here; the full numbers ride
      // in `clarity` on the response below.
      const configured = def.id === "clarity" ? Boolean(clarityId) : false;
      let note = configured
        ? "Fires client-side for consented visitors — confirm live recordings in the Clarity dashboard."
        : "NEXT_PUBLIC_CLARITY_ID not set.";
      let lastAt: string | null = null;
      if (def.id === "clarity" && clarityRes.configured) {
        if (clarityRes.insights) {
          note = `Recording live · ${clarityRes.insights.sessions.toLocaleString("en-CA")} sessions (last ${clarityRes.insights.days} days).`;
          lastAt = clarityRes.insights.fetchedAt;
        } else if (clarityRes.error) {
          note = clarityRes.error;
        }
      }
      return {
        id: def.id,
        configured,
        lastAt,
        count24h: 0,
        count7d: 0,
        status: configured ? "external" : "unconfigured",
        note,
      };
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

  return NextResponse.json({ sources, clarity: clarityRes.insights });
}
