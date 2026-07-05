import "server-only";
import { getLeads, getReferrals, getConversations, getLookups, getAllEvents } from "./store";
import { buildProfiles, computeAggregates, type Aggregates } from "./profiles";
import { computeEventAnalytics, type EventAnalytics } from "./eventAnalytics";
import type { Profile } from "./types";

export interface AnalyticsData {
  profiles: Profile[];
  aggregates: Aggregates;
  /** Total price-lookups (anonymous funnel top; not per-profile filterable). */
  lookupsTotal: number;
  /** First-party event-stream aggregates (anonymous sessions included). */
  events: EventAnalytics;
}

/**
 * Gather everything and compute the per-person profiles + dashboard aggregates.
 * One place so the admin page and the /api/admin/analytics route stay in sync.
 * A handful of full-table scans — fine at current volume (the cron already does
 * the same hourly).
 */
export async function getAnalytics(): Promise<AnalyticsData> {
  const [leads, referrals, chats, lookups, siteEvents] = await Promise.all([
    getLeads(),
    getReferrals(),
    getConversations(),
    getLookups(),
    getAllEvents(),
  ]);
  const profiles = buildProfiles(leads, referrals, chats, siteEvents);
  const aggregates = computeAggregates(leads, lookups, profiles);
  const events = computeEventAnalytics(siteEvents);
  return { profiles, aggregates, lookupsTotal: lookups.length, events };
}
