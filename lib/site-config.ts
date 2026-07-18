// ===========================================================================
//  DriveOffer — site configuration (SINGLE SOURCE OF TRUTH)
//  Replace every value marked PLACEHOLDER with your real business details.
//  Everything on the site (header, footer, contact page, call buttons, map)
//  reads from here, so you only edit it once.
// ===========================================================================

export const site = {
  name: "DriveOffer",
  legalName: "DriveOffer Inc.",
  tagline: "Sell your car the easy way.",
  // Canonical site origin — used for SEO canonical URLs + JSON-LD. ⚠️ confirm real domain.
  url: "https://www.driveoffer.ca", // canonical host — the apex 404s static assets; the site serves on www
  description:
    "DriveOffer buys cars right across Canada. Get a fast, fair offer by phone or email, we inspect at a time and place that works for you, and you get paid — no haggling, no dealership runaround.",

  // ---- CONTACT — PLACEHOLDERS (replace with your real details) -------------
  phoneDisplay: "(780) 952-4504", //                         PLACEHOLDER
  phoneE164: "+17809524504", //  used for tel: links —        PLACEHOLDER
  email: "driveofferca@gmail.com", //                        real inbox

  address: {
    line1: "8923 137 Ave NW",
    city: "Edmonton",
    province: "AB",
    postal: "", //  add your postal code here if you'd like it shown
    country: "Canada",
  },

  hours: "Every day, 8 AM–12 PM",
  // Shown next to the hours so an after-hours visitor knows the form is always open.
  hoursNote: "You can request an offer online anytime — we reply during business hours.",

  // ---- GOOGLE MAP ---------------------------------------------------------
  // No API key needed. Replace the address in q= with your real one
  // (spaces become +).
  mapEmbedSrc:
    "https://www.google.com/maps?q=8923+137+Ave+NW,+Edmonton,+AB,+Canada&z=15&output=embed",
  mapLink:
    "https://www.google.com/maps/search/?api=1&query=8923+137+Ave+NW%2C+Edmonton%2C+AB%2C+Canada",

  // ---- SOCIAL (use # to hide a link) --------------------------------------
  social: {
    facebook: "#", //                                        PLACEHOLDER
    instagram: "#", //                                       PLACEHOLDER
  },

  // ---- REVIEWS (link to your Google/Facebook reviews; "" hides prompts) ----
  reviewsUrl: "https://g.page/r/CVt_QnCYRto-EBM", //  Google Business Profile (view reviews); add "/review" to deep-link the write-a-review dialog
  googleRating: "5.0", //  shown beside the stars on the trust bar + in emails

  // ---- OWNER / LICENSING / TRUST ------------------------------------------
  // Leave any string blank ("") and its trust badge stays hidden.
  owner: "Samir Osman", //                                   real owner / founder
  amvicNumber: "B2036941", //                                AMVIC licence number
  amvicClass: "Wholesaler", //                               AMVIC licence class
  businessNumber: "", //  GST / AB corp # — used on invoices, not required on the site
  bonded: false, //  ⚠️ NOT bonded — never display "bonded" anywhere
  insured: true, //  carries commercial dealer-plate insurance
  insuranceText: "$3M dealer-plate insurance", //  the business's OWN coverage (NOT customer coverage)
  yearsExperience: 5, //                                     years wholesaling
  carsBought: 3000, //  vehicles purchased — single source of truth for the "cars" stat
  // Total paid out to sellers. Sits beside carsBought on the trust bar and in every
  // email, so the two must stay in step — a reader who divides them gets the average
  // price per car (currently ~$15k). Move one, move the other.
  amountPaid: 45_000_000,

  // ---- TEAM / OWNERSHIP ---------------------------------------------------
  // ⚠️ operatedBy MUST match your registered business name exactly — this is
  // what SMS carriers / Twilio A2P verification check against the site.
  operatedBy: "Scurlock LLC", //  legal entity that owns & operates DriveOffer
  team: [
    { name: "Joshua Scurlock", role: "Founder & Owner" },
    { name: "Samir Osman", role: "Founder & Owner" },
    { name: "Aaron Scurlock", role: "Data Analyst" },
  ],

  // ---- REFERRAL PROGRAM ---------------------------------------------------
  referralReward: 100, // dollars paid when a referred friend sells

  // ---- COVERAGE -----------------------------------------------------------
  provinces: [
    "Alberta",
    "British Columbia",
    "Saskatchewan",
    "Manitoba",
    "Ontario",
    "Quebec",
    "Nova Scotia",
    "New Brunswick",
  ],
} as const;

export const fullAddress = [
  site.address.line1,
  site.address.city,
  `${site.address.province} ${site.address.postal}`.trim(),
]
  .filter(Boolean)
  .join(", ");

// Convenience: the href for a click-to-call link.
export const telHref = `tel:${site.phoneE164}`;
export const mailHref = `mailto:${site.email}`;

// "AMVIC Licensed Wholesaler #B2036941" — empty until the licence number is set.
export const amvicLicence = site.amvicNumber
  ? `AMVIC Licensed ${site.amvicClass} #${site.amvicNumber}`
  : "";

// ---- Trust-bar stats — ONE definition, rendered by both the website
// (components/WhySell.tsx) and every customer email (lib/email.ts proofBox).
// Change a number in `site` above and both surfaces follow. Don't hardcode
// these anywhere else.
export const carsBoughtDisplay = `${site.carsBought.toLocaleString("en-CA")}+`; // "3,000+"
export const amountPaidDisplay = site.amountPaid
  ? `$${Math.round(site.amountPaid / 1_000_000)}M+` // "$45M+"
  : "";
