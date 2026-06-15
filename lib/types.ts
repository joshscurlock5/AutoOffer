// Shared data types for leads and referrals.

export type LeadKind = "vehicle" | "inquiry";

export type LeadStatus =
  | "new"
  | "contacted"
  | "scheduled"
  | "paid"
  | "lost";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "scheduled",
  "paid",
  "lost",
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
}

export interface OfferEstimate {
  low: number;
  high: number;
  mid: number;
  currency: "CAD";
  /** True when we could not price the vehicle (routes to "unique" flow). */
  unique?: boolean;
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
