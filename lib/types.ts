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
  /** External referrer at first touch (same-origin referrers are dropped). */
  referrer?: string;
  /** First landing path (+query). */
  landingPath?: string;
  landingAt?: string;
}

/** Lightweight on-site behavior summary, accumulated client-side in localStorage
 * across the session and sent with the lead. */
export interface Behavior {
  sessionId?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  pageviews?: number;
  /** Furthest offer-flow step reached (1=vehicle, 2=details, 3=contact, 5=done). */
  maxFunnelStep?: number;
  /** lastSeenAt − firstSeenAt, computed at read time. */
  timeOnSiteMs?: number;
}

/** Coarse geolocation resolved from the client IP (best-effort, ~province-level). */
export interface Geo {
  country?: string;
  countryCode?: string;
  region?: string; // province / state
  city?: string;
  resolvedAt?: string;
}

/** Device/browser parsed from the user-agent (computed at read time). */
export interface DeviceInfo {
  type?: "mobile" | "desktop" | "tablet";
  os?: string;
  browser?: string;
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
  /** Final price the vehicle was purchased for (CAD). */
  purchasePrice?: number;
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
  /** ISO timestamp set once the offline "Purchase" conversion was sent to Meta (idempotency guard). */
  purchaseSyncedAt?: string;
  /** Offer emailed to the customer via the /offer Telegram command (CAD). */
  offer?: { low: number; high: number; sentAt: string };
  /** A drafted offer awaiting /confirm in Telegram; cleared on confirm or cancel. */
  pendingOffer?: { low: number; high: number; at: string };
  /** Resend ids of the scheduled reminder-drip emails (cancelled when the lead leaves "new"). */
  dripEmailIds?: string[];
  /** Lifecycle timestamps (ISO) for the follow-up cadence + back-half metrics. */
  firstTouchAt?: string; // first outbound touch (owner or automated) after createdAt
  contactedAt?: string;
  offerSentAt?: string;
  scheduledAt?: string;
  closedAt?: string;
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
  /** Customer nurture cadence, DECOUPLED from status: which follow-up track/step is
   * active, a pause-until gate, and the last automated-nurture timestamp (idempotency). */
  nurtureStage?: string;
  nurturePausedUntil?: string;
  lastNurtureAt?: string;
  /** True once the customer texted STOP (or Twilio flagged them) — suppresses ALL further SMS. */
  smsOptOut?: boolean;
  /** First-touch marketing attribution (which ad/campaign/referrer brought them). */
  attribution?: Attribution;
  /** Lightweight on-site behavior summary captured client-side. */
  behavior?: Behavior;
  /** GA4 client_id (from the _ga cookie) captured at submission, for GA session stitching. */
  gaClientId?: string;
  /** First landing path (+query) — quick access without digging into `attribution`. */
  landingPath?: string;
  /** External referrer URL at first touch. */
  referrerUrl?: string;
  /** Coarse geolocation resolved from the client IP (country/province/city). */
  geo?: Geo;
  /** Inbound-reply signals folded onto the profile by the SMS/email/chat handlers. */
  lastReplyAt?: string;
  repliesCount?: number;
  lastInboundChannel?: "sms" | "email" | "chat";
  source: string;
}

/** One event on a person's unified timeline. */
export interface ProfileEvent {
  at: string;
  type: "lead" | "partial" | "offer" | "booking" | "reply" | "chat" | "referral" | "close";
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
  contactMethod?: "call" | "text" | "email";
  source: string;
  attribution?: Attribution;
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
  appointmentAt?: string;
  purchasePrice?: number;
  firstResponseMins?: number;
  repliesCount: number;
  timeline: ProfileEvent[];
  leadIds: string[];
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

/** Aggregate site traffic pulled from the GA4 Data API. */
export interface Ga4Traffic {
  totals: { users: number; newUsers: number; sessions: number; pageviews: number; engagementRate: number };
  overTime: { date: string; users: number }[];
  bySource: { label: string; users: number; sessions: number }[];
  byCountry: { label: string; users: number }[];
  byDevice: { label: string; users: number }[];
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
}
