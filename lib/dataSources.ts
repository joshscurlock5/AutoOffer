// ===========================================================================
//  Data Sources registry — the single source of truth for the admin
//  "Sources" health hub. Describes every distinct way DriveOffer collects
//  data: what it collects, where it lands, and the passive freshness
//  thresholds that turn a "last data seen" timestamp into a status chip.
//
//  Shared by BOTH the API (app/api/admin/sources/route.ts computes health)
//  and the UI (app/admin/AnalyticsDashboard.tsx renders the cards), so the two
//  never drift. Pure data + pure helpers — NO server-only imports, so the
//  client component can import it too.
//
//  Health model = PASSIVE "last data seen" (owner's choice): we read data we
//  already store; we do not ping anything. Each source declares freshHrs
//  (newer than this ⇒ Active) and quietDays (older than freshHrs but within
//  this ⇒ Quiet; beyond ⇒ Check it).
//
//  This file currently covers the STEP 1 first-party sources. Later steps
//  append connector / tracker / comms entries here.
// ===========================================================================

import { BRAINSTORM } from "./dataSourcesBrainstorm";

export type SourceCategory = "firstParty" | "tracker" | "connector" | "comms";

export type SourceStatus = "active" | "quiet" | "stale" | "empty" | "unconfigured" | "external";

/** One brainstorm item in the underutilized / opportunities tiers. */
export interface CollectIdea {
  label: string;
  /** Hover text: what it is + the reasoning (why underused, or why not collected yet). */
  why: string;
}

export interface DataSourceDef {
  id: string;
  label: string;
  category: SourceCategory;
  /** One-line plain-language purpose. */
  purpose: string;
  /** The data types this method collects — shown in the detail panel. */
  collects: string[];
  /** Where it lands (table / storage) — shown in detail. Optional. */
  storage?: string;
  /** Newer than this many hours ⇒ Active. */
  freshHrs: number;
  /** Older than freshHrs but within this many days ⇒ Quiet; beyond ⇒ Check it. */
  quietDays: number;
  /** Names (only) of env vars this method depends on — shown in detail. */
  envVars?: string[];
  /** How health is measured. "lastSeen" (default) = most recent stored datapoint;
   * "liveFetch" = the result of a live connector call (Meta / GA4);
   * "external" = fires in the browser with no server signal (verify in the
   * vendor's own dashboard). */
  healthKind?: "lastSeen" | "liveFetch" | "external";
  /** Optional link to the vendor's own dashboard (trackers / connectors). */
  vendorUrl?: string;
  /** Plain-language "where to look if it's broken". */
  fixHint?: string;
  /** Brainstorm tier — data already collected/available but not used to its
   * fullest; each item's `why` explains the missed opportunity. */
  underutilized?: CollectIdea[];
  /** Brainstorm tier — data this source COULD collect but currently doesn't;
   * each item's `why` explains what it is + why it's worth adding (or the tradeoff). */
  opportunities?: CollectIdea[];
}

/** Per-source computed health returned by /api/admin/sources. */
export interface SourceHealth {
  id: string;
  configured: boolean;
  /** ISO of the most recent datapoint, or null if none. */
  lastAt: string | null;
  count24h: number;
  count7d: number;
  status: SourceStatus;
  /** Optional extra context (e.g. coverage %, "table not created yet"). */
  note?: string;
  /** Connector error message (why a liveFetch source is failing), if any. */
  error?: string;
}

/** Health of a pull-connector we READ from (Meta / GA4). Its "last data seen" is
 * the fetch result: configured? did the call succeed? was there data? */
export interface ConnectorHealth {
  configured: boolean;
  ok: boolean;
  hasData: boolean;
  lastOkAt?: string | null;
  error?: string;
  summary?: string;
}

/** Turn a last-seen timestamp into a passive status. `now` = Date.now(). */
export function statusFor(
  lastAt: string | null,
  def: Pick<DataSourceDef, "freshHrs" | "quietDays">,
  now: number,
  configured = true,
): SourceStatus {
  if (!configured) return "unconfigured";
  if (!lastAt) return "empty";
  const t = Date.parse(lastAt);
  if (!Number.isFinite(t)) return "empty";
  const age = now - t;
  if (age <= def.freshHrs * 3_600_000) return "active";
  if (age <= def.quietDays * 86_400_000) return "quiet";
  return "stale";
}

/** UI presentation for each status (label + dot glyph + Tailwind chip classes). */
export const STATUS_META: Record<SourceStatus, { label: string; dot: string; cls: string }> = {
  active: { label: "Active", dot: "●", cls: "bg-emerald-100 text-emerald-800" },
  quiet: { label: "Quiet", dot: "●", cls: "bg-amber-100 text-amber-800" },
  stale: { label: "Check it", dot: "●", cls: "bg-red-100 text-red-700" },
  empty: { label: "No data yet", dot: "○", cls: "bg-slate-100 text-slate-600" },
  unconfigured: { label: "Not set up", dot: "○", cls: "bg-slate-100 text-slate-500" },
  external: { label: "Installed", dot: "◇", cls: "bg-sky-100 text-sky-800" },
};

export const CATEGORY_LABEL: Record<SourceCategory, string> = {
  firstParty: "First-party",
  tracker: "Tracker",
  connector: "Connector",
  comms: "Comms",
};

// ---------------------------------------------------------------------------
//  STEP 1 — first-party data streams we own (all DynamoDB-backed, so each has
//  a real stored timestamp → true passive "last data seen").
// ---------------------------------------------------------------------------
const BASE_SOURCES: DataSourceDef[] = [
  {
    id: "leads",
    label: "Lead form",
    category: "firstParty",
    purpose: "Completed sell-my-car submissions — your actual leads.",
    collects: [
      "Name, email, phone",
      "Preferred contact method + best time",
      "Vehicle: year, make, model, trim, mileage",
      "Condition tags + free-text note",
      "Marketing attribution (UTM, gclid, fbclid, referrer)",
      "On-site behavior (visits, funnel step, time on site)",
      "Meta match keys (fbp / fbc) + GA client/session id",
    ],
    storage: "AutoOfferLeads (DynamoDB)",
    freshHrs: 48,
    quietDays: 14,
    fixHint:
      "Submissions write to the leads table via /api/leads. If this goes stale unexpectedly, submit a test through the get-offer form end to end and watch for a Telegram alert.",
  },
  {
    id: "partials",
    label: "Abandoned-form beacon",
    category: "firstParty",
    purpose: "High-intent visitors who started the form but didn't submit.",
    collects: [
      "Partial contact (name / email / phone as typed)",
      "Partial vehicle info",
      "Attribution + behavior",
      "Whether an owner alert was already sent",
    ],
    storage: "AutoOfferLeads (status = partial)",
    freshHrs: 48,
    quietDays: 14,
    fixHint:
      "Fires on contact-field blur via /api/leads/partial. If stale, either the beacon is being blocked or few people are reaching the contact step.",
  },
  {
    id: "events",
    label: "On-site event stream",
    category: "firstParty",
    purpose: "First-party behavior analytics — every visit and funnel step.",
    collects: [
      "Page views + route changes",
      "Funnel steps (offer_flow_start → generate_lead)",
      "Field focus / blur + form errors",
      "VIN decode funnel",
      "Exit-intent + resume prompts",
      "Session + visitor ids",
    ],
    storage: "AutoOfferEvents (DynamoDB, ~12-month TTL)",
    freshHrs: 24,
    quietDays: 3,
    fixHint:
      "Client beacon → /api/events → AutoOfferEvents. If empty, the table may not exist yet (one-time setup) or analytics consent is being declined.",
  },
  {
    id: "attribution",
    label: "Attribution & multi-touch",
    category: "firstParty",
    purpose: "Where each person came from — the ad / campaign / referrer trail.",
    collects: [
      "UTM source / medium / campaign / content / term",
      "Google click id (gclid)",
      "Meta click id (fbclid)",
      "External referrer + landing page",
      "Full multi-touch journey (oldest → newest)",
    ],
    storage: "Embedded on each lead / referral",
    freshHrs: 48,
    quietDays: 14,
    fixHint:
      "Captured client-side and stored on every lead. Coverage shows the share of recent leads that arrived tagged — a sudden drop can mean links lost their UTMs.",
  },
  {
    id: "lookups",
    label: "Price lookups",
    category: "firstParty",
    purpose: "Every vehicle valuation, and whether it turned into a lead.",
    collects: [
      "Vehicle looked up",
      "Outcome (priced range vs unique / no-price)",
      "Estimate range shown",
      "MarketCheck API calls used + cache hits",
      "Whether it converted to a lead",
    ],
    storage: "AutoOfferLookups (DynamoDB)",
    freshHrs: 48,
    quietDays: 14,
    fixHint:
      "Logged on every /api/estimate call. Also reflects live MarketCheck usage (the API-call counter).",
  },
  {
    id: "referrals",
    label: "Referral program",
    category: "firstParty",
    purpose: "Referral submissions — referrer + the friend they sent.",
    collects: [
      "Referrer name / email / phone",
      "Friend name / phone / email",
      "Message",
      "Generated referral code",
      "Attribution + behavior",
    ],
    storage: "AutoOfferReferrals (DynamoDB)",
    freshHrs: 168,
    quietDays: 30,
    fixHint: "Writes via /api/referrals. Low volume here is normal.",
  },
  {
    id: "chat",
    label: "Live chat",
    category: "firstParty",
    purpose: "Visitor-initiated chat conversations.",
    collects: [
      "Conversation + message history",
      "Visitor name + contact",
      "Who replied last (the needs-reply cue)",
    ],
    storage: "AutoOfferChats (DynamoDB)",
    freshHrs: 168,
    quietDays: 30,
    fixHint: "Writes via /api/chat. Low volume here is normal.",
  },
  {
    id: "geo",
    label: "Geo enrichment",
    category: "firstParty",
    purpose: "Coarse location resolved from each lead's IP address.",
    collects: ["Country / province / city", "Resolved-at timestamp"],
    storage: "Embedded on each lead (Lead.geo)",
    freshHrs: 168,
    quietDays: 30,
    fixHint:
      "Resolved hourly by the cron (ipwho.is) for leads that have an IP. If stale while leads keep coming, check the /api/cron schedule (EventBridge).",
  },
  // ----- STEP 2: read-connectors (external APIs we pull data FROM) -----
  {
    id: "metaAds",
    label: "Meta Ads (Marketing API)",
    category: "connector",
    purpose: "Reads your Facebook / Instagram ad spend, clicks, and results.",
    collects: [
      "Campaign & ad spend (CAD)",
      "Impressions, reach, link clicks, CTR",
      "Leads + cost-per-lead",
      "Creative hook / hold video metrics",
    ],
    storage: "Live from Meta — nothing stored locally",
    envVars: ["META_MARKETING_TOKEN", "META_AD_ACCOUNT_ID"],
    healthKind: "liveFetch",
    freshHrs: 0,
    quietDays: 0,
    fixHint:
      "If it reads blocked/expired: developers.facebook.com/apps → your app → Alerts (clear the banner), then regenerate the token and update META_MARKETING_TOKEN in Amplify. The exact reason from Meta is shown above.",
  },
  {
    id: "ga4Data",
    label: "Google Analytics (Data API)",
    category: "connector",
    purpose: "Reads aggregate site traffic — everyone who visited, not just leads.",
    collects: [
      "Users, new users, sessions, page views",
      "Engagement rate",
      "Traffic by source / medium",
      "By country + device",
    ],
    storage: "Live from GA4 — nothing stored locally",
    envVars: ["GA4_PROPERTY_ID", "GA4_SA_CLIENT_EMAIL", "GA4_SA_PRIVATE_KEY"],
    healthKind: "liveFetch",
    freshHrs: 0,
    quietDays: 0,
    fixHint:
      "If it errors, the service-account key likely rotated or expired. Regenerate the GA4 service-account key and update GA4_SA_PRIVATE_KEY in Amplify.",
  },
  {
    id: "marketcheck",
    label: "MarketCheck (vehicle pricing)",
    category: "connector",
    purpose: "Live Canadian market pricing + VIN decode used during a valuation.",
    collects: [
      "VIN → year / make / model / trim",
      "Market asking-price percentiles",
      "Active listing counts by trim",
    ],
    storage: "Live from MarketCheck — only called during a price lookup",
    envVars: ["MARKETCHECK_API_KEY"],
    freshHrs: 48,
    quietDays: 30,
    fixHint:
      "Only called when a visitor runs a price lookup; it falls back to the local estimate model if it fails. “Last live call” reflects real API usage (cache hits excluded).",
  },
  // ----- STEP 3: client-side trackers (fire in the visitor's browser) -----
  {
    id: "gtag",
    label: "Google Analytics tag (gtag)",
    category: "tracker",
    purpose: "The browser tag that sends page views + funnel events to GA4.",
    collects: [
      "Page views + route changes",
      "Funnel + click events (mirrored to GA4)",
      "GA client id / session id (the _ga cookie)",
    ],
    storage: "Sent to Google — measured here only by proxy",
    envVars: ["NEXT_PUBLIC_GA_ID"],
    vendorUrl: "https://analytics.google.com/",
    freshHrs: 48,
    quietDays: 14,
    fixHint:
      "Health is a PROXY — the newest lead that carried a GA client id (gtag only stamps this at form submit). If coverage drops while leads keep coming, the tag may be blocked or NEXT_PUBLIC_GA_ID changed.",
  },
  {
    id: "pixel",
    label: "Meta Pixel",
    category: "tracker",
    purpose: "The browser pixel that sends PageView / Lead events to Meta.",
    collects: [
      "PageView, Search, ViewContent, InitiateCheckout, Lead",
      "Meta browser cookies (fbp / fbc)",
      "Deduplicated with the server-side CAPI events",
    ],
    storage: "Sent to Meta — measured here only by proxy",
    envVars: ["NEXT_PUBLIC_META_PIXEL_ID"],
    vendorUrl: "https://business.facebook.com/events_manager2/",
    freshHrs: 48,
    quietDays: 14,
    fixHint:
      "Health is a PROXY — the newest lead that carried a Meta cookie (fbp / fbc). If coverage drops, the pixel may be blocked or NEXT_PUBLIC_META_PIXEL_ID changed.",
  },
  {
    id: "clarity",
    label: "Microsoft Clarity",
    category: "tracker",
    purpose: "Session recordings + heatmaps (typed form fields are masked).",
    collects: [
      "Session recordings + heatmaps",
      "Visitor id for stitching sessions",
      "Never records typed form data (masked by default)",
    ],
    storage: "Sent to Microsoft — no server-side signal",
    envVars: ["NEXT_PUBLIC_CLARITY_ID"],
    vendorUrl: "https://clarity.microsoft.com/",
    healthKind: "external",
    freshHrs: 0,
    quietDays: 0,
    fixHint:
      "Fires client-side for every consented visitor; there's no server signal, so confirm live recordings in the Clarity dashboard.",
  },
  // ----- STEP 4: messaging & delivery (inbound + outbound receipts on leads) -----
  {
    id: "email",
    label: "Email (Resend)",
    category: "comms",
    purpose: "Delivery, opens, clicks, bounces + inbound email replies.",
    collects: [
      "Delivered / opened / clicked receipts",
      "Hard bounces + spam complaints (opt-out)",
      "Inbound customer replies (via the Gmail script)",
      "Per-lead comms timeline",
    ],
    storage: "Stamped onto each lead (emailEngagement + commsEvents)",
    envVars: ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"],
    freshHrs: 72,
    quietDays: 30,
    fixHint:
      "Receipts arrive via the Resend webhook (/api/webhooks/resend, RESEND_WEBHOOK_SECRET); replies via the Gmail Apps Script. If stale while emails send, check the Resend webhook points at the site.",
  },
  {
    id: "sms",
    label: "SMS (Twilio)",
    category: "comms",
    purpose: "Delivery/failure receipts, inbound replies, STOP opt-outs.",
    collects: [
      "Delivered / failed receipts",
      "Inbound replies + 'C' confirmations",
      "STOP / START opt-out state",
      "Per-lead comms timeline",
    ],
    storage: "Stamped onto each lead (smsEngagement + commsEvents)",
    envVars: ["TWILIO_AUTH_TOKEN"],
    freshHrs: 72,
    quietDays: 30,
    fixHint:
      "Inbound + status callbacks hit /api/sms and /api/sms/status (Twilio, signature-validated). Ships dormant until TWILIO_AUTH_TOKEN is set. If stale while texts send, check the Twilio webhooks point at the site.",
  },
];

/** The exported source of truth: health defs with their brainstorm tiers
 * (underutilized + opportunities) merged in from dataSourcesBrainstorm.ts. */
export const DATA_SOURCES: DataSourceDef[] = BASE_SOURCES.map((d) => ({
  ...d,
  ...(BRAINSTORM[d.id] || {}),
}));
