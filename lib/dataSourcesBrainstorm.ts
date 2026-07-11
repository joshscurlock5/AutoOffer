import type { CollectIdea } from "./dataSources";

// ===========================================================================
//  Person-profile classification — which data points are about ONE identifiable
//  seller (and so belong in that person's single Customer-360 profile) vs.
//  aggregate / market / platform-level data that lives in its own section.
//  Stored as exceptions to stay compact: person-oriented sources default to
//  "yes, person-level" (list the few that aren't); aggregate sources default to
//  "no" (list the few that are). Edit these lists to reclassify — the UI's 👤
//  marker follows automatically.
// ===========================================================================

const PERSON_SOURCES = new Set([
  "leads", "partials", "events", "attribution", "referrals", "chat", "geo", "email", "sms", "clarity",
]);

// Within a person-oriented source: items that are NOT person-level (aggregate
// rollups, rates, patterns, capabilities, or processing metadata).
const NOT_PROFILE: Record<string, string[]> = {
  leads: ["UTM-to-vehicle patterns"],
  events: ["Form-error field ranking", "Resume-prompt conversion rate"],
  attribution: ["Landing page path patterns", "Referrer-quality segmentation"],
  chat: ["Proactive price-page trigger", "Missed-chat tracking", "Canned offer responses", "First-response time metric"],
  geo: ["Resolved-at timestamp", "Accuracy radius"],
  email: ["Idempotency keys", "Native scheduled_at send", "Broadcast open/click analytics", "Dedicated sending domain warmup", "Scheduled-send cancellation"],
  sms: ["Message segment counts", "Scheduled offer messages", "Messaging Insights analytics", "Delivery-time-to-read gap", "Keyword auto-responder", "Number-reputation / 10DLC campaign data"],
  clarity: ["Never records typed form data (masked by default)", "Scroll-depth on form steps", "Consent-gated recording"],
};

// Within an aggregate source: items that ARE person-level (identity keys,
// per-individual attributes, or per-lead capture).
const PROFILE_EXTRA: Record<string, string[]> = {
  metaAds: ["Lead Ads instant forms", "Ad-level UTM & ad ID join"],
  gtag: [
    "GA client id / session id (the _ga cookie)",
    "Alberta city/region geo",
    "Session source / medium",
    "Outbound & tel: clicks",
    "Vehicle params on events",
    "Lead-value on submit",
    "User-scoped lead status",
    "Condition/damage parameter",
    "Predictive purchase probability",
  ],
  pixel: [
    "Meta browser cookies (fbp / fbc)",
    "fbclid → server fbc",
    "Value on Lead event",
    "Automatic Advanced Matching",
    "ViewContent content_category",
    "Search query parameter",
    "predicted_ltv parameter",
    "external_id matching",
  ],
};

/** Is this data point person-level — i.e. belongs in ONE seller's Customer-360
 * profile? Drives the 👤 marker across all detail tiers. */
export function isProfileField(sourceId: string, label: string): boolean {
  if (PERSON_SOURCES.has(sourceId)) return !(NOT_PROFILE[sourceId]?.includes(label) ?? false);
  return PROFILE_EXTRA[sourceId]?.includes(label) ?? false;
}

// ===========================================================================
//  Brainstorm content per data source — the three lower tiers of the Sources
//  detail panel, reorganized 2026-07-11 after a full codebase audit:
//
//  - underutilized  → "Collected — usage at a glance": derived uses of data the
//    source already collects, and every item here is LIVE today (surfaced in
//    the dashboard or driving an automated action).
//  - buildNext      → "Worth building — zero-friction upgrades": the to-do
//    list. Data or views the source could have WITHOUT asking the seller for
//    anything extra; each is partially set up or not set up (the status pill
//    in dataSourceStatus.ts says which — keep the two files in sync).
//  - opportunities  → "Could collect": deliberately not collected — each would
//    add customer friction, need a paid tier, or depend on a feature that
//    doesn't exist (e.g. the dormant instant estimate).
//
//  When a buildNext item ships: flip its status to "live" in
//  dataSourceStatus.ts AND move it up to underutilized here.
//  Pure reference data — merged onto the health defs in dataSources.ts.
// ===========================================================================

export const BRAINSTORM: Record<string, { underutilized: CollectIdea[]; buildNext?: CollectIdea[]; opportunities: CollectIdea[] }> = {
  leads: {
    underutilized: [
      { label: "Best-time-to-call windows", why: "The form already captures preferred contact method and best time, but if leads aren't routed into a call queue sorted by those windows, the owner phones people when they can't answer and connect rates drop." },
      { label: "Return-visitor count", why: "Visits-before-submit is already tracked, and a seller who came back 4+ times before filling the form is a high-intent, shopping-around lead who should get a faster and firmer offer than a one-visit impulse submit." },
      { label: "UTM-to-vehicle patterns", why: "You store both the campaign source and the exact car, and the dashboard cross-tabs them — so you can see whether (say) Facebook sends cheap high-mileage beaters while Google sends clean low-mileage cars worth chasing, the single biggest lever on ad spend." },
      { label: "fbc/fbp offline value", why: "Meta's click/browser IDs are captured on the lead, so once a car is actually bought you can fire a Purchase conversion at the real margin back to Meta to optimize the ad algorithm toward profitable sellers, not just form-fillers." },
      { label: "Time-on-site as intent", why: "Time on site is recorded and blended into lead priority — a 20-second submit reads very differently from a 6-minute one, helping the solo operator call the serious sellers first." },
    ],
    opportunities: [
      { label: "Asking-price expectation", why: "A single 'what do you hope to get?' field captures the seller's price anchor up front, letting you filter unrealistic sellers and tailor the opening offer, at the cost of one more field that can raise abandonment if placed too early." },
      { label: "License-plate lookup", why: "A plate-to-VIN lookup would let a seller enter just their licence plate instead of the full VIN, but it needs a paid lookup service and many private sellers hesitate to share a plate — so it stays optional and unbuilt. (The full VIN itself is now captured whenever they use the VIN lookup path.)" },
      { label: "Payoff / lien status", why: "A 'do you still owe money on it?' toggle surfaces liens that can kill a deal at pickup, so catching it on the form saves a wasted inspection trip on a car you legally can't buy clean." },
      { label: "Reason & timeline to sell", why: "Dropdowns for why they're selling (upgrading, moving, deceased estate, mechanical) and how soon (this week vs. someday) are cheap to add and directly rank urgency so the operator spends time on sellers ready to transact now." },
      { label: "Photo upload of the car", why: "Optional photo uploads let the owner assess real condition and firm up the offer remotely before driving out, though DriveOffer deliberately dropped required photos to cut form friction, so this is best as an optional post-submit add." },
    ],
  },
  partials: {
    underutilized: [
      { label: "Last field before exit", why: "The beacon already knows which field the seller was on when they bailed (e.g. stuck on phone vs. mileage) — the 'Form friction — where people stop' table shows exactly where each session abandoned." },
      { label: "Partial phone = callable lead", why: "A typed-but-unsubmitted phone is a warm contact, and it's surfaced three ways: the 'Warm abandoners — call these now' dashboard card with tap-to-call links, the hourly cron's reach-out ping to Telegram, and partial-status leads in the admin list." },
      { label: "Attribution on abandoners", why: "The beacon captures UTM/source/campaign on people who quit, so you can see which ads and keywords drive high-intent starts that don't finish — the abandon-by-source view steers ad spend, not just the conversion column." },
      { label: "Step reached at exit", why: "The multi-step flow (Vehicle to Details to Contact) means the beacon inherently records how deep each abandoner got, a funnel signal charted to show which step bleeds the most high-intent sellers." },
      { label: "Time spent per field", why: "Contact-step fields (email / phone / best time) report dwell time into the per-field input-behavior table, showing where sellers hesitate right before handing over contact info — the highest-stakes friction on the form." },
      { label: "Correction / retype rate", why: "Deletes and retypes on the contact fields are counted per field and shown in the same input-behavior table — a spike on one field means its label or validation is fighting real Alberta sellers." },
      { label: "Validation errors hit", why: "Every inline validation failure fires a form_error event, aggregated into the 'Form errors by reason' chart and stitched onto the person's timeline — so you can tell whether the form itself is rejecting good sellers." },
      { label: "Repeat-visitor abandonment", why: "Return visits are computed per person from the event stream and surfaced in the profile drawer ('Return visits — N sessions') plus the lead score's intent factor — an abandoner circling back is the highest-intent segment worth a personal call." },
    ],
    buildNext: [
      { label: "Field completion order", why: "'Last field touched before abandoning' is live in the friction table, but the full touch ORDER isn't recorded — non-linear behavior like jumping to contact before finishing vehicle details stays invisible, and it would inform whether to reorder the form." },
      { label: "Scroll depth / CTA seen", why: "Scroll depth is stored on every lead and partial; the missing half is CTA visibility — nothing records whether the abandoner ever actually SAW the 'Get my offer' button or the trust copy below the fold." },
      { label: "Condition on the partial beacon", why: "Sellers pick damage tags and type a condition note on the details step, but the abandoned-form beacon doesn't include them — adding the already-typed condition to the partial payload gives the owner the car's real state before the recovery call, for free." },
    ],
    opportunities: [
      { label: "Price-expectation as typed", why: "There's no price-expectation input on the form to capture — adding one is the same friction tradeoff as the 'Asking-price expectation' idea on the lead form, so this only exists if that field ever ships." },
      { label: "Vehicle info without contact", why: "The beacon deliberately fires only once a valid email or phone exists, so contact-less abandons are never stored — capturing them would mean beaconing anonymous form entries. The estimate-lookup table covers this niche (which exact car walked away) whenever the instant estimate is switched back on." },
    ],
  },
  events: {
    underutilized: [
      { label: "Field re-edit & hesitation", why: "Blur/focus events already log how many times a seller re-touches the mileage, price-expectation, or VIN field — repeated edits flag uncertainty or negotiation anxiety the owner could pre-empt with a reassuring follow-up." },
      { label: "Time-per-funnel-step", why: "The captured step timestamps already yield dwell time on Vehicle vs. Details vs. Contact — long stalls on the Contact step signal offer-value hesitation worth a lighter-touch CTA or trust reassurance." },
      { label: "VIN decode drop-off point", why: "The VIN decode funnel already records where decodes fail or get abandoned, so DriveOffer can spot cars whose VIN won't resolve (older/imported vehicles) and route them to a manual-lookup fallback instead of losing the lead." },
      { label: "Form-error field ranking", why: "Form-error events are aggregated by reason into the funnel tab's error chart, pointing at exactly which input (postal code, phone format, mileage) is bleeding leads and should be redesigned first." },
      { label: "Returning-visitor journey stitch", why: "Visitor and session IDs already let you stitch multi-visit sellers, revealing the researcher who priced their car three times before submitting — a hot lead the owner should prioritize but would otherwise look like one anonymous session." },
      { label: "Device, viewport & OS", why: "Viewport rides the behavior payload and the stored user-agent is parsed into device/OS/browser per profile, with a device breakdown in the dashboard — so a form that breaks on one Android width shows up instead of hiding as random non-conversion." },
    ],
    buildNext: [
      { label: "Resume-prompt conversion rate", why: "Exit-intent and resume-banner shown/clicked counts are on the funnel tab; the missing piece is the outcome join — whether accepting the prompt actually led to a submitted form, i.e. whether the nudge recovers cars or just annoys sellers." },
      { label: "Rage & dead clicks", why: "Rage clicks are detected, counted and shown in the Engagement & frustration card; DEAD clicks (taps that do nothing) aren't detected first-party yet — and that's the half that catches a silently broken button." },
      { label: "Referrer & UTM on event", why: "Events are stitched to a person (and their attribution) at read time via the visitor id, but each event doesn't carry its own referrer/UTM — a session that changes source mid-visit can't be seen per event." },
      { label: "Condition-chip engagement", why: "The damage/condition chips on the details step are the closest thing to a seller's own honesty about the car, but chip taps aren't tracked as events — logging selections (even when the form is later abandoned) captures condition intent with zero extra friction." },
      { label: "Session-level intent score", why: "A per-lead score with an intent factor is live; a per-SESSION score (dwell, re-edits, scroll, errors combined) that ranks anonymous visitors hot-to-cold before they ever submit isn't built." },
    ],
    opportunities: [
      { label: "Photo-upload interaction", why: "Even without storing images, tracking upload-start, file count, and abandonment during the (any) photo step reveals whether the upload UX is a friction wall for sellers with damaged cars — moot until a photo step exists again." },
    ],
  },
  attribution: {
    underutilized: [
      { label: "First- vs last-touch split", why: "The journey trail stores both the original discovery channel and the final pre-submit source, split out in the dashboard — so you can see that (e.g.) organic finds sellers while a retargeting ad closes them, instead of one blended number." },
      { label: "Time-to-conversion window", why: "The timestamped multi-touch trail yields days-from-first-visit-to-submit, separating impulse sellers (offer fast) from long deliberators (worth a nurture drip)." },
      { label: "Touch count per lead", why: "The number of sessions/touchpoints before submitting flags whether a seller researched heavily (price-shopping competitors) versus converted on first visit." },
      { label: "Landing page path patterns", why: "The captured landing page URL shows whether leads enter on the homepage, a make/model guide, or a city page — the 'Top landing pages' chart shows which SEO pages actually produce buyable cars instead of just traffic." },
      { label: "Referrer-quality segmentation", why: "External referrers (Kijiji, Facebook groups, forums, competitor sites) are captured and segmented, showing which free referral sources send sellers who actually accept an offer." },
    ],
    buildNext: [
      { label: "Keyword + match type", why: "Match type is captured, but the literal {keyword} ValueTrack param isn't — utm_term only carries whatever the tracking template puts there, and the exact search a seller typed ('sell my truck no title' vs 'car value') is the single best predictor of a buyable lead." },
      { label: "Device type at click", why: "The {device} ValueTrack param isn't captured (device is only derived from the user-agent at read time) — the param would tell you the device at the AD CLICK, catching sellers who click on a phone in the driveway but finish on a desktop." },
      { label: "Physical location ID", why: "{loc_physical_ms} gives the geographic area of the click, letting DriveOffer see if a lead is in Calgary versus a 3-hour drive away before the inspection logistics ever come up." },
      { label: "gclid campaign-side join", why: "The stored gclid can be pushed back to Google Ads as an offline conversion keyed to the real buy price, so DriveOffer optimizes bids toward cars it actually purchases, not raw form fills — the Google-side twin of the Meta Purchase loop that's already live." },
      { label: "Cross-device stitch key", why: "A durable visitor id already exists and stitches same-browser sessions; profile identity merging is email/phone-only, so the same person on phone + laptop only merges once they submit the same contact on both — a durable cross-device key would close that gap." },
    ],
    opportunities: [],
  },
  lookups: {
    underutilized: [],
    buildNext: [
      { label: "Priced-but-didn't-convert list", why: "You already log every lookup that showed an estimate yet never became a lead, but this exact-VIN/make-model set is a ready-made retargeting and 'we-still-want-your-car' follow-up audience being left on the table." },
      { label: "Estimate-range width", why: "The high-vs-low spread MarketCheck returns is a live confidence signal, but wide ranges (thin comps) aren't being flagged to price those cars manually instead of scaring sellers off with a vague number." },
      { label: "MarketCheck comp count", why: "The number of comparable listings behind each estimate is already returned, and low-comp lookups are exactly the rare/desirable vehicles worth a fast personal outreach rather than an automated range." },
      { label: "Cache-hit repeat lookups", why: "A cache hit means someone re-valued the same vehicle, and repeated lookups of one car signal a seller circling back — a high-intent trigger you're treating as a mere cost saving." },
      { label: "Priced-vs-unique split by model", why: "You track whether a lookup resolved to a real market price or fell through as 'unique,' but aggregating the unique/failure rate by make-model would reveal which vehicles your pricing coverage is blind to." },
      { label: "Estimate vs actual-buy gap", why: "You have both the shown estimate and (for closed deals) the real purchase price, so the systematic delta per segment is a margin-calibration goldmine currently sitting in two separate tables." },
    ],
    opportunities: [
      { label: "Market Days Supply", why: "MarketCheck's MDS endpoint tells you how fast a given car sells in-market, letting you bid more aggressively on quick-flip vehicles and lowball slow-movers — a resale-velocity signal you're not pulling." },
      { label: "Trim and options decode", why: "NeoVIN full decode returns exact trim and installed-equipment lists, which materially move value (e.g. a loaded vs base trim), yet lookups are likely keyed on year/make/model and leaving trim-driven margin unpriced." },
      { label: "VIN price history", why: "MarketCheck exposes up to 6 years of a VIN's listing, odometer, and price changes, revealing prior sale attempts or ownership churn that flags a problem car before you ever inspect it." },
      { label: "Mileage entered at lookup", why: "Odometer is the single biggest value lever, so capturing the exact mileage the seller enters (not just make/model/year) lets you store a true per-car estimate instead of a generic range." },
      { label: "Lookup-to-form drop-off point", why: "Tracking whether a seller saw the estimate and then abandoned before the contact step isolates whether your number itself is killing conversions versus the form friction." },
      { label: "Regional Alberta comps", why: "MarketCheck can scope statistics to a geography, so pulling Alberta/Western-Canada averages instead of national ones gives sellers a locally credible number and you a more accurate resale basis." },
      { label: "Estimate acceptance sentiment", why: "A one-tap 'is this fair?' or high/low reaction on the shown range would capture whether sellers think your offer is competitive, turning silent bounces into pricing feedback." },
      { label: "Seasonal price trend", why: "MarketCheck's weekly-retrained model and DOM stats let you track a model's price trajectory over time, so you can time offers on convertibles/trucks/SUVs to seasonal demand swings." },
      { label: "Vehicle popularity/rarity score", why: "MarketCheck exposes popularity statistics per model, which would let you auto-route rare or high-demand lookups to priority manual pricing and outreach rather than the standard funnel." },
    ],
  },
  referrals: {
    underutilized: [
      { label: "Referrer as repeat seller", why: "The referrer already handed over their own name/email/phone, so DriveOffer can check if they ever sold a car themselves and re-market a second offer or a 'refer 3, get bonus' tier instead of treating them as a one-time contact." },
      { label: "Referrer's own attribution", why: "You already captured the referrer's UTM/source/behavior from when they first arrived, letting you see which ad channels produce sellers who go on to refer others (true viral-loop ROI) rather than just first-touch cost." },
      { label: "Referral message intent", why: "The free-text message the referrer wrote ('has a truck to sell', 'downsizing') is quoted in the Telegram referral alert and shown on the admin referral card, so the owner opens the conversation already knowing the car and situation." },
      { label: "Self-referral / fraud flags", why: "A referrer and friend sharing the same email or phone shows as a '⚠ Self-referral' badge on the profile — the standard guard against someone gaming a reward with their own second car. (IP/household matching isn't checked, only contact overlap.)" },
    ],
    buildNext: [
      { label: "Friend contact = warm lead", why: "The friend's phone/email is a pre-consented warm lead that should auto-create a lead record and trigger the same nurture drip as a form submission, not sit inert until the friend happens to fill out the site themselves." },
      { label: "Referral code redemption status", why: "Codes are generated per referral and a lead's typed-in code shows on its card (and boosts the lead score), but nothing auto-matches a lead's code back to the referral record — redemption never flips the referral's status by itself." },
      { label: "Referrer-friend relationship graph", why: "Because you hold both parties' identities you can already detect clusters (one referrer sending 5 friends, or a friend who later becomes a referrer), spotlighting your best advocates and detecting obvious self-referral rings for the same household." },
      { label: "Time-to-referral latency", why: "Timestamp when a seller refers relative to their own sale so you learn the optimal moment to ask (right after a happy payout vs. weeks later) and can automate the referral invite at that peak-satisfaction window." },
      { label: "Share channel used", why: "Track whether the referral link was shared via SMS, WhatsApp, Facebook, or copy-link so you learn which channel actually drives car sellers in Alberta — needs trackable share links instead of a plain form, but costs the customer nothing." },
      { label: "Referral link click tracking", why: "Move from a static form to a unique trackable link per referrer so you can see clicks-before-submit and abandonment, revealing warm friends who visited but didn't finish and are worth a manual follow-up." },
    ],
    opportunities: [
      { label: "Referred car details", why: "Add optional make/model/year/mileage fields to the referral form so the friend's lead arrives pre-qualified and the owner can ballpark an offer before first contact, at the cost of a slightly longer form that may reduce referral volume." },
      { label: "Double-sided reward payout", why: "Record and automate an actual referrer reward (e.g. $100 on a completed purchase) with paid/pending status, since double-sided incentives drive the vast majority of successful referral programs and right now the code grants nothing trackable." },
      { label: "Reward eligibility gating", why: "Track the condition that unlocks the referrer's payout (friend's car actually bought, not just contacted) so you never pay on a dead lead, which is the honest-money guardrail a cash-for-cars margin business needs." },
      { label: "Referrer leaderboard / tiers", why: "Track cumulative successful referrals per person to unlock escalating bonuses for power-referrers (dealership-adjacent folks, mechanics, tow operators) who can feed you a steady stream of cars — only meaningful once a reward program exists." },
      { label: "Referral consent capture", why: "Log that the referrer confirmed the friend agreed to be contacted, giving you CASL-compliant proof-of-consent for the cold outreach to that friend's phone/email, which protects an Alberta business texting/emailing third parties." },
    ],
  },
  chat: {
    underutilized: [
      { label: "Pages viewed pre-chat", why: "Every route change logs a first-party page view keyed by the visitor id stored on the conversation, so the profile timeline reconstructs exactly which pages/guides a chatter read before opening chat — the offer conversation never starts cold." },
      { label: "Geo from IP", why: "Chat conversations get the visitor's city/region resolved from IP (hourly cron), letting DriveOffer instantly flag whether the seller is even in the Alberta service area before spending time on an offer conversation." },
      { label: "Returning vs new visitor", why: "The durable visitor id on each conversation surfaces warm sellers who keep coming back to the offer page but haven't yet submitted, so they can be nudged harder in chat." },
      { label: "Referrer and search terms", why: "Chat captures the attribution trail that brought the visitor in (e.g. 'sell my truck fast Calgary'), revealing urgency and intent that shapes the offer pitch and gets stitched to the lead." },
      { label: "Chat-to-lead linkage", why: "Chat has the visitor's name/contact and visitor id, so conversations stitch into the same Customer-360 profile as their lead — you can see whether chatters actually convert versus vanish, which most setups never join up." },
    ],
    buildNext: [
      { label: "Current page context", why: "The page the chat STARTED on is stored, but follow-up messages don't carry the current URL — so mid-conversation you can't see what page the visitor has moved to (e.g. they've opened the booking page and stalled)." },
      { label: "Chat tags/dispositions", why: "Tag each chat with an outcome like 'price too low', 'not in service area', or 'wants to book inspection' so DriveOffer can quantify why chat sellers drop off instead of guessing." },
      { label: "Missed-chat tracking", why: "Every visitor message pings Telegram and the admin shows a needs-reply badge, but nothing measures chats that went unanswered — no unanswered-duration metric or missed-chat count exists to quantify lost seller demand." },
      { label: "First-response time metric", why: "A lead-based response-time metric is live (median + %-under-5-minutes), but per-chat time-to-first-reply isn't computed — message timestamps are stored raw and never joined, and a seller shopping multiple cash-buyers takes the first fast offer." },
      { label: "Offline lead-capture form", why: "A phone number is already mandatory before any first chat message, so after-hours chatters are always recoverable — what's missing is away-hours detection and an automatic away-reply so the seller knows when to expect a response." },
      { label: "Proactive price-page trigger", why: "Fire a proactive chat invite when a visitor lingers on the offer/schedule page or scrolls the FAQ, catching hesitant sellers at the exact moment of doubt before they bounce to a competitor." },
    ],
    opportunities: [
      { label: "Pre-chat vehicle form", why: "Add year/make/model/mileage fields to the pre-chat form so every chat arrives with the car's basics already captured, turning idle chats into structured lead records instead of freeform text — at the cost of more friction before the first message." },
      { label: "Post-chat CSAT rating", why: "Enable the post-chat 1-5 satisfaction survey to measure whether sellers feel the offer conversation was fair or pushy, a signal that directly predicts whether they accept or ghost." },
      { label: "Canned offer responses", why: "Set up saved replies for the recurring questions (how the process works, payment method, whether they buy salvage/high-mileage), cutting response time so sellers don't cool off waiting — operator tooling rather than data collection." },
    ],
  },
  geo: {
    underutilized: [
      { label: "IP vs phone-region check", why: "The form never asks for a city, so the live check compares the IP's province against the phone number's area-code province instead — a mismatch shows as an amber 'Location check' warning on the profile, flagging out-of-province or spoofed leads before a wasted callback." },
    ],
    buildNext: [
      { label: "Timezone vs. form time", why: "The IP's IANA timezone is stored and shown on the profile, but it's never compared against the submit time or Mountain Time — the mismatch check (a cheap out-of-province / spam tell, and the key to texting sellers in their real waking hours) is the missing half." },
      { label: "ASN-based repeat detection", why: "The network's ASN is already stored on every geo-resolved lead ('for repeat-network detection') but nothing aggregates it — a burst of leads from one unusual network (a single ASN spamming forms) is invisible today." },
      { label: "Foreign-number flag", why: "The IP's international calling code is already stored, but it's never compared against +1/Canada or the lead's own phone number — a one-line check that flags offshore fake sellers the country-only check misses." },
    ],
    opportunities: [
      { label: "VPN / proxy / Tor flag", why: "ipwho.is's paid security block returns boolean VPN/proxy/Tor/anonymous flags — a private seller listing their own car has no reason to hide their IP, so this is a high-signal filter for bots and fraudulent 'sell my car' submissions, though it costs a paid tier." },
      { label: "Hosting / datacenter flag", why: "The security block's 'hosting' boolean identifies IPs owned by AWS/Google/OVH, which no genuine at-home seller uses — catching these kills competitor-scraper and automated junk leads before they burn the owner's follow-up time." },
      { label: "Fraud / abuse score", why: "Peer APIs (IPQualityScore, ipapi.is) return a 0-100 risk/abuse score per IP, giving DriveOffer a single tunable threshold to auto-deprioritize suspicious leads instead of manually judging each one, at the cost of adding a second enrichment vendor." },
      { label: "Mobile vs. fixed line", why: "Connection-type detection (mobile carrier vs. residential broadband) is available on paid tiers and tells DriveOffer whether the seller is on their phone — useful for choosing SMS-first outreach and knowing the coarse location is less reliable (mobile IPs route through carrier hubs)." },
      { label: "Accuracy radius", why: "Some providers return an accuracy radius (km) with each lookup, letting DriveOffer know when a lead's location is a confident city hit versus a 50km blur — so it can trust or discount the distance-to-pickup estimate rather than treating every geo as exact. (ipwho.is doesn't return one — needs a different provider.)" },
      { label: "Reverse hostname (PTR)", why: "ipinfo-class APIs return the reverse-DNS hostname, which often exposes the ISP region or a corporate/VPN provider name — an extra cheap corroboration of whether the lead is a real Alberta residential connection, but it needs a different provider than ipwho.is." },
    ],
  },
  metaAds: {
    underutilized: [
      { label: "Frequency by ad", why: "`frequency` (impressions/reach) is fetched per ad and shown in the creative table with an amber warning at 4+ — the classic signal to refresh creative before cost-per-lead balloons in a small provincial market." },
      { label: "Offline conversion upload", why: "Deal closes fire a real-value Purchase back to Meta (est. resale minus buy price), matched by the lead's stored fbc/fbp + hashed contact — so the algorithm optimizes toward sellers who become deals, not just form-fillers. The single highest-leverage loop for a buy-side business, and it's live." },
      { label: "CRM custom-audience sync", why: "Four ready-made customer-list CSVs (abandoned form, offer-no-booking, closed winners with margin as value, all contacts) export from the dashboard in Meta's upload template, with opted-out and bounced people excluded — upload to Ads Manager is the one manual step." },
      { label: "Suppression of bought sellers", why: "The 'all contacts' and 'closed' CSV segments exist exactly for this — upload as an exclusion audience so acquisition ads stop paying to reach someone whose car you already bought." },
    ],
    buildNext: [
      { label: "Region + DMA breakdown", why: "The Insights `region` breakdown splits spend and cost-per-lead by Alberta locality (Calgary vs Edmonton vs rural), so DriveOffer can see which towns produce cheap sellable cars and stop paying to reach areas outside a sane inspection-drive radius." },
      { label: "Hourly performance breakdown", why: "`hourly_stats_aggregated_by_audience_time_zone` shows leads-per-hour, letting the solo operator dayparting-bid toward evenings/weekends when sellers actually fill the form and can answer the callback quickly." },
      { label: "Placement-level cost-per-lead", why: "`publisher_platform` + `platform_position` reveal whether Reels, Stories, or FB Feed produce the cheapest leads, so budget stops leaking into Audience Network placements that generate junk 'sell my car' clicks." },
      { label: "Age & gender of leads", why: "The age/gender breakdown on the lead action shows which seller demographics convert to actual purchased cars, feeding smarter targeting than treating all Alberta adults as one blob." },
      { label: "Ad relevance diagnostics", why: "`quality_ranking`, `engagement_rate_ranking`, and `conversion_rate_ranking` are free per-ad fields that tell you exactly whether a losing ad is dying on the creative, the hook, or the offer, instead of guessing." },
      { label: "Ad-level UTM & ad ID join", why: "Leads already carry utm_content/utm_id and the ad-level Meta rows carry ad/adset/campaign IDs, but the join is campaign-NAME only — matching per-lead ad IDs to Meta's ad rows would turn cost-per-lead into true cost-per-purchased-car per creative." },
      { label: "Value-based lookalike audiences", why: "The 'closed' CSV already exports winners with margin as the value column — creating the value-based lookalike from it is a Meta-UI step, no new code, and it skews delivery toward high-margin vehicles instead of a generic Alberta-adults audience." },
      { label: "Audience match rate", why: "Ads Manager reports a match rate after every customer-list upload — worth recording after each CSV upload, since a below-40% match means the contact data is dirty and remarketing is silently underperforming." },
    ],
    opportunities: [
      { label: "Estimated ad recall lift", why: "`estimated_ad_recall_rate` measures how memorable a creative is, useful for the top-of-funnel brand ads that build 'DriveOffer = cash for my car in Alberta' recall before someone is ready to sell." },
      { label: "Creative asset breakdown", why: "Dynamic Creative asset-level reporting (`image_asset`, `video_asset`, `body_asset`, `title_asset`) tells you which specific headline or photo drives leads — but it only returns data for Dynamic Creative campaigns, which the account isn't running." },
      { label: "Lead Ads instant forms", why: "Native Meta Lead Ad forms retrieved via the API capture the seller (name, phone, vehicle) inside Facebook with no landing-page bounce, and the API can pull those leads straight into DynamoDB for a faster callback than the current site-form-only path — a new acquisition channel, not just a data add." },
    ],
  },
  ga4Data: {
    underutilized: [
      { label: "Landing page performance", why: "The landingPage dimension crossed with traffic shows which entry pages (a VIN-specific guide vs. the homepage) actually pull people in, so ad and SEO spend can be steered toward the pages that produce sellers." },
      { label: "City and region breakdown", why: "The city and region dimensions already reveal whether traffic and leads cluster in Calgary vs. Edmonton vs. rural Alberta, letting the operator concentrate ad geo-targeting and plan inspection-drive routes." },
      { label: "New vs returning behavior", why: "The newVsReturning dimension separates first-time visitors from people who came back to finish, and returning-but-not-converted sellers are the warmest re-marketing audience a car buyer has." },
      { label: "Session default channel group", why: "The sessionDefaultChannelGroup dimension auto-buckets traffic (Organic Search, Paid Social, Direct, Referral) — the 'By channel group' chart gives a clean channel-level breakdown without maintaining manual UTM rules." },
    ],
    buildNext: [
      { label: "Source/medium by conversion", why: "Sessions by source/medium are fetched, but the conversions (keyEvents) metric isn't crossed against it yet — so leads-per-source from GA4's side is missing, and that's the single most important number for a lead business." },
      { label: "Engagement rate by segment", why: "Engagement rate and averageSessionDuration are already collected but rarely sliced by source or landing page, which is exactly how you spot a traffic channel sending bots or bounce-y clicks that will never sell a car." },
      { label: "Device category conversion gap", why: "DriveOffer sees sessions by device but not conversion rate by device, and since most private sellers fill the form on a phone, a mobile-specific drop in form completion is a silent revenue leak." },
      { label: "Form-funnel key events", why: "The full funnel already fires to GA4 (browser step events plus server-side contacted/booked/closed stages); what's left is marking generate_lead as a Key event in the GA4 admin UI — and wiring the one missing stage event (offer_sent) — so GA4's conversion reports reflect the real funnel." },
      { label: "Landing page + query string", why: "The plain landing-page report is live; the landingPagePlusQueryString variant that preserves UTM and ad parameters on the entry URL isn't fetched, so GA4-side per-creative attribution stays unavailable." },
      { label: "Hour and day-of-week", why: "A first-party day-by-hour lead-arrival heatmap is live; the GA4 side (when VISITORS browse, not just when leads land) isn't queried yet — useful for timing ad budget and drip sends." },
      { label: "Session campaign name", why: "Querying sessionCampaignName ties conversions back to named Google/Meta campaigns without leaving GA4, closing the loop between ad spend and booked cars for ROAS reporting." },
      { label: "Cohort / retention report", why: "The Data API's runReport with a cohortSpec can track whether returning-seller cohorts (people who left and came back) eventually convert, quantifying how much follow-up nurture is worth." },
      { label: "Scroll depth on offer page", why: "GA4's enhanced-measurement scroll event feeds the scrolledUsers metric, showing whether sellers actually read the offer/how-it-works content before bouncing — the events fire; the GA4-side metric just isn't queried." },
    ],
    opportunities: [
      { label: "Estimate value as event value", why: "Send the seller's estimated car value as an event parameter and pull it as eventValue/event revenue, so GA4 can weight high-value trucks and SUVs differently from a $2k beater when judging channel quality — parked with the dormant instant estimate that would supply the number." },
      { label: "Site-search terms", why: "If on-site search existed, the searchTerm dimension would surface what makes/models sellers look up — but the site has no search box, so there's nothing to capture until that feature exists." },
    ],
  },
  marketcheck: {
    underutilized: [
      { label: "Mileage vs the market", why: "Shown live on every profile ('low / average / high for its age') — currently via a local 20,000 km-per-year heuristic; the MarketCheck-comps version (against the actual market's mileage distribution for that trim) stays parked with the estimate flow." },
    ],
    buildNext: [
      { label: "NeoVIN factory options", why: "NeoVIN decodes the exact installed packages, trim options and MSRP for a specific VIN (leather, tow package, sunroof) even when not on the seller's form, so the offer engine can price the actual car instead of a base trim and stop overpaying on stripped units or underpaying on loaded ones." },
      { label: "Market days-supply", why: "MarketCheck's MDS endpoint returns how fast that year/make/model/trim is selling in-market, so a slow-moving car (high days-supply) can be flagged for a lower offer and a hot one bid more aggressively to win the lead." },
      { label: "Active listing DOM", why: "Comparable listings already carry days-on-market (dom_active / dom_180), telling you how long similar cars sit before selling, which directly informs the resale holding-cost baked into each offer instead of guessing." },
      { label: "Comparable price percentiles", why: "The Price endpoint's comparables return full percentile/median/stddev stats on price and mileage for real live listings near you, so the admin can show the operator a defensible 25th-75th resale band per lead rather than a single opaque number." },
      { label: "Predicted price + MSRP gap", why: "MarketCheck Price returns both the ML-predicted market value and original MSRP, and surfacing depreciation-from-new gives the operator a fast sanity check and a persuasive talking point when negotiating the seller down." },
    ],
    opportunities: [
      { label: "Private-party (FSBO) comps", why: "The FSBO search endpoint returns real private-seller asking prices (Kijiji/Autotrader-style listings), which is the exact channel DriveOffer competes against for the same car — pulling it shows what the seller could get selling themselves, arming the offer with a realistic ceiling." },
      { label: "VIN price-change history", why: "The VIN history endpoint reconstructs a car's online listing timeline with every price drop, so if this exact VIN was recently listed and repeatedly cut, the operator instantly knows it's a motivated, hard-to-sell seller worth a lower, faster offer." },
      { label: "Auction listing prices", why: "The auction search endpoint exposes wholesale/auction listings for the trim, giving DriveOffer the true bottom-of-market buy cost so margin and max-offer can be computed against real wholesale rather than a retail-only estimate." },
      { label: "Dealer-comp geolocation", why: "Listings carry dealer location and support radius search, so offers can be benchmarked against inventory within Calgary/Edmonton specifically instead of a national average, tightening resale accuracy for the Alberta market DriveOffer actually resells into." },
      { label: "Residual-value depreciation", why: "MarketCheck's residual-value/depreciation reporting projects how a model holds value over time, letting the operator prioritize buying trims that depreciate slowly (safer flips) and discount fast-droppers — a portfolio lens the per-lead price never gives." },
      { label: "Popular-vehicles demand", why: "The Popular Vehicles endpoint ranks models by live search/shopper volume, so a lead for a high-demand model can be routed to fast/generous handling knowing it will resell quickly, while low-demand bodies get more cautious offers." },
      { label: "Full NeoVIN spec + MPG", why: "NeoVIN returns fuel economy, drivetrain, dimensions and delivery date beyond the basic trim, enabling resale-listing copy and buyer-facing filters (e.g. AWD, fuel-efficient) to be auto-generated from the VIN with zero manual entry." },
      { label: "Recall / build flags", why: "NeoVIN's build-level data can surface factory recall-relevant configuration and exact equipment, letting the inspection checklist and offer note pre-flag known issues per VIN before the operator ever sees the car in person." },
      { label: "Sales statistics trend", why: "The Sales Statistics endpoint reports how actual sale prices for a segment are trending up or down, so offers can be nudged ahead of a softening market instead of reacting weeks late when resales come in under expectation." },
    ],
  },
  gtag: {
    underutilized: [
      { label: "Alberta city/region geo", why: "GA4 auto-derives seller city and region from IP, so DriveOffer can already see which Alberta towns (Calgary vs. Red Deer vs. rural) drive form-starts and route buying/tow effort accordingly without adding any tags." },
      { label: "Session source / medium", why: "GA4 already attributes every lead's session to a source/medium (google organic, meta cpc, direct), so the operator can see which channel produces cars that actually get bought instead of guessing at ad spend." },
      { label: "Device category split", why: "GA4 already tags each session mobile/desktop/tablet, and since most cash-for-cars sellers fill the form on a phone, this exposes whether mobile form-completion lags desktop and needs UX fixes." },
      { label: "Engagement time per step", why: "GA4 records engagement_time on each screen, so DriveOffer can already see which funnel step (Vehicle, Details, Contact) sellers stall on longest and is the real abandonment point." },
    ],
    buildNext: [
      { label: "Outbound & tel: clicks", why: "phone_click already fires on every tel: link with its placement (and feeds the 'Call placements' view); generic OUTBOUND link clicks — a seller leaving to check a competitor or marketplace mid-funnel — aren't tracked, and that's the missing half." },
      { label: "Lead-value on submit", why: "The value parameter is coded on generate_lead but can only ever send 0 while the instant estimate is off — real value does flow at close time via close_convert_lead, and submit-time value switches on the moment estimates return." },
      { label: "Offer/booking as conversions", why: "Server-side stage events already fire on real transitions (contacted, booked, closed with real margin via the Measurement Protocol); offer_sent is the one transition that doesn't reach GA4, and none of the events are marked as Key events in the GA4 admin UI yet." },
      { label: "User-scoped lead status", why: "Set a user_property like lead_stage (partial, submitted, offered, bought) via gtag so returning sellers are segmented by where they stalled, enabling GA4 audiences for remarketing instead of treating every visitor identically." },
      { label: "Condition/damage parameter", why: "A boolean has_damage already rides details_submitted and generate_lead; the granular condition tags + note stay form-data only — so GA4 can't yet correlate specific damage types with close rate, and damaged cars are the operator's margin sweet spot." },
      { label: "Google Ads / signal linking", why: "Enable Google Signals and link Google Ads so GA4 unlocks demographics, cross-device seller journeys, and remarketing audiences of form-abandoners — deferred because it requires consent-mode handling and account linking, not just a tag change." },
    ],
    opportunities: [
      { label: "Predictive purchase probability", why: "Once purchase-style conversions are wired with value, GA4's predictive metrics can score which seller sessions are likely to convert, letting the solo operator triage callbacks — unavailable now because the property lacks the qualifying conversion volume and value data to train it." },
    ],
  },
  pixel: {
    underutilized: [
      { label: "fbclid → server fbc", why: "The fbclid from an ad landing is persisted as fbc on the lead and replayed on the server-side Purchase at close — so a bought car is attributed back to the exact ad click that produced the seller." },
      { label: "Automatic Advanced Matching", why: "The pixel hashes the email/phone/name the seller already types into every event, raising Event Match Quality so more form-fillers get matched to Meta profiles and attributed — switched on, where most solo operators leave it off." },
      { label: "ViewContent content_category", why: "ViewContent fires with content_name '{year make model}' and content_category = make, telling Meta which body style/make a visitor browsed — the raw material for make-specific lookalikes and retargeting SUV-shoppers differently from sedan-shoppers." },
      { label: "Search query parameter", why: "The Search event carries the seller's vehicle string rather than firing as a bare ping, so the make/model intent behind each session reaches Meta as a capturable signal." },
    ],
    buildNext: [
      { label: "Value on Lead event", why: "The value parameter is wired on both the browser and server Lead events but always sends 0 while the instant estimate is off — the moment estimates return, Meta starts optimizing toward high-value cars automatically." },
      { label: "InitiateCheckout drop-off", why: "InitiateCheckout marks sellers who started the multi-step form, so subtracting Lead from InitiateCheckout in Events Manager gives a ready abandonment audience for retargeting — an Events-Manager audience setup, no new code." },
      { label: "Custom vehicle-segment events", why: "Standard events already carry content_name '{year make model}' and content_category = make; named trackCustom events per segment (Lead_Truck, Lead_HighMileage) aren't fired — needed only if you want separate campaigns optimizing per profitable segment." },
      { label: "AddPaymentInfo as offer-accept", why: "The AddPaymentInfo event (repurposed) or a custom OfferAccepted event marks the seller agreeing to a price, a rare high-intent milestone DriveOffer could optimize toward to find sellers who accept offers rather than just request them." },
      { label: "predicted_ltv parameter", why: "The predicted_ltv custom-data field lets DriveOffer attach an estimated deal margin to a Lead the moment it comes in, feeding Meta's value optimization — parked with the instant estimate, which is what would supply the number." },
    ],
    opportunities: [
      { label: "FindLocation for service area", why: "The FindLocation standard event fires when a seller checks whether their town is in DriveOffer's Alberta pickup range — but no service-area checker exists on the site, so the feature has to exist before the event can." },
    ],
  },
  clarity: {
    underutilized: [
      { label: "Rage & dead clicks", why: "Clarity auto-flags rapid repeat clicks and clicks that do nothing, so filtering to sellers who rage-clicked a broken 'Get Offer' button or a non-clickable make/model tile pinpoints exactly where high-intent leads bail." },
      { label: "Excessive / dead scrolling", why: "Clarity tags sessions where users scroll frantically without engaging, surfacing sellers hunting for a price, VIN field, or trust signal they can't find on the vehicle-details step before abandoning." },
      { label: "Quick-back sessions", why: "Clarity flags visitors who land then immediately bounce back to search, isolating which ad keywords or landing pages send unqualified 'how much is my car worth' traffic that never enters the form." },
      { label: "JavaScript error sessions", why: "Clarity records sessions where the page threw a JS error, letting you replay the exact recording of a seller whose form crashed on submit instead of losing that lead silently." },
      { label: "Scroll-depth on form steps", why: "Clarity heatmaps show how far down each step users actually scroll, revealing whether the condition/damage chips or consent line sit below the fold where sellers never see them." },
      { label: "Identify leads by ID", why: "Every consented session is stamped with the visitor's durable first-party ID — the same id stored on their lead and chat records — so one seller's recordings are findable in Clarity via a Custom-user-ID filter instead of scrubbing anonymous sessions." },
      { label: "Custom tag: traffic source", why: "Each consented session is tagged with its UTM source and campaign, letting you compare on-page behavior between Meta, Google, and referral sellers to see which channel sends people who actually finish the form." },
      { label: "Consent-gated recording", why: "The Clarity tag only injects for consented visitors (and fails closed when storage is blocked), keeping recordings legally clean under Alberta/Canadian privacy expectations." },
    ],
    buildNext: [
      { label: "GA4 Clarity Playback URL", why: "The GA4 integration stamps a replay link on the Clarity event, so you can jump straight from a converted-lead row in GA4 to that seller's recording without hunting through hundreds of sessions — a one-time toggle in the Clarity dashboard." },
      { label: "Custom tag: lead status", why: "Tagging sessions with lifecycle stage (partial, submitted, offer_sent, booked, sold) turns Clarity into a replay index by funnel stage, so you can binge-watch only the sellers who abandoned after seeing the offer." },
      { label: "Smart event: offer viewed", why: "A custom 'event' fired when the seller reaches the offer/confirmation screen lets you build a Clarity funnel from vehicle-select to offer-view to booking and measure exact drop-off at each real step." },
      { label: "Booking-page funnel event", why: "Firing a Clarity event on the self-serve /book/<token> page and its confirm step surfaces sellers who opened the booking link but never picked a slot, so you know to nudge them by SMS/email." },
      { label: "Unmask non-sensitive fields", why: "Selectively unmasking non-PII inputs like make/model/year/mileage (while keeping name, phone, email masked) lets you actually see what vehicle details sellers typed and where they hesitated or corrected themselves." },
    ],
    opportunities: [
      { label: "Custom tag: vehicle value", why: "A 'set' custom tag for estimated car value bucket lets you filter recordings to high-value trucks/SUVs and study how your best-margin sellers behave versus low-value beaters you'd rather deflect — parked with the dormant instant estimate that would supply the value." },
      { label: "Upgrade high-intent sessions", why: "The upgrade API force-keeps recordings of sessions that hit key actions (VIN entered, contact step reached), guaranteeing you never lose a qualified seller's replay to daily sampling on a traffic spike." },
    ],
  },
  email: {
    underutilized: [
      { label: "Per-URL click data", why: "The exact link clicked is stored per event and per lead ('Last click' on the profile + a timeline entry), so you can tell whether a seller clicked the offer amount, the booking link, or a guide — very different follow-up conversations." },
      { label: "Time-to-open latency", why: "First-delivery-to-first-open minutes are computed per person and shown as the 'Opened after' row — a fast open on a fresh offer is the cue to call while they're still looking at it." },
      { label: "Open/click count per lead", why: "Delivered / opened / clicked counts accumulate per lead and show on the profile — repeated opens of the same offer email are a hesitating-but-interested seller comparison-shopping." },
      { label: "Bounce reason surfacing", why: "Hard-bounce reasons are stored and surfaced twice — a red 'Bounce reason' row on the profile and an instant Telegram alert that emails to that lead are paused — so a dead address never silently eats your offer." },
      { label: "Reply-detected auto-warm", why: "An inbound reply (email now, SMS once live) stamps reply timestamps on the lead and pauses the automated drip for 7 days — a seller who wrote back never gets a tone-deaf 'you never responded' nudge." },
    ],
    buildNext: [
      { label: "Delivery-delayed events", why: "Resend's delivery_delayed (greylisting / soft-failure) events are already stored on the lead, but nothing surfaces them — an offer email silently stuck in retry currently looks identical to a seller ghosting." },
      { label: "Tag emails by stage", why: "Resend supports up to 75 key-value tags per send, so stamping each email with lead_id, funnel_stage, and vehicle_make would let DriveOffer slice open/click rates by exactly which offer step or car type converts best." },
      { label: "Tag offer price band", why: "Adding an offer_band tag (e.g. under-5k / 5-15k / 15k-plus) to offer emails would reveal whether high-value cars open and book at different rates, informing where to spend ad budget." },
      { label: "Idempotency keys", why: "Resend idempotency keys guarantee an offer or receipt email fires exactly once even if the cron retries or the webhook double-triggers, preventing the embarrassing duplicate-offer emails that erode seller trust." },
    ],
    opportunities: [
      { label: "Native scheduled_at send", why: "Resend can schedule a send up to 30 days out with natural-language timing, letting DriveOffer queue the Day-10/Day-21 follow-ups at send time instead of relying on the hourly cron to wake up and re-check every stale lead — an operational alternative, not new data." },
      { label: "Audiences + contact properties", why: "Resend Audiences store contacts with custom properties (make, model, year, city), enabling segmented re-marketing broadcasts like 'still selling that 2015 F-150?' without DriveOffer building its own mailing infrastructure." },
      { label: "Managed unsubscribe/topics", why: "Resend Broadcasts auto-handle unsubscribe links and opt-out topics, giving DriveOffer CASL-compliant marketing consent tracking for free instead of hand-rolling suppression logic that risks legal exposure in Canada." },
      { label: "Broadcast open/click analytics", why: "Aggregate broadcast engagement stats would show which subject lines and re-engagement offers actually get past-lead sellers to re-open, guiding copy for the dormant-lead revival campaigns." },
      { label: "Dedicated sending domain warmup", why: "Resend surfaces per-domain reputation and DMARC/SPF/DKIM status, so splitting transactional offers onto a separate subdomain from marketing broadcasts would protect deliverability of the critical offer email that a deal depends on." },
      { label: "Scheduled-send cancellation", why: "Resend lets you cancel or reschedule a queued email before it sends, so if a seller replies or books after a follow-up is queued, DriveOffer could pull the now-irrelevant 'you never responded' nudge before it embarrasses the brand." },
    ],
  },
  sms: {
    underutilized: [],
    buildNext: [
      { label: "SMS error codes", why: "Delivery callbacks return specific error codes (e.g. 30003 unreachable, 30005 unknown/dead number, 30007 carrier-filtered), which DriveOffer could use to auto-flag a seller's phone as bad and pivot to email instead of silently retrying an SMS that will never land." },
      { label: "Reply latency + timing", why: "The comms timeline already timestamps every outbound and inbound text, so DriveOffer could compute each seller's typical reply speed and active hours to know who is 'hot' right now and to schedule offer texts when that seller actually answers." },
      { label: "Inbound sender geo fields", why: "Twilio's inbound webhook attaches FromCity/FromState/FromZip parsed from the seller's number, giving a free sanity check on whether a lead is really in Alberta (worth a pickup) versus an out-of-province tire-kicker before the owner drives out." },
      { label: "Message segment counts", why: "Every message carries NumSegments and per-segment price, so DriveOffer can see its true cost-per-lead-nudged and catch bloated multi-segment templates that are quietly tripling SMS spend on low-value leads." },
      { label: "STOP-per-touchpoint context", why: "Opt-out state is stored, but pairing each STOP with which message triggered it (the low-ball offer text, the third follow-up, the appointment reminder) reveals exactly which message is burning the list so DriveOffer can kill that template." },
      { label: "Confirmation keyword parsing", why: "Inbound replies like 'YES', 'C', or a time already flow in, but treating recognized confirmation keywords as a structured signal lets the dashboard auto-advance a lead to 'appointment confirmed' instead of the owner eyeballing the thread." },
    ],
    opportunities: [
      { label: "Line Type Intelligence lookup", why: "Twilio Lookup can tell mobile vs landline vs VoIP before the first send, so DriveOffer can skip SMS on landlines (it will never deliver) and flag disposable/VoIP numbers that correlate with fake or low-intent car leads." },
      { label: "Carrier + caller name", why: "Lookup returns the carrier and CNAM caller-name on a number, giving a free identity/plausibility check on an anonymous seller and catching numbers registered to a business or dealer posing as a private party." },
      { label: "Link click tracking", why: "Turning on Twilio's ShortenUrls click tracking on links to the offer page or self-booking /book link tells DriveOffer exactly who tapped through, separating engaged sellers from ignored texts and enabling a timely 'saw you clicked' follow-up." },
      { label: "Scheduled offer messages", why: "Twilio message scheduling lets DriveOffer queue follow-ups to fire at a seller's known-good hour (e.g. after work) instead of relying on the hourly cron, improving read rates on offer and reminder texts without extra infrastructure." },
      { label: "Inbound MMS photos", why: "Twilio delivers inbound MMS MediaUrls, so DriveOffer could invite sellers to text photos of the car (odometer, damage, VIN plate) straight into the lead record, tightening the offer before an in-person inspection." },
      { label: "Messaging Insights analytics", why: "Twilio's Messaging Insights exposes account-wide deliverability, carrier-filtering, and error trends the per-lead timeline can't show, warning DriveOffer early if a carrier starts blocking its number and quietly killing lead contact." },
      { label: "Delivery-time-to-read gap", why: "For channels/carriers that report it, the 'delivered' vs later reply timestamp gap estimates how long texts sit unread, letting DriveOffer set a data-driven follow-up delay instead of guessing at the drip cadence." },
      { label: "Keyword auto-responder", why: "A dedicated inbound keyword (e.g. 'CAR' or 'OFFER') could let a seller start or re-open a deal by text, capturing warm inbound intent from a yard sign or flyer directly as a scored lead instead of losing it." },
      { label: "Number-reputation / 10DLC campaign data", why: "Twilio surfaces A2P 10DLC campaign status and sending reputation, which DriveOffer should track so it knows when carrier filtering (not seller disinterest) is the reason offers stop getting replies." },
    ],
  },
};
