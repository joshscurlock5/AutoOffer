// ===========================================================================
//  Live "is it actually used?" status for the Sources tab's
//  "Collected — not fully used yet" tier. The brainstorm text (dataSourcesBrainstorm.ts)
//  is static and still reads "likely isn't using it" even where a feature has
//  since shipped — this map is the up-to-date truth, rendered as a status pill
//  next to each item so the tab is an accurate map, not a stale wish-list.
//
//  Keep in sync as items ship: flip an item to "live" once it's surfaced.
// ===========================================================================

export type UseStatus = "live" | "partial" | "dormant" | "config" | "todo";

export const USE_STATUS_META: Record<UseStatus, { label: string; cls: string; desc: string }> = {
  live: { label: "In use", cls: "bg-emerald-100 text-emerald-800", desc: "Now surfaced in the dashboard (or drives an action) — you can read/act on it today." },
  partial: { label: "Partly used", cls: "bg-teal-100 text-teal-700", desc: "Captured and partly shown — a richer view could still be added." },
  dormant: { label: "Waiting", cls: "bg-slate-100 text-slate-600", desc: "Wired up but idle until an upstream feature is switched on (the instant estimate, or SMS/Twilio)." },
  config: { label: "Needs a setting", cls: "bg-sky-100 text-sky-800", desc: "Ready in code, but needs a one-time toggle in an external dashboard (GA4 / Meta / Clarity)." },
  todo: { label: "Not built yet", cls: "bg-amber-100 text-amber-800", desc: "The data exists, but this specific report/view hasn't been built yet." },
};

/** sourceId → exact underutilized-item label → its current real status. */
export const ITEM_STATUS: Record<string, Record<string, UseStatus>> = {
  leads: {
    "Best-time-to-call windows": "live",
    "Return-visitor count": "live",
    // Cross-tab of campaign → vehicle mix is live on the dashboard (CampaignVehicleCard).
    "UTM-to-vehicle patterns": "live",
    "fbc/fbp offline value": "live",
    "Time-on-site as intent": "live",
    // (Field timing, input method, abandoned capture, IP-to-city moved up to
    //  "collecting now" — they're actively collected, not just "could collect".)
  },
  partials: {
    "Last field before exit": "live",
    "Partial phone = callable lead": "todo",
    "Vehicle info without contact": "partial",
    "Attribution on abandoners": "live",
    "Owner-alert-sent flag": "todo",
    "Step reached at exit": "live",
    // "Could collect" items that have since been built (mostly Batch 3).
    "Time spent per field": "live",
    "Correction / retype rate": "live",
    "Validation errors hit": "live",
    "Device and input type": "live",
    "Scroll depth / CTA seen": "partial",
    "Focus/blur tab-switching": "live",
    "Repeat-visitor abandonment": "live",
  },
  events: {
    "Field re-edit & hesitation": "live",
    "Time-per-funnel-step": "live",
    "VIN decode drop-off point": "live",
    "Form-error field ranking": "live",
    "Resume-prompt conversion rate": "partial",
    "Returning-visitor journey stitch": "live",
    // "Could collect" items that have since been built (Batch 3).
    "Scroll depth on offer page": "live",
    "Rage & dead clicks": "partial",
    "Device, viewport & OS": "live",
    "Copy-to-clipboard & phone tap": "live",
    "Field autofill vs typed": "live",
  },
  attribution: {
    "First- vs last-touch split": "live",
    "Time-to-conversion window": "live",
    "Touch count per lead": "live",
    "Landing page path patterns": "todo",
    "gclid campaign-side join": "todo",
    "Referrer-quality segmentation": "live",
    // "Could collect" items that have since been built (Batch 4).
    "Keyword + match type": "live",
    "Device type at click": "live",
    "Network + placement": "live",
    "gbraid / wbraid capture": "live",
    "Ad creative + campaign ID": "live",
  },
  lookups: {
    "Priced-but-didn't-convert list": "dormant",
    "Estimate-range width": "dormant",
    "MarketCheck comp count": "dormant",
    "Cache-hit repeat lookups": "dormant",
    "Priced-vs-unique split by model": "dormant",
    "Estimate vs actual-buy gap": "dormant",
  },
  referrals: {
    "Referrer as repeat seller": "live",
    "Friend contact = warm lead": "todo",
    "Referral code redemption status": "todo",
    "Referrer's own attribution": "live",
    "Referral message intent": "todo",
    "Referrer-friend relationship graph": "todo",
    // "Could collect" item that has since been built (Batch 2).
    "Self-referral / fraud flags": "live",
  },
  chat: {
    "Pages viewed pre-chat": "live",
    "Current page context": "partial",
    "Geo from IP": "live",
    "Returning vs new visitor": "live",
    "Referrer and search terms": "live",
    "Chat-to-lead linkage": "live",
    // "Could collect" item that has since been built (Batch 8).
    "Device and OS": "live",
  },
  geo: {
    "Postal / FSA code": "live",
    "Latitude / longitude": "live",
    "ISP / connection org": "live",
    "Timezone vs. form time": "partial",
    "IP-city vs. stated city": "live",
  },
  metaAds: {
    "Region + DMA breakdown": "todo",
    "Hourly performance breakdown": "todo",
    "Placement-level cost-per-lead": "todo",
    "Age & gender of leads": "todo",
    "Frequency by ad": "live",
    "Ad relevance diagnostics": "todo",
    // "Could collect" item already live (pre-existing offline-conversion loop).
    "Offline conversion upload": "live",
  },
  ga4Data: {
    "Landing page performance": "live",
    "Source/medium by conversion": "config",
    "City and region breakdown": "live",
    "New vs returning behavior": "live",
    "Engagement rate by segment": "partial",
    "Device category conversion gap": "config",
    // "Could collect" item that has since been built (Batch 7).
    "Session default channel group": "live",
  },
  marketcheck: {
    "NeoVIN factory options": "dormant",
    "Market days-supply": "dormant",
    "Active listing DOM": "dormant",
    "Comparable price percentiles": "dormant",
    "Mileage vs the market": "live",
    "Predicted price + MSRP gap": "dormant",
  },
  gtag: {
    "Alberta city/region geo": "live",
    "Session source / medium": "live",
    "Scroll-depth on landing pages": "partial",
    "Device category split": "live",
    "Engagement time per step": "live",
    "Outbound & tel: clicks": "partial",
  },
  pixel: {
    "fbclid → server fbc": "live",
    "Value on Lead event": "dormant",
    "Automatic Advanced Matching": "live",
    "ViewContent content_category": "live",
    "Search query parameter": "live",
    "InitiateCheckout drop-off": "config",
    // "Could collect" items already live (pre-existing CAPI) or built (Batch 9).
    "Contact standard event": "live",
    "Schedule standard event": "live",
    "Purchase on car bought": "live",
    "external_id matching": "live",
    "Custom vehicle-segment events": "partial",
  },
  clarity: {
    "Rage & dead clicks": "live",
    "Excessive / dead scrolling": "live",
    "Quick-back sessions": "live",
    "JavaScript error sessions": "live",
    "Scroll-depth on form steps": "live",
    "GA4 Clarity Playback URL": "config",
    // "Could collect" items already live (identify + consent) or built (Batch 9 tags).
    "Identify leads by ID": "live",
    "Custom tag: traffic source": "live",
    "Consent-gated recording": "live",
  },
  email: {
    "Per-URL click data": "live",
    "Time-to-open latency": "live",
    "Open/click count per lead": "live",
    "Delivery-delayed events": "live",
    "Bounce reason surfacing": "live",
    "Reply-detected auto-warm": "live",
  },
  sms: {
    "SMS error codes": "dormant",
    "Reply latency + timing": "dormant",
    "Inbound sender geo fields": "dormant",
    "Message segment counts": "dormant",
    "STOP-per-touchpoint context": "dormant",
    "Confirmation keyword parsing": "dormant",
  },
};

/** The current real status of an underutilized item, or undefined if unmapped. */
export function useStatusFor(sourceId: string, label: string): UseStatus | undefined {
  return ITEM_STATUS[sourceId]?.[label];
}
