import "server-only";
import { getLeads, getReferrals, getConversations, getAllEvents } from "./store";
import { buildProfiles } from "./profiles";
import { computeEventAnalytics, type EventAnalytics } from "./eventAnalytics";
import type { Profile, SiteEvent } from "./types";

/** Rolling windows the event analytics are sliced into (in-memory filter of the
 * same TTL-bounded scan — no extra DynamoDB reads). */
export interface WindowedEventAnalytics {
  d7: EventAnalytics;
  d30: EventAnalytics;
  d90: EventAnalytics;
  all: EventAnalytics;
}

export interface AnalyticsData {
  profiles: Profile[];
  /** First-party event-stream aggregates (anonymous sessions included), sliced
   * into rolling windows. */
  events: WindowedEventAnalytics;
}

function windowEvents(siteEvents: SiteEvent[]): WindowedEventAnalytics {
  const now = Date.now();
  const since = (days: number) => {
    const cutoff = now - days * 86_400_000;
    return siteEvents.filter((e) => {
      const t = Date.parse(e.at);
      return Number.isFinite(t) && t >= cutoff;
    });
  };
  return {
    d7: computeEventAnalytics(since(7)),
    d30: computeEventAnalytics(since(30)),
    d90: computeEventAnalytics(since(90)),
    all: computeEventAnalytics(siteEvents),
  };
}

/**
 * Gather everything and compute the per-person profiles + dashboard aggregates.
 * One place so the admin page and the /api/admin/analytics route stay in sync.
 * A handful of full-table scans — fine at current volume (the cron already does
 * the same hourly).
 */
export async function getAnalytics(): Promise<AnalyticsData> {
  const [allLeads, referrals, chats, siteEvents] = await Promise.all([
    getLeads(),
    getReferrals(),
    getConversations(),
    getAllEvents(),
  ]);
  // Soft-deleted leads are excluded from EVERYTHING here — profiles, funnel,
  // segments, revenue — so a deleted test lead is truly gone from the data.
  const leads = allLeads.filter((l) => !l.archived);
  const profiles = buildProfiles(leads, referrals, chats, siteEvents);
  const events = windowEvents(siteEvents);
  return { profiles, events };
}
