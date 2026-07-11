// ===========================================================================
//  Live "is it actually used?" status for the Sources tab's brainstorm tiers.
//  Reorganized 2026-07-11 alongside dataSourcesBrainstorm.ts:
//
//  - Every "Collected — usage at a glance" (underutilized) item is "live" —
//    that tier now contains ONLY things that are surfaced/acting today.
//  - Every "Worth building" (buildNext) item is partial / todo / config /
//    dormant — the pill tells the owner how far along it is.
//  - "Could collect" (opportunities) items normally have NO entry (they are
//    deliberately not built); the rare exception is a dormant one whose
//    machinery exists but is gated off.
//
//  Keep in sync as items ship: flip an item to "live" here AND move it up to
//  underutilized in dataSourcesBrainstorm.ts.
// ===========================================================================

export type UseStatus = "live" | "partial" | "dormant" | "config" | "todo";

export const USE_STATUS_META: Record<UseStatus, { label: string; cls: string; desc: string }> = {
  live: { label: "In use", cls: "bg-emerald-100 text-emerald-800", desc: "Now surfaced in the dashboard (or drives an action) — you can read/act on it today." },
  partial: { label: "Partly set up", cls: "bg-teal-100 text-teal-700", desc: "Part of it exists today — the rest still needs building. Hover the item for exactly what's missing." },
  dormant: { label: "Waiting", cls: "bg-slate-100 text-slate-600", desc: "Wired up but idle until an upstream feature is switched on (the instant estimate, or SMS/Twilio)." },
  config: { label: "Needs a setting", cls: "bg-sky-100 text-sky-800", desc: "Ready in code, but needs a one-time toggle in an external dashboard (GA4 / Meta / Clarity)." },
  todo: { label: "Not set up", cls: "bg-amber-100 text-amber-800", desc: "Not built at all yet — but zero-friction to add (no extra burden on the seller)." },
};

/** sourceId → exact item label → its current real status. */
export const ITEM_STATUS: Record<string, Record<string, UseStatus>> = {
  leads: {
    "Best-time-to-call windows": "live",
    "Return-visitor count": "live",
    "UTM-to-vehicle patterns": "live",
    "fbc/fbp offline value": "live",
    "Time-on-site as intent": "live",
  },
  partials: {
    // usage at a glance (all live)
    "Last field before exit": "live",
    "Partial phone = callable lead": "live",
    "Attribution on abandoners": "live",
    "Step reached at exit": "live",
    "Time spent per field": "live",
    "Correction / retype rate": "live",
    "Validation errors hit": "live",
    "Repeat-visitor abandonment": "live",
    // worth building
    "Field completion order": "todo",
    "Scroll depth / CTA seen": "partial",
    // could collect (dormant machinery: the lookups table covers it when the estimate returns)
    "Vehicle info without contact": "dormant",
  },
  events: {
    // usage at a glance
    "Field re-edit & hesitation": "live",
    "Time-per-funnel-step": "live",
    "VIN decode drop-off point": "live",
    "Form-error field ranking": "live",
    "Returning-visitor journey stitch": "live",
    "Device, viewport & OS": "live",
    // worth building
    "Resume-prompt conversion rate": "partial",
    "Rage & dead clicks": "partial",
    "Referrer & UTM on event": "partial",
    "Session-level intent score": "partial",
  },
  attribution: {
    // usage at a glance
    "First- vs last-touch split": "live",
    "Time-to-conversion window": "live",
    "Touch count per lead": "live",
    "Landing page path patterns": "live",
    "Referrer-quality segmentation": "live",
    // worth building — the three ValueTrack params are captured in code; they
    // populate only once a Google Ads tracking template carries them
    "Keyword + match type": "config",
    "Device type at click": "config",
    "Physical location ID": "config",
    "gclid campaign-side join": "todo",
    "Cross-device stitch key": "partial",
  },
  lookups: {
    // worth building — everything waits on the instant estimate being re-enabled
    "Priced-but-didn't-convert list": "dormant",
    "Estimate-range width": "dormant",
    "MarketCheck comp count": "dormant",
    "Cache-hit repeat lookups": "dormant",
    "Priced-vs-unique split by model": "dormant",
    "Estimate vs actual-buy gap": "dormant",
  },
  referrals: {
    // usage at a glance
    "Referrer as repeat seller": "live",
    "Referrer's own attribution": "live",
    "Referral message intent": "live",
    "Self-referral / fraud flags": "live",
    "Referral code redemption status": "live",
    // worth building
    "Friend contact = warm lead": "todo",
    "Referrer-friend relationship graph": "todo",
    "Time-to-referral latency": "todo",
    "Share channel used": "todo",
    "Referral link click tracking": "todo",
  },
  chat: {
    // usage at a glance
    "Pages viewed pre-chat": "live",
    "Geo from IP": "live",
    "Returning vs new visitor": "live",
    "Referrer and search terms": "live",
    "Chat-to-lead linkage": "live",
    "Current page context": "live",
    // worth building
    "Chat tags/dispositions": "todo",
    "Missed-chat tracking": "partial",
    "First-response time metric": "partial",
    "Offline lead-capture form": "partial",
    "Proactive price-page trigger": "todo",
  },
  geo: {
    // usage at a glance
    "IP vs phone-region check": "live",
    "Timezone vs. form time": "live",
    "ASN-based repeat detection": "live",
    "Foreign-number flag": "live",
  },
  metaAds: {
    // usage at a glance
    "Frequency by ad": "live",
    "Offline conversion upload": "live",
    "CRM custom-audience sync": "live",
    "Suppression of bought sellers": "live",
    "Region + DMA breakdown": "live",
    "Placement-level cost-per-lead": "live",
    "Ad relevance diagnostics": "live",
    // worth building
    "Hourly performance breakdown": "todo",
    "Age & gender of leads": "todo",
    "Ad-level UTM & ad ID join": "partial",
    "Value-based lookalike audiences": "config",
    "Audience match rate": "config",
  },
  ga4Data: {
    // usage at a glance
    "Landing page performance": "live",
    "City and region breakdown": "live",
    "New vs returning behavior": "live",
    "Session default channel group": "live",
    "Hour and day-of-week": "live",
    // worth building
    "Source/medium by conversion": "config",
    "Engagement rate by segment": "partial",
    "Device category conversion gap": "config",
    "Form-funnel key events": "config",
    "Landing page + query string": "partial",
    "Session campaign name": "todo",
    "Cohort / retention report": "config",
    "Scroll depth on offer page": "todo",
  },
  marketcheck: {
    // usage at a glance (local heuristic — see the item's note)
    "Mileage vs the market": "live",
    // worth building — waits on the estimate flow doing live MarketCheck calls
    "NeoVIN factory options": "dormant",
    "Market days-supply": "dormant",
    "Active listing DOM": "dormant",
    "Comparable price percentiles": "dormant",
    "Predicted price + MSRP gap": "dormant",
  },
  gtag: {
    // usage at a glance
    "Alberta city/region geo": "live",
    "Session source / medium": "live",
    "Device category split": "live",
    "Engagement time per step": "live",
    // worth building
    "Outbound & tel: clicks": "partial",
    "Lead-value on submit": "dormant",
    "Offer/booking as conversions": "config",
    "User-scoped lead status": "todo",
    "Condition/damage parameter": "partial",
    "Google Ads / signal linking": "config",
  },
  pixel: {
    // usage at a glance
    "fbclid → server fbc": "live",
    "Automatic Advanced Matching": "live",
    "ViewContent content_category": "live",
    "Search query parameter": "live",
    // worth building
    "Value on Lead event": "dormant",
    "InitiateCheckout drop-off": "config",
    "Custom vehicle-segment events": "partial",
    "AddPaymentInfo as offer-accept": "todo",
    "predicted_ltv parameter": "dormant",
  },
  clarity: {
    // usage at a glance
    "Rage & dead clicks": "live",
    "Excessive / dead scrolling": "live",
    "Quick-back sessions": "live",
    "JavaScript error sessions": "live",
    "Scroll-depth on form steps": "live",
    "Identify leads by ID": "live",
    "Custom tag: traffic source": "live",
    "Consent-gated recording": "live",
    "Unmask non-sensitive fields": "live",
    // worth building
    "GA4 Clarity Playback URL": "config",
    "Custom tag: lead status": "todo",
    "Smart event: offer viewed": "todo",
    "Booking-page funnel event": "todo",
  },
  email: {
    // usage at a glance
    "Per-URL click data": "live",
    "Time-to-open latency": "live",
    "Open/click count per lead": "live",
    "Bounce reason surfacing": "live",
    "Reply-detected auto-warm": "live",
    "Delivery-delayed events": "live",
    "Tag emails by stage": "live",
    "Idempotency keys": "live",
    // worth building
    "Tag offer price band": "todo",
  },
  sms: {
    // worth building — everything ships dormant until Twilio/A2P is configured
    "SMS error codes": "dormant",
    "Reply latency + timing": "dormant",
    "Inbound sender geo fields": "dormant",
    "Message segment counts": "dormant",
    "STOP-per-touchpoint context": "dormant",
    "Confirmation keyword parsing": "dormant",
  },
};

/** The current real status of a brainstorm item, or undefined if unmapped. */
export function useStatusFor(sourceId: string, label: string): UseStatus | undefined {
  return ITEM_STATUS[sourceId]?.[label];
}
