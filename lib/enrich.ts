// ===========================================================================
//  Zero-input enrichment — pure functions that squeeze extra signal out of data
//  the customer ALREADY gave us (no new form fields, no external APIs, no
//  storage). Computed at read time by lib/profiles.ts. Client-safe.
// ===========================================================================

export type EmailType = "personal" | "business" | "disposable";
export type VehicleTier = "high" | "mid" | "low";

/** Free/consumer mail providers (incl. the big Canadian ISPs). */
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.ca", "live.com", "live.ca",
  "msn.com", "yahoo.com", "yahoo.ca", "ymail.com", "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me", "aol.com", "gmx.com", "gmx.net", "mail.com", "zoho.com",
  "telus.net", "shaw.ca", "rogers.com", "bell.net", "sympatico.ca", "sasktel.net", "eastlink.ca",
]);

/** Known throwaway providers — a spam/low-intent signal. */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com",
  "maildrop.cc", "fakeinbox.com", "throwawaymail.com",
]);

/** personal (free provider) | business (custom domain — possible fleet/dealer)
 * | disposable (throwaway). undefined when there's no parseable email. */
export function emailType(email?: string): EmailType | undefined {
  const domain = (email || "").trim().toLowerCase().split("@")[1];
  if (!domain || !domain.includes(".")) return undefined;
  if (DISPOSABLE_DOMAINS.has(domain)) return "disposable";
  if (PERSONAL_DOMAINS.has(domain)) return "personal";
  return "business";
}

/** Canadian area-code → region. Fills the geo gap when IP lookup never
 * resolved (the cron's known lossy spot) — a phone number always has one. */
const AREA_CODES: Record<string, string> = {
  // Alberta
  "403": "Calgary & Southern AB", "587": "Alberta", "825": "Alberta", "368": "Alberta",
  "780": "Edmonton & Northern AB",
  // BC
  "604": "Vancouver area, BC", "778": "BC", "236": "BC", "672": "BC", "250": "BC Interior/Island",
  // Prairies
  "306": "Saskatchewan", "639": "Saskatchewan", "474": "Saskatchewan",
  "204": "Manitoba", "431": "Manitoba", "584": "Manitoba",
  // Ontario
  "416": "Toronto, ON", "647": "Toronto, ON", "437": "Toronto, ON",
  "905": "Greater Toronto, ON", "289": "Greater Toronto, ON", "365": "Greater Toronto, ON", "742": "Greater Toronto, ON",
  "613": "Ottawa, ON", "343": "Ottawa, ON",
  "519": "Southwestern ON", "226": "Southwestern ON", "548": "Southwestern ON",
  "705": "Northern ON", "249": "Northern ON", "683": "Northern ON", "807": "Northwestern ON",
  // Quebec
  "514": "Montreal, QC", "438": "Montreal, QC", "263": "Montreal, QC",
  "450": "Greater Montreal, QC", "579": "Greater Montreal, QC", "354": "Greater Montreal, QC",
  "418": "Quebec City, QC", "581": "Quebec City, QC", "367": "Quebec City, QC",
  "819": "Quebec", "873": "Quebec",
  // Atlantic + North
  "902": "NS / PEI", "782": "NS / PEI", "506": "New Brunswick", "428": "New Brunswick",
  "709": "Newfoundland", "867": "Northern territories",
};

/** Coarse region from a Canadian/US phone number's area code. */
export function phoneRegion(phone?: string): string | undefined {
  const d = (phone || "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d.length === 10 ? d : "";
  if (!ten) return undefined;
  return AREA_CODES[ten.slice(0, 3)] || "Other / non-Canadian";
}

const LUXURY_MAKES = new Set([
  "bmw", "mercedes-benz", "mercedes", "audi", "lexus", "porsche", "tesla",
  "land rover", "range rover", "jaguar", "acura", "infiniti", "cadillac",
  "lincoln", "genesis", "volvo", "alfa romeo", "maserati", "bentley", "rivian", "lucid",
]);

/** Value tier for a vehicle. A real offer (mid) wins; otherwise a make+age
 * heuristic. Returns undefined when there's nothing to go on. */
export function vehicleTier(
  make?: string,
  year?: number | string,
  offerMid?: number,
): { tier: VehicleTier; age?: number } | undefined {
  const y = Number(year);
  const age = Number.isFinite(y) && y > 1900 ? Math.max(0, new Date().getFullYear() - y) : undefined;
  if (offerMid && offerMid > 0) {
    return { tier: offerMid >= 20_000 ? "high" : offerMid >= 8_000 ? "mid" : "low", ...(age !== undefined ? { age } : {}) };
  }
  const lux = LUXURY_MAKES.has((make || "").trim().toLowerCase());
  if (!make && age === undefined) return undefined;
  if (age === undefined) return { tier: lux ? "high" : "mid" };
  const tier: VehicleTier = age <= 5 || (lux && age <= 8) ? "high" : age <= 12 ? "mid" : "low";
  return { tier, age };
}
