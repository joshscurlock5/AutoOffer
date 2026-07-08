import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getLeads, getReferrals, getConversations, getLookups, getAllEvents } from "@/lib/store";
import { DATA_SOURCES, statusFor, type SourceHealth } from "@/lib/dataSources";
import type { Attribution } from "@/lib/types";

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

// Authed. Passive "data-sources health": for each first-party source, the most
// recent datapoint timestamp + 24h/7d counts, turned into a status chip. Reuses
// the same full-table scans the analytics page + cron already do (fine at
// current volume). No external pings — it only reads what we already store.
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [leads, referrals, chats, lookups, events] = await Promise.all([
    getLeads(),
    getReferrals(),
    getConversations(),
    getLookups(),
    getAllEvents(),
  ]);

  const now = Date.now();
  const D1 = 86_400_000;
  const D7 = 7 * D1;

  const realLeads = leads.filter((l) => l.status !== "partial");
  const partials = leads.filter((l) => l.status === "partial");
  const leadsWithAttr = leads.filter((l) => hasSignal(l.attribution));
  const leadsWithGeo = leads.filter((l) => l.geo?.resolvedAt);
  const leadsWithIp = leads.filter((l) => l.meta?.clientIp);

  const pct = (have: number, total: number, label: string) =>
    total > 0 ? `${Math.round((have / total) * 100)}% of ${label}` : undefined;

  // Per source: the timestamps that count as "a datapoint arrived", plus an
  // optional note. Everything here is first-party, so `configured` is implicitly
  // true (tables have defaults); connector/tracker gating comes in later steps.
  const feeds: Record<string, { times: (string | undefined)[]; note?: string }> = {
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
  };

  const sources: SourceHealth[] = DATA_SOURCES.map((def) => {
    const feed = feeds[def.id] || { times: [] };
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
      configured: true,
      lastAt,
      count24h,
      count7d,
      status: statusFor(lastAt, def, now, true),
      note: feed.note,
    };
  });

  return NextResponse.json({ sources });
}
