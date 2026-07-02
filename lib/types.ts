// Shared data types for leads and referrals.

export type LeadKind = "vehicle" | "inquiry";

export type LeadStatus =
  | "new"
  | "contacted"
  | "scheduled"
  | "closed"
  | "lost"
  | "spam";

export const LEAD_STATUSES: LeadStatus[] = [
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
  source: string;
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
