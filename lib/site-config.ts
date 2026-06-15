// ===========================================================================
//  Auto Offer — site configuration (SINGLE SOURCE OF TRUTH)
//  Replace every value marked PLACEHOLDER with your real business details.
//  Everything on the site (header, footer, contact page, call buttons, map)
//  reads from here, so you only edit it once.
// ===========================================================================

export const site = {
  name: "Auto Offer",
  legalName: "Auto Offer Inc.",
  tagline: "Sell your car the easy way.",
  description:
    "Auto Offer buys cars right across Canada. Get a fast, fair offer by phone or email, we inspect at a time and place that works for you, and you get paid — no haggling, no dealership runaround.",

  // ---- CONTACT — PLACEHOLDERS (replace with your real details) -------------
  phoneDisplay: "(780) 952-4504", //                         PLACEHOLDER
  phoneE164: "+17809524504", //  used for tel: links —        PLACEHOLDER
  email: "offers@autooffer.ca", //                           PLACEHOLDER

  address: {
    line1: "123 Example Avenue NW", //                       PLACEHOLDER
    city: "Calgary", //                                      PLACEHOLDER
    province: "AB", //                                       PLACEHOLDER
    postal: "T2P 1A1", //                                    PLACEHOLDER
    country: "Canada",
  },

  hours: "Mon – Sun: 8:00 AM – 10:00 PM MT", //              PLACEHOLDER

  // ---- GOOGLE MAP ---------------------------------------------------------
  // No API key needed. Replace the address in q= with your real one
  // (spaces become +). Example: q=123+Example+Ave+NW,+Calgary,+AB
  mapEmbedSrc:
    "https://www.google.com/maps?q=Calgary,+AB,+Canada&z=11&output=embed",
  mapLink:
    "https://www.google.com/maps/search/?api=1&query=Calgary%2C+AB%2C+Canada",

  // ---- SOCIAL (use # to hide a link) --------------------------------------
  social: {
    facebook: "#", //                                        PLACEHOLDER
    instagram: "#", //                                       PLACEHOLDER
  },

  // ---- REVIEWS (link to your Google/Facebook reviews; "" hides prompts) ----
  reviewsUrl: "", //                                         PLACEHOLDER

  // ---- LICENSING / TRUST --------------------------------------------------
  // Leave any of these blank ("") and the trust badge for it stays hidden,
  // so nothing fake is ever shown. Fill them in once you have them.
  amvicNumber: "", //  e.g. "AMVIC #123456"                  PLACEHOLDER
  businessNumber: "", //  e.g. "AB Corp. #2021234567"        PLACEHOLDER
  insured: true, //  show a "Bonded & insured" trust line

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

export const fullAddress = `${site.address.line1}, ${site.address.city}, ${site.address.province} ${site.address.postal}`;

// Convenience: the href for a click-to-call link.
export const telHref = `tel:${site.phoneE164}`;
export const mailHref = `mailto:${site.email}`;
