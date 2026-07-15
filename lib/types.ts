// Shared data types for leads and referrals.

export type LeadKind = "vehicle" | "inquiry";

export type LeadStatus =
  | "partial"
  | "new"
  | "contacted"
  | "scheduled"
  | "closed"
  | "lost"
  | "spam";

export const LEAD_STATUSES: LeadStatus[] = [
  "partial",
  "new",
  "contacted",
  "scheduled",
  "closed",
  "lost",
  "spam",
];

export interface UploadedPhoto {
  /** Original file name. */
  name: string;
  /** Stored filename inside this lead's upload folder. */
  file: string;
  size: number;
  type: string;
}

export interface VehicleInfo {
  year: number | string;
  make: string;
  model: string;
  trim?: string;
  mileageKm: number;
  /** 17-char VIN — captured when the seller uses the VIN-lookup path (optional). */
  vin?: string;
  /** Damage / condition the seller flagged: quick-pick tags + an optional note. */
  condition?: { tags: string[]; note?: string };
}

export interface OfferEstimate {
  low: number;
  high: number;
  mid: number;
  currency: "CAD";
  /** True when we could not price the vehicle (routes to "unique" flow). */
  unique?: boolean;
  /** Where the number came from: real market data vs the fallback model. */
  source?: "market" | "estimate";
  /** Number of comparable Canadian listings used (market source only). */
  comps?: number;
}

/** A vehicle decoded from a VIN (shared by the API + the client form). */
export interface DecodedVehicle {
  valid: boolean;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  bodyType?: string;
  drivetrain?: string;
  transmission?: string;
  fuelType?: string;
}

export interface Contact {
  name: string;
  email: string;
  phone: string;
  /** How the customer prefers to be reached. */
  contactMethod?: "call" | "text" | "email";
  /** Best time of day to reach them. */
  bestTime?: string;
}

/** First-touch marketing attribution — which ad/campaign/referrer brought a
 * person in. Captured client-side on the first page they land on (first-touch
 * wins) and carried into the lead + partial beacon. */
export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  fbclid?: string;
  /** Google iOS/privacy-safe click ids, auto-appended alongside gclid (no ad
   * tracking-template config needed) — recovers attribution gclid loses on iOS. */
  gbraid?: string;
  wbraid?: string;
  /** Google Ads ValueTrack tokens, present only if the ad's tracking template
   * carries them: search match type, ad network, placement site, and ad id. */
  matchType?: string;
  adNetwork?: string;
  placement?: string;
  /** More ValueTrack tokens ({keyword} / {device} / {loc_physical_ms}) — the
   * exact search typed, device at the ad click, and click-location criterion. */
  keyword?: string;
  adDevice?: string;
  locPhysical?: string;
  utmId?: string;
  /** External referrer at first touch (same-origin referrers are dropped). */
  referrer?: string;
  /** First landing path (+query). */
  landingPath?: string;
  landingAt?: string;
}

/** One marketing touch — a visit that arrived carrying a NEW source signal
 * (utm/click-id/external referrer; the very first visit counts even when
 * direct). Accumulated client-side (localStorage `ao_touches`, capped) so the
 * lead carries the person's whole journey, not just the first touch. */
export interface Touch {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  fbclid?: string;
  gbraid?: string;
  wbraid?: string;
  matchType?: string;
  adNetwork?: string;
  placement?: string;
  keyword?: string;
  adDevice?: string;
  locPhysical?: string;
  utmId?: string;
  referrer?: string;
  landingPath?: string;
  at?: string;
}

/** Lightweight on-site behavior summary, accumulated client-side in localStorage
 * across the session and sent with the lead. */
export interface Behavior {
  /** Durable per-browser id — set once and never rotated (unlike sessionId,
   * which rotates after 30 min of inactivity). Used to stitch a person's
   * activity across multiple sessions/visits. */
  visitorId?: string;
  sessionId?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  pageviews?: number;
  /** Furthest offer-flow step reached (1=vehicle, 2=details, 3=contact, 5=done). */
  maxFunnelStep?: number;
  /** lastSeenAt − firstSeenAt, computed at read time. */
  timeOnSiteMs?: number;
  /** Passive form-quality signals from the offer page (consent-gated). Never
   * includes any typed value — only sizes / counts / a fill-method label. */
  viewport?: string; // "WxH" at submit
  maxScrollPct?: number; // furthest scroll depth on the offer page (0–100)
  tabSwitches?: number; // times the tab was hidden during the flow
  contactInput?: "typed" | "paste" | "autofill"; // how the primary contact field was filled
}

/** Coarse geolocation resolved from the client IP (best-effort). All fields come
 * FREE from the same ipwho.is lookup (no paid tier). IP-derived, so coordinates /
 * postal are approximate (city-centroid, never house-level), and everything here
 * is only resolved for consented visitors. */
export interface Geo {
  country?: string;
  countryCode?: string;
  region?: string; // province / state
  city?: string;
  /** Full postal / ZIP from IP (approximate — IP-derived, not GPS). */
  postal?: string;
  /** IP city-centroid coordinates (approximate, never house-level). */
  latitude?: number;
  longitude?: number;
  /** IANA timezone id of the IP (e.g. "America/Edmonton"). */
  timezone?: string;
  /** International calling code of the IP's country (e.g. "1" for CA/US). */
  callingCode?: string;
  /** Connection owner — distinguishes a home ISP from a datacenter / VPN / corp net. */
  isp?: string;
  org?: string;
  /** Autonomous System Number of the connection (for repeat-network detection). */
  asn?: number;
  resolvedAt?: string;
}

/** Device/browser parsed from the user-agent (computed at read time). */
export interface DeviceInfo {
  type?: "mobile" | "desktop" | "tablet";
  os?: string;
  browser?: string;
}

/** One delivery/engagement receipt from Resend (email) or Twilio (SMS),
 * appended to Lead.commsEvents by the webhook handlers. */
export interface CommsEvent {
  at: string;
  channel: "email" | "sms";
  /** delivered | opened | clicked | bounced | complained | failed | undelivered */
  type: string;
  /** The link that was clicked (email.clicked only). */
  url?: string;
}

/** Aggregated email receipts from the Resend webhook. */
export interface EmailEngagement {
  deliveredCount?: number;
  opensCount?: number;
  clicksCount?: number;
  lastOpenedAt?: string;
  lastClickedAt?: string;
  lastClickedUrl?: string;
  /** Last soft/greylist delay (delivery_delayed) — a stuck-in-retry signal, not a bounce. */
  lastDelayedAt?: string;
  /** Human-readable reason from the last hard bounce (invalid mailbox vs full inbox…). */
  lastBounceReason?: string;
}

/** Aggregated SMS delivery receipts from the Twilio status callback. */
export interface SmsEngagement {
  deliveredCount?: number;
  failedCount?: number;
  lastStatus?: string;
  lastErrorCode?: string;
  lastDeliveredAt?: string;
  /** Total SMS segments billed across this lead's texts (cost signal). */
  segmentsCount?: number;
}

/** One entry in a lead's owner-logged negotiation trail (from Telegram). */
export interface NegotiationEntry {
  at: string;
  kind: "ask" | "offer" | "bought";
  amount: number;
}

export interface Lead {
  id: string;
  kind: LeadKind;
  createdAt: string; // ISO timestamp
  status: LeadStatus;
  contact: Contact;
  /** Present for kind === "vehicle". */
  vehicle?: VehicleInfo;
  estimate?: OfferEstimate;
  photos: UploadedPhoto[];
  /** Free text from an inquiry / contact form. */
  message?: string;
  /** Referral code the customer entered, if any. */
  referralCode?: string;
  /** Internal admin notes. */
  notes?: string;
  /** Starred by an admin for quick access. */
  bookmarked?: boolean;
  /** Soft delete: hidden everywhere + excluded from ALL analytics, but
   * restorable from the admin "Deleted" tab. Distinct from "spam" (which is a
   * kept classification). Set by the analytics profile-delete + admin trash. */
  archived?: boolean;
  archivedAt?: string;
  /** Final price the vehicle was purchased for (CAD) — your cost. */
  purchasePrice?: number;
  /** What you expect to resell it for (CAD) — drives estimated profit + margin. */
  expectedResale?: number;
  /** What it ACTUALLY sold for (CAD), recorded when the car is flipped. */
  actualSalePrice?: number;
  /** When the actual sale price was recorded (ISO). */
  soldAt?: string;
  /**
   * Meta ad-match keys captured at lead creation, kept so a later offline
   * "Purchase" conversion can be attributed back to the originating ad click
   * (the cookies are long gone by the time a deal closes).
   */
  meta?: {
    fbc?: string;
    fbp?: string;
    /** The "Lead" event_id (shared with the browser Pixel for dedup). */
    eventId?: string;
    clientIp?: string;
    userAgent?: string;
  };
  /** Visitor had analytics consent denied at submit time — no Meta/GA4 sends,
   * no ad-match keys stored; offline Purchase sync also skips. */
  consentDenied?: boolean;
  /** ISO timestamp set once the offline "Purchase" conversion was sent to Meta (idempotency guard). */
  purchaseSyncedAt?: string;
  /** Offer emailed to the customer via the /offer Telegram command (CAD). */
  offer?: { low: number; high: number; sentAt: string };
  /** A drafted offer awaiting /confirm in Telegram; cleared on confirm or cancel. */
  pendingOffer?: { low: number; high: number; at: string };
  /** A drafted "ask for info" awaiting ✅ Send in Telegram — the questions the owner
   * typed, shown in an email preview first. Cleared on send or cancel. Mirrors pendingOffer. */
  pendingInfo?: string[];
  /** A drafted free-text message awaiting ✅ Send in Telegram, shown in an email
   * preview first. Cleared on send or cancel. Mirrors pendingOffer. */
  pendingMessage?: string;
  /** A phone/email the owner typed via /addphone or /addemail inside a topic, awaiting
   * ✅ Add confirmation. Cleared on add or cancel. Mirrors pendingOffer. */
  pendingContactEdit?: { field: "phone" | "email"; value: string; at: string };
  /** Owner-logged negotiation trail from Telegram: the customer's asks + our
   * offers over time (+ a final "bought"), for ask-vs-offer / realistic-seller
   * analysis. Decoupled from the email-offer flow so phone-only leads log too. */
  negotiation?: NegotiationEntry[];
  /** Telegram message id + chat of the lead's OWN alert message, which the bot edits
   * in place to fold in the negotiation trail (no separate scoreboard message).
   * negChatId may be a numeric id OR an @channelusername, hence number | string. */
  negMsgId?: number;
  negChatId?: number | string;
  /** The Telegram forum topic (message_thread_id) for THIS lead's conversation in the
   * Replies-group Topics inbox, plus the (post-migration) supergroup id the topic lives
   * in. Distinct from negMsgId/negChatId (which point at the Leads-group ALERT message).
   * replyTopicPending is a transient create-once lock, removed once replyTopicId is set. */
  replyTopicId?: number;
  replyTopicChatId?: number | string;
  replyTopicPending?: boolean;
  /** Highest Telegram message_id we've already relayed FROM this lead's topic to the
   * customer. Monotonic guard: a redelivered/duplicate in-topic message (id ≤ this)
   * is skipped so the owner's reply can never be sent to the customer twice. */
  lastRelayMsgId?: number;
  /** The buttons-only "action bar" message in this lead's topic. It's deleted and
   * re-posted under the newest message after every topic post, so the action buttons
   * always sit at the bottom of the conversation (no scrolling up to act). */
  topicActionBarMsgId?: number;
  /** When the owner taps a topic action button, which action is awaiting his typed
   * input (with a timestamp for expiry). His next plain message in that topic is then
   * treated as the input for THIS action — not relayed to the customer — sidestepping
   * flaky force-reply on mobile/in topics. kind ∈ ask|offer|bought (log a number) or
   * eoffer|einfo|emsg (draft an email). promptMsgId is the "type your …" prompt message
   * so it can be auto-deleted once the input arrives. Cleared once consumed/cancelled/expired. */
  pendingTopicAction?: { kind: string; at: string; promptMsgId?: number };
  /** Set when the owner taps "📞 Called" to mark the lead contacted by phone. The
   * button is a toggle on the contacted state (new↔contacted): pressing it when the
   * lead is already contacted — even from an auto email-contact — moves it back to
   * new. Drives the "📞 Called" marker on the alert. */
  calledAt?: string;
  /** Manual campaign attribution set from the admin "assign to campaign" cleanup.
   * Kept SEPARATE from the tracked attribution.utmCampaign so it never pollutes the
   * "as-tracked / Meta" view — only the "my data" (corrected) view uses it. */
  assignedCampaign?: string;
  /** Resend ids of the scheduled reminder-drip emails (cancelled when the lead leaves "new"). */
  dripEmailIds?: string[];
  /** Lifecycle timestamps (ISO) for the follow-up cadence + back-half metrics. */
  firstTouchAt?: string; // first outbound touch (owner or automated) after createdAt
  contactedAt?: string;
  offerSentAt?: string;
  scheduledAt?: string;
  closedAt?: string;
  lostAt?: string;
  spamAt?: string;
  /** Owner-entered reason when marked lost; flows to GA4 close_unconvert_lead. */
  lostReason?: string;
  /** Inspection/appointment time — a real field now, not just free-text notes. */
  appointmentAt?: string;
  /** When the T-2h appointment reminder was sent (idempotency for the cron). */
  apptRemindedAt?: string;
  /** Where the customer wants to meet for the inspection (customer self-booking). */
  appointmentLocation?: string;
  /** True when the customer booked their own slot (vs the owner's /schedule). */
  bookedByCustomer?: boolean;
  /** Set when the customer clicks "confirm" on the day-of reminder. */
  appointmentConfirmedAt?: string;
  /** When the day-of booking reminder was sent (idempotency for the cron). */
  dayOfRemindedAt?: string;
  /** Unguessable token that authorizes the customer self-booking link /book/<token>. */
  bookingToken?: string;
  /** When a "need more info" / question email was last sent (base for the awaiting-info reminders). */
  moreInfoSentAt?: string;
  /** The questions asked via /moreinfo, so the awaiting-info reminder can repeat them. */
  infoQuestions?: string[];
  /** Owner stale-lead SLA nudges already sent (idempotency guard for the cron). */
  staleNudges?: number;
  lastNudgedAt?: string;
  /** ISO time the owner was pinged in Telegram about this as an abandoned (partial)
   * lead — once-only guard so a repeated pre-submit beacon doesn't re-alert. */
  partialNotifiedAt?: string;
  /** Customer nurture cadence, DECOUPLED from status: which follow-up track/step is
   * active, a pause-until gate, and the last automated-nurture timestamp (idempotency). */
  nurtureStage?: string;
  nurturePausedUntil?: string;
  lastNurtureAt?: string;
  /** True once the customer texted STOP (or Twilio flagged them) — suppresses ALL further SMS. */
  smsOptOut?: boolean;
  /** When the customer texted STOP (opt-out timestamp, for CASL audit + timeline). */
  smsOptOutAt?: string;
  /** Coarse origin parsed from an inbound SMS (Twilio From* fields) — distinct
   * from the IP-derived Lead.geo, never overwrites it. */
  smsOrigin?: { city?: string; state?: string; zip?: string };
  /** First-touch marketing attribution (which ad/campaign/referrer brought them). */
  attribution?: Attribution;
  /** Every marketing source that brought this person in, oldest first (multi-touch). */
  touchHistory?: Touch[];
  /** Lightweight on-site behavior summary captured client-side. */
  behavior?: Behavior;
  /** GA4 client_id (from the _ga cookie) captured at submission, for GA session stitching. */
  gaClientId?: string;
  /** GA4 session id parsed from the _ga_<container> cookie at submit. */
  gaSessionId?: string;
  /** First landing path (+query) — quick access without digging into `attribution`. */
  landingPath?: string;
  /** External referrer URL at first touch. */
  referrerUrl?: string;
  /** Coarse geolocation resolved from the client IP (country/province/city). */
  geo?: Geo;
  /** Meta Lead Ads leadgen_id — set only on leads that arrived via the Instant-Form
   * webhook (app/api/webhooks/meta-leads); used to dedupe Meta's at-least-once
   * webhook redelivery so a lead is created exactly once. */
  metaLeadgenId?: string;
  /** Inbound-reply signals folded onto the profile by the SMS/email/chat handlers. */
  lastReplyAt?: string;
  repliesCount?: number;
  lastInboundChannel?: "sms" | "email" | "chat";
  /** Aggregated email receipts stamped by the Resend webhook (delivery/open/click). */
  emailEngagement?: EmailEngagement;
  /** Aggregated SMS delivery receipts stamped by the Twilio status callback. */
  smsEngagement?: SmsEngagement;
  /** True once the customer marked an email as spam (CASL: stop nurture email). */
  emailOptOut?: boolean;
  /** True once an email hard-bounced — the address is bad; all sends skip it. */
  emailBounced?: boolean;
  /** Rolling log of comms receipts (oldest first, capped ~100). */
  commsEvents?: CommsEvent[];
  source: string;
}

/** One row in the first-party events table (AutoOfferEvents). Written by
 * /api/events from the client beacon (lib/events.ts); expired by DynamoDB TTL
 * after ~12 months. */
export interface SiteEvent {
  /** Partition key — the same behavior.sessionId stored on leads. */
  sessionId: string;
  /** Sort key: `${at}#${rand}` so same-millisecond events don't collide. */
  sk: string;
  /** Event name (page_view, offer_flow_start, form_error, …). */
  n: string;
  /** Clamped event params. */
  p?: Record<string, string | number | boolean>;
  path?: string;
  at: string;
  /** Durable per-browser visitor id (behavior.visitorId), when the client sent one. */
  vid?: string;
  /** Present when the event carried a booking token the server resolved. */
  leadId?: string;
  /** Epoch-seconds TTL attribute. */
  ttl: number;
}

/** Zero-input enrichment computed at read time from data the customer already
 * gave us (lib/enrich.ts) — no extra form fields, no external APIs. */
export interface Enrichment {
  emailType?: "personal" | "business" | "disposable";
  phoneRegion?: string;
  vehicleTier?: "high" | "mid" | "low";
  vehicleAge?: number;
  /** IP-derived province disagrees with the phone's area-code province (or the IP
   * is outside Canada while the phone is Canadian) — a soft travel/VPN/quality
   * signal, never an auto-reject. */
  regionMismatch?: boolean;
  /** The IP's international calling code isn't Canada/US (+1) — a cheap
   * offshore-submission tell computed from geo already on the lead. */
  foreignNumber?: boolean;
  /** The IP's IANA timezone is outside Canada — a "local" lead browsing from
   * another time zone (travel, VPN, or out-of-province spam). */
  tzMismatch?: boolean;
  /** How many OTHER leads share this lead's network (geo.asn) — 2+ from one
   * unusual network suggests a single actor spamming the form. */
  sameNetworkLeads?: number;
  /** Pre-inspection warnings parsed from the condition chips + note (branded
   * title, possible lien, not running, …) — from data the seller already gave. */
  conditionFlags?: string[];
  /** Odometer vs a Canadian-average km/year model (not a market API call). */
  mileageVsMarket?: "low" | "average" | "high";
  /** Coarse channel tier from the external referrer host. */
  referrerQuality?: "search" | "social" | "referral";
}

/** One explainable factor of the lead score. */
export interface ScoreFactor {
  label: string;
  points: number;
  max: number;
}

/** One event on a person's unified timeline. */
export interface ProfileEvent {
  at: string;
  type: "lead" | "partial" | "offer" | "booking" | "reply" | "chat" | "referral" | "close" | "comms" | "site";
  label: string;
  leadId?: string;
}

/** One person, stitched from all their leads/partials/referrals/chats. Computed
 * at read time by lib/profiles.ts; carries everything the dashboard filters on. */
export interface Profile {
  id: string;
  name?: string;
  emails: string[];
  phones: string[];
  stage: LeadStatus;
  /** True when the person has at least one submitted (non-partial, non-spam) lead. */
  hasRealLead: boolean;
  contactMethod?: "call" | "text" | "email";
  source: string;
  attribution?: Attribution;
  /** Merged multi-touch journey across this person's leads, oldest first. */
  touchHistory?: Touch[];
  behavior?: Behavior;
  geo?: Geo;
  device?: DeviceInfo;
  createdAt?: string;
  firstSeenAt?: string;
  lastActivityAt?: string;
  touchCount: number;
  vehicles: string[];
  make?: string;
  offer?: { low: number; high: number; sentAt: string };
  offerMid?: number;
  /** Merged negotiation trail across this person's leads (oldest first). */
  negotiation?: NegotiationEntry[];
  appointmentAt?: string;
  /** Back-compat: total cost paid out across closed leads (== cashPaidOut). */
  purchasePrice?: number;
  /** Sum of purchasePrice (cost) across this person's CLOSED leads. */
  cashPaidOut?: number;
  /** Sum of actualSalePrice (or expectedResale as a fallback) across CLOSED leads. */
  revenue?: number;
  /** Sum of (sale − cost) across CLOSED leads. */
  margin?: number;
  /** True when margin includes an estimated (not actual) sale price for at least one closed lead. */
  marginIsEstimate?: boolean;
  /** Earliest lead.contactedAt across this person's real leads (ISO). */
  contactedAt?: string;
  /** Earliest lead.offerSentAt across this person's real leads (ISO). */
  offerSentAt?: string;
  /** Earliest lead.scheduledAt across this person's real leads (ISO). */
  scheduledAt?: string;
  /** Latest lead.closedAt among this person's closed leads (ISO). */
  closedAt?: string;
  firstResponseMins?: number;
  repliesCount: number;
  /** Summed email receipts across this person's leads (Resend webhook). */
  emailEngagement?: EmailEngagement;
  /** Summed SMS delivery receipts across this person's leads (Twilio callback). */
  smsEngagement?: SmsEngagement;
  emailOptOut?: boolean;
  emailBounced?: boolean;
  smsOptOut?: boolean;
  /** Zero-input enrichment (email type, phone region, vehicle tier). */
  enrichment?: Enrichment;
  /** Customer's stated best time to reach them (lifted from their lead). */
  bestTime?: string;
  /** Distinct on-site sessions stitched to this person — a return-visit signal. */
  returnVisits?: number;
  /** Time from first seen on site to first lead submit (ms). */
  timeToConvMs?: number;
  /** Referred someone AND is a seller themselves (repeat customer). */
  referrerIsSeller?: boolean;
  /** A referral whose referrer + friend share a contact — likely gaming the reward. */
  selfReferral?: boolean;
  /** Minutes from email delivered → first open (hot-lead timing). */
  emailOpenLatencyMins?: number;
  /** Transparent 0–100 lead score — a prioritization aid, not ML. */
  score: number;
  /** Per-factor breakdown so every point is explainable. */
  scoreBreakdown: ScoreFactor[];
  timeline: ProfileEvent[];
  /** The underlying record ids this profile was stitched from — used to soft-delete
   * (archive) the whole person from the datasets, including profiles with NO lead
   * (a referrer or a chat-only visitor). */
  leadIds: string[];
  referralIds: string[];
  chatIds: string[];
  /** Manual campaign override derived from the profile's leads (admin "assign to
   * campaign"). Only the corrected/"my data" dashboard view honors it. */
  assignedCampaign?: string;
}

/** One campaign's ad performance pulled from the Meta Marketing API. */
export interface AdInsight {
  campaign: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number; // percent
  cpc: number; // $ per click
  reach?: number;
  leads?: number; // Meta Pixel "Lead" conversions attributed to this campaign
  costPerLead?: number; // Meta's cost per lead ($) — matches Ads Manager
}

/** One ad's (creative-level) performance pulled from the Meta Marketing API,
 * including the video hook/hold metrics used to spot weak creative. */
export interface AdInsightAd {
  campaignId: string;
  campaign: string;
  adsetId: string;
  adset: string;
  adId: string;
  ad: string;
  spend: number;
  impressions: number;
  reach?: number;
  frequency?: number;
  linkClicks: number; // inline_link_clicks — matches Ads Manager's "Link Clicks"
  linkCtr?: number; // percent
  cpm?: number; // $ per 1,000 impressions
  leads?: number; // Meta Pixel "Lead" conversions attributed to this ad
  costPerLead?: number; // $ per lead
  video3s?: number; // "3-second video plays" (video_view actions)
  thruplay?: number; // Meta ThruPlays
  hookRate?: number; // percent: video3s / impressions — did the opening hook grab attention
  holdRate?: number; // percent: thruplay / video3s — did viewers stick around after the hook
}

/** Aggregate site traffic pulled from the GA4 Data API. */
export interface Ga4Traffic {
  totals: { users: number; newUsers: number; sessions: number; pageviews: number; engagementRate: number };
  overTime: { date: string; users: number }[];
  bySource: { label: string; users: number; sessions: number }[];
  byCountry: { label: string; users: number }[];
  byDevice: { label: string; users: number }[];
  /** Additional aggregate breakdowns (Batch 7) — all from the same batch call. */
  byNewReturning?: { label: string; users: number; sessions: number }[];
  byCity?: { label: string; users: number }[];
  byChannel?: { label: string; users: number; sessions: number }[];
  byLanding?: { label: string; users: number; sessions: number }[];
  /** Key events (conversions) crossed with session source/medium — GA4's own
   * leads-per-source view. Zero rows until events are marked Key in GA4 admin. */
  leadsBySource?: { label: string; keyEvents: number; sessions: number }[];
  /** Day-of-week (0=Sun per GA4) × hour sessions grid — when VISITORS browse,
   * the traffic-side twin of the first-party lead-arrival heatmap. */
  visitHeat?: { dow: number; hour: number; sessions: number }[];
}

/** One Clarity "smart insight" behaviour (rage clicks, dead clicks, etc.). */
export interface ClarityBehavior {
  key: string;
  label: string;
  /** Sessions that exhibited the behaviour in the window. */
  sessions: number;
  /** Share of sessions (0–100), when Clarity provides it. */
  pct?: number;
}

/** Aggregate numbers pulled back from Microsoft Clarity's Data Export API.
 * Clarity caps this at the last 1–3 days of data and 10 pulls/day, so it's
 * fetched behind a multi-hour shared cache (see lib/clarityData.ts). */
export interface ClarityInsights {
  days: number;
  sessions: number;
  bots: number;
  distinctUsers: number;
  pagesPerSession: number;
  /** Average scroll depth, percent. */
  avgScrollDepth: number;
  /** Active engagement time in seconds, when Clarity provides it. */
  avgEngagementSec?: number;
  behaviors: ClarityBehavior[];
  /** ISO time we last pulled from the API (drives the "refreshed X ago" line). */
  fetchedAt: string;
}

export interface Referral {
  id: string;
  createdAt: string;
  status: "new" | "qualified" | "paid";
  referrer: { name: string; email: string; phone?: string };
  friend: { name?: string; phone?: string; email?: string };
  message?: string;
  /** Shareable code generated for the referrer. */
  code: string;
  notes?: string;
  /** Soft delete: hidden from the Referrals list + excluded from analytics,
   * restorable from the Referrals "Deleted" view. No permanent delete. */
  archived?: boolean;
  archivedAt?: string;
  /** First-touch marketing attribution for the referrer (which ad/campaign/referrer
   * brought them in). Skipped when consent was denied at submit time. */
  attribution?: Attribution;
  /** The referrer's multi-touch journey, oldest first. Skipped on consent denial. */
  touchHistory?: Touch[];
  /** The referrer's on-site behavior summary. Skipped on consent denial. */
  behavior?: Behavior;
}

/**
 * A vehicle price-lookup event (the admin "API Calls" log). Captured on every
 * real /api/estimate call — anonymous, no contact info. Records what was looked
 * up, the result shown, whether it cost a live MarketCheck call or came from
 * cache, and whether the visitor then submitted their contact info (a lead).
 */
export interface Lookup {
  id: string;
  createdAt: string; // ISO timestamp
  vehicle: VehicleInfo;
  /** "priced" = a $ range was shown; "unique" = no price, sent to the custom-offer form. */
  outcome: "priced" | "unique";
  /** The range the visitor was shown (priced outcomes only). */
  estimate?: {
    low: number;
    high: number;
    mid: number;
    source?: "market" | "estimate";
    comps?: number;
  };
  /** Real MarketCheck API calls made for this lookup (0 = served from cache / no call). */
  apiCalls: number;
  /** True when a cached value was used (no fresh API call). */
  cached: boolean;
  /** Did the visitor go on to submit their contact info (become a lead)? */
  converted: boolean;
  /** The linked lead id, when converted (for admin click-through). */
  leadId?: string;
}

export interface ChatMessage {
  id: string;
  role: "visitor" | "admin";
  text: string;
  at: string; // ISO timestamp
}

export interface ChatConversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Optional visitor name. */
  name?: string | null;
  /** Visitor's phone or email — required before they can send their first message. */
  contact?: string | null;
  messages: ChatMessage[];
  /** Who sent the most recent message (drives the admin "needs reply" cue). */
  lastSender: "visitor" | "admin";
  /** Soft delete: hidden from Messages + excluded from analytics, restorable from
   * the Messages "Deleted" view. No permanent delete. */
  archived?: boolean;
  archivedAt?: string;
  /** Context captured on the first message (Batch 8) so the chat stitches into
   * the person's Customer-360 profile (on-site activity, source, device, geo).
   * visitorId/sessionId/path/attribution ride from the widget; userAgent/clientIp
   * are server-side and consent-gated; geo is resolved later by the cron. */
  visitorId?: string;
  sessionId?: string;
  startedOnPath?: string;
  /** Most recent page the visitor messaged from (updated on every message,
   * unlike startedOnPath which keeps the first). */
  lastPath?: string;
  attribution?: Attribution;
  userAgent?: string;
  clientIp?: string;
  geo?: Geo;
}
