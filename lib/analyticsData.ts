import "server-only";
import { getLeads, getReferrals, getConversations, getLookups } from "./store";
import { buildProfiles, computeAggregates, type Aggregates } from "./profiles";
import type { Profile } from "./types";

export interface AnalyticsData {
  profiles: Profile[];
  aggregates: Aggregates;
  /** Total price-lookups (anonymous funnel top; not per-profile filterable). */
  lookupsTotal: number;
}

/**
 * Gather everything and compute the per-person profiles + dashboard aggregates.
 * One place so the admin page and the /api/admin/analytics route stay in sync.
 * A handful of full-table scans — fine at current volume (the cron already does
 * the same hourly).
 */
export async function getAnalytics(): Promise<AnalyticsData> {
  const [leads, referrals, chats, lookups] = await Promise.all([
    getLeads(),
    getReferrals(),
    getConversations(),
    getLookups(),
  ]);
  const profiles = buildProfiles(leads, referrals, chats);
  const aggregates = computeAggregates(leads, lookups, profiles);
  return { profiles, aggregates, lookupsTotal: lookups.length };
}
