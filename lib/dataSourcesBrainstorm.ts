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
  attribution: ["Landing page path patterns", "Referrer-quality segmentation", "Server-side first-party store"],
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
 * profile? Drives the 👤 marker across all three detail tiers. */
export function isProfileField(sourceId: string, label: string): boolean {
  if (PERSON_SOURCES.has(sourceId)) return !(NOT_PROFILE[sourceId]?.includes(label) ?? false);
  return PROFILE_EXTRA[sourceId]?.includes(label) ?? false;
}

// ===========================================================================
//  Brainstorm content per data source — the two lower tiers of the Sources
//  detail panel: "Collected but not fully used" + "Could collect but don't".
//  Curated from a research pass across each platform's real capabilities,
//  specific to a used-car cash-offer business. Pure reference data — merged
//  onto the health defs in dataSources.ts. Edit freely to add/refine ideas.
// ===========================================================================

export const BRAINSTORM: Record<string, { underutilized: CollectIdea[]; opportunities: CollectIdea[] }> = {
  leads: {
    underutilized: [
      { label: "Best-time-to-call windows", why: "The form already captures preferred contact method and best time, but if leads aren't routed into a call queue sorted by those windows, the owner phones people when they can't answer and connect rates drop." },
      { label: "Return-visitor count", why: "Visits-before-submit is already tracked, and a seller who came back 4+ times before filling the form is a high-intent, shopping-around lead who should get a faster and firmer offer than a one-visit impulse submit." },
      { label: "UTM-to-vehicle patterns", why: "You store both the campaign source and the exact car, but if you're not cross-tabbing them you can't see that (say) Facebook sends cheap high-mileage beaters while Google sends clean low-mileage cars worth chasing, which is the single biggest lever on ad spend." },
      { label: "fbc/fbp offline value", why: "Meta's click/browser IDs are captured on the lead, so once a car is actually bought you can fire a Purchase conversion at the real margin back to Meta to optimize the ad algorithm toward profitable sellers, not just form-fillers." },
      { label: "Time-on-site as intent", why: "Time on site is already recorded but rarely used as a triage signal — a 20-second submit reads very differently from a 6-minute one, and blending it into lead priority helps the solo operator call the serious sellers first." },
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
      { label: "Last field before exit", why: "The beacon already knows which field the seller was on when they bailed (e.g. stuck on phone vs. mileage), yet DriveOffer likely isn't segmenting recovery by exit point to fix that specific friction or tailor the follow-up." },
      { label: "Partial phone = callable lead", why: "A typed-but-unsubmitted phone/email is a warm contact the owner can text or call within minutes, but if it's only logged (not surfaced as an actionable 'call me now' alert) the hottest leads sit unworked." },
      { label: "Vehicle info without contact", why: "When someone entered year/make/model/mileage but no contact, DriveOffer already has enough to prep a ballpark number and knows exactly what car walked away, yet probably isn't using it to auto-draft an offer-teaser or price the abandonment." },
      { label: "Attribution on abandoners", why: "The beacon captures UTM/source/campaign on people who quit, so DriveOffer can already see which ads and keywords drive high-intent starts that don't finish, but that abandon-by-source view is likely buried instead of steering ad spend." },
      { label: "Owner-alert-sent flag", why: "Knowing whether a partial-lead alert actually fired lets DriveOffer separate 'alerted-but-never-recovered' from 'never-alerted' abandoners, a gap that's trivially reportable but probably not used to audit follow-up coverage." },
      { label: "Step reached at exit", why: "The multi-step flow (Vehicle to Details to Contact) means the beacon inherently records how deep each abandoner got, a funnel signal that's sitting in the data but likely not charted to show which step bleeds the most high-intent sellers." },
    ],
    opportunities: [
      { label: "Time spent per field", why: "Timing each field would flag where sellers hesitate (e.g. 20+ seconds on VIN or trim), pinpointing confusing inputs on a car form where any friction loses a high-value lead, and it's a standard beacon add that's just not wired yet." },
      { label: "Correction / retype rate", why: "Tracking how often a field is deleted and retyped (mileage, phone, price expectation) reveals misleading labels or strict validation rejecting valid Alberta phone/plate formats, which is a leading cause of silent abandonment." },
      { label: "Validation errors hit", why: "Logging which inline errors fired before exit (invalid VIN, unrecognized model, phone format) shows whether the form itself is rejecting good sellers, a fixable conversion killer the beacon currently doesn't capture." },
      { label: "Field completion order", why: "Recording the sequence in which fields were touched exposes non-linear behavior like sellers jumping to 'my price' before finishing vehicle details, informing whether to reorder the form to hook intent earlier." },
      { label: "Device and input type", why: "Capturing mobile-vs-desktop and touch-vs-keyboard on abandoners would reveal if the drop-off is a mobile-keyboard problem on the phone field, critical since most 'sell my car' sellers start on a phone." },
      { label: "Scroll depth / CTA seen", why: "Tracking whether the abandoner ever scrolled to the offer explanation or trust signals distinguishes 'left before understanding the value prop' from 'understood but hesitated,' shaping whether to fix copy or fix trust." },
      { label: "Focus/blur tab-switching", why: "Detecting when a seller tabs away (likely to look up mileage, VIN, or a competitor's offer) flags research-mode abandoners who need a comparison-focused follow-up rather than a generic reminder." },
      { label: "Price-expectation as typed", why: "Capturing any 'what you want for it' or condition input even when unsubmitted gives the owner the seller's asking mindset before first contact, letting the recovery message anchor an offer instead of guessing." },
      { label: "Repeat-visitor abandonment", why: "Flagging abandoners who've started the form before (via a stored cookie/ID) identifies serious sellers circling back multiple times, the highest-intent segment worth a personal call rather than an automated email." },
    ],
  },
  events: {
    underutilized: [
      { label: "Field re-edit & hesitation", why: "Blur/focus events already log how many times a seller re-touches the mileage, price-expectation, or VIN field — repeated edits flag uncertainty or negotiation anxiety the owner could pre-empt with a reassuring follow-up." },
      { label: "Time-per-funnel-step", why: "The captured step timestamps already yield dwell time on Vehicle vs. Details vs. Contact — long stalls on the Contact step signal offer-value hesitation worth a lighter-touch CTA or trust reassurance." },
      { label: "VIN decode drop-off point", why: "The VIN decode funnel already records where decodes fail or get abandoned, so DriveOffer can spot cars whose VIN won't resolve (older/imported vehicles) and route them to a manual-lookup fallback instead of losing the lead." },
      { label: "Form-error field ranking", why: "Form-error events already exist per field but likely aren't aggregated — ranking which fields error most (postal code, phone format, mileage) points to exactly which input to redesign to stop bleeding leads." },
      { label: "Resume-prompt conversion rate", why: "Exit-intent and resume prompts are already fired, but their accept-vs-ignore outcome is a first-party signal that tells the owner whether the abandonment nudge actually recovers cars or just annoys sellers." },
      { label: "Returning-visitor journey stitch", why: "Visitor and session IDs already let you stitch multi-visit sellers, revealing the researcher who priced their car three times before submitting — a hot lead the owner should prioritize but probably treats as one anonymous session." },
    ],
    opportunities: [
      { label: "Scroll depth on offer page", why: "First-party event streams natively capture scroll depth, so tracking how far sellers read the how-it-works / trust content reveals whether skeptics who bounce simply never saw the reassurance below the fold." },
      { label: "Rage & dead clicks", why: "Auto-capturable frustration signals (rapid repeated or no-op clicks) would surface a broken date-picker or unresponsive 'Get Offer' button that silently kills mobile leads on Alberta seller traffic." },
      { label: "Device, viewport & OS", why: "Every event can carry device/browser/viewport properties, letting the solo operator see if the form breaks on a specific Android width or Safari version rather than guessing why one segment never converts." },
      { label: "Referrer & UTM on event", why: "Attaching referrer and UTM parameters to each event ties a submitted-or-abandoned car to its exact Google/Facebook/Kijiji campaign, so ad spend can be judged on real leads instead of raw clicks." },
      { label: "Copy-to-clipboard & phone tap", why: "Listening for clipboard-copy of the offer and tel: link taps captures high-intent micro-conversions that predict a callback, giving the owner a real-time 'call this seller now' trigger." },
      { label: "Photo-upload interaction", why: "Even without storing images, tracking upload-start, file count, and abandonment during the (any) photo step reveals whether the upload UX is a friction wall for sellers with damaged cars." },
      { label: "Field autofill vs typed", why: "Detecting browser-autofilled contact fields flags return customers or already-known devices and separates genuine effort from bot/spam submissions cluttering the lead queue." },
      { label: "Estimate/slider engagement", why: "If any price-expectation slider or condition chips exist, logging their final and intermediate values captures the seller's own price anchor — gold for the owner's negotiation and offer-setting." },
      { label: "Session-level intent score", why: "Combining already-streamed events into a per-session friction/intent score (dwell, re-edits, scroll, errors) lets the admin dashboard rank inbound leads hot-to-cold instead of treating every form fill equally." },
    ],
  },
  attribution: {
    underutilized: [
      { label: "First- vs last-touch split", why: "The journey trail already stores both the original discovery channel and the final pre-submit source, but DriveOffer likely reports one blended number instead of learning that (e.g.) organic finds sellers while a retargeting ad closes them." },
      { label: "Time-to-conversion window", why: "The timestamped multi-touch trail reveals how many days elapse between first visit and form submit, a signal DriveOffer isn't using to separate impulse sellers (offer fast) from long deliberators (needs a nurture drip)." },
      { label: "Touch count per lead", why: "The number of sessions/touchpoints before submitting is already implicit in the journey data and flags whether a seller researched heavily (price-shopping competitors) versus converted on first visit." },
      { label: "Landing page path patterns", why: "The captured landing page URL shows whether leads enter on the homepage, a make/model guide, or a city page, letting DriveOffer double down on the SEO pages that actually produce buyable cars instead of just traffic." },
      { label: "gclid campaign-side join", why: "The stored gclid can be pushed back to Google Ads as an offline conversion keyed to the real buy price, so DriveOffer optimizes bids toward cars it actually purchases, not raw form fills." },
      { label: "Referrer-quality segmentation", why: "External referrers (Kijiji, Facebook groups, forums, competitor sites) are captured but probably not segmented by close rate, hiding which free referral sources send sellers who actually accept an offer." },
    ],
    opportunities: [
      { label: "Keyword + match type", why: "Google's {keyword} and {matchtype} ValueTrack params reveal the exact search a seller typed ('sell my truck no title' vs 'car value'), which is missing from plain utm_term and is the single best predictor of a buyable lead." },
      { label: "Device type at click", why: "The {device} param (mobile/tablet/desktop) isn't captured, yet a seller filling the form on their phone in a driveway behaves very differently from a desktop tire-kicker and could gate which follow-up channel to use." },
      { label: "Physical location ID", why: "{loc_physical_ms} gives the geographic area of the click, letting DriveOffer see if a lead is in Calgary versus a 3-hour drive away before the inspection logistics ever come up." },
      { label: "Network + placement", why: "{network} and {placement} distinguish Search vs Display vs Search-partner and the exact site an ad ran on, exposing whether cheap Display/partner clicks ever produce a real car purchase or just burn budget." },
      { label: "gbraid / wbraid capture", why: "These iOS privacy-safe click IDs preserve Google Ads attribution when gclid is stripped on Apple devices, and without capturing them DriveOffer silently loses credit for a large share of Alberta mobile sellers." },
      { label: "Ad creative + campaign ID", why: "{creative} and {campaignid} tie each lead to the specific ad and campaign that produced it, enabling true cost-per-purchased-car by creative rather than cost-per-lead vanity metrics." },
      { label: "Server-side first-party store", why: "Persisting attribution in a first-party cookie/DynamoDB record instead of relying on URL params survives ad-blockers and iOS stripping, preventing the growing 'direct/none' bucket that hides where buyable leads really came from." },
      { label: "Cross-device stitch key", why: "A durable first-party visitor ID lets DriveOffer merge the phone visit that started a form with the desktop session that finished it, so multi-device sellers aren't miscounted as two separate cold leads." },
      { label: "Session count before form", why: "Tracking total visits before submission (not just touches with UTMs) quantifies how much comparison shopping a seller did, helping DriveOffer flag price-sensitive leads that need a stronger opening offer." },
    ],
  },
  lookups: {
    underutilized: [
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
      { label: "Friend contact = warm lead", why: "The friend's phone/email is a pre-consented warm lead that should auto-create a lead record and trigger the same nurture drip as a form submission, not sit inert until the friend happens to fill out the site themselves." },
      { label: "Referral code redemption status", why: "The generated code already tells you whether the friend actually used it, so unredeemed codes should fire a 'your friend recommended us' reminder to the friend and a nudge to the referrer to follow up personally." },
      { label: "Referrer's own attribution", why: "You already captured the referrer's UTM/source/behavior from when they first arrived, letting you see which ad channels produce sellers who go on to refer others (true viral-loop ROI) rather than just first-touch cost." },
      { label: "Referral message intent", why: "The free-text message the referrer wrote ('has a truck to sell', 'downsizing') is unstructured intent that should surface on the lead card and in Telegram alerts so the owner opens the conversation already knowing the car and situation." },
      { label: "Referrer-friend relationship graph", why: "Because you hold both parties' identities you can already detect clusters (one referrer sending 5 friends, or a friend who later becomes a referrer), spotlighting your best advocates and detecting obvious self-referral rings for the same household." },
    ],
    opportunities: [
      { label: "Share channel used", why: "Track whether the referral link was shared via SMS, WhatsApp, Facebook, or copy-link so you learn which channel actually drives car sellers in Alberta and can pre-fill the highest-converting share button; not done yet because it requires generating trackable share links instead of a plain form." },
      { label: "Referred car details", why: "Add optional make/model/year/mileage fields to the referral form so the friend's lead arrives pre-qualified and the owner can ballpark an offer before first contact, at the cost of a slightly longer form that may reduce referral volume." },
      { label: "Double-sided reward payout", why: "Record and automate an actual referrer reward (e.g. $100 on a completed purchase) with paid/pending status, since double-sided incentives drive the vast majority of successful referral programs and right now the code grants nothing trackable." },
      { label: "Reward eligibility gating", why: "Track the condition that unlocks the referrer's payout (friend's car actually bought, not just contacted) so you never pay on a dead lead, which is the honest-money guardrail a cash-for-cars margin business needs." },
      { label: "Self-referral / fraud flags", why: "Detect matching phone/email/IP or same-household address between referrer and friend to block people gaming a cash reward with their own second car, a standard referral-software safeguard you don't currently enforce." },
      { label: "Referral link click tracking", why: "Move from a static form to a unique trackable link per referrer so you can see clicks-before-submit and abandonment, revealing warm friends who visited but didn't finish and are worth a manual follow-up." },
      { label: "Referrer leaderboard / tiers", why: "Track cumulative successful referrals per person to unlock escalating bonuses for power-referrers (dealership-adjacent folks, mechanics, tow operators) who can feed you a steady stream of cars, which flat one-time rewards fail to cultivate." },
      { label: "Time-to-referral latency", why: "Timestamp when a seller refers relative to their own sale so you learn the optimal moment to ask (right after a happy payout vs. weeks later) and can automate the referral invite at that peak-satisfaction window." },
      { label: "Referral consent capture", why: "Log that the referrer confirmed the friend agreed to be contacted, giving you CASL-compliant proof-of-consent for the cold outreach to that friend's phone/email, which protects an Alberta business texting/emailing third parties." },
    ],
  },
  chat: {
    underutilized: [
      { label: "Pages viewed pre-chat", why: "Chat already logs the exact pages/guides a visitor read before opening chat, so DriveOffer can see whether they were on a specific-model landing page or the FAQ and route the offer conversation accordingly instead of starting cold." },
      { label: "Current page context", why: "The widget knows the exact URL the visitor is chatting from (e.g. the /schedule or a make/model guide), so the operator can tailor the reply and skip re-asking what they came for." },
      { label: "Geo from IP", why: "Chat detects the visitor's city/region via IP, letting DriveOffer instantly flag whether the seller is even in the Alberta service area before spending time on an offer conversation." },
      { label: "Returning vs new visitor", why: "The widget flags whether this person has visited before, surfacing warm sellers who keep coming back to the offer page but haven't yet submitted, so they can be nudged harder in chat." },
      { label: "Referrer and search terms", why: "Chat captures the referring URL and search query that brought them in (e.g. 'sell my truck fast Calgary'), revealing urgency and intent that should shape the offer pitch and get logged to the lead." },
      { label: "Chat-to-lead linkage", why: "Chat has the visitor's name/contact and their form-submission state, so DriveOffer can tie a chat to its lead record and see whether chatters actually convert versus vanish, which most setups never join up." },
    ],
    opportunities: [
      { label: "Pre-chat vehicle form", why: "Add year/make/model/mileage fields to the pre-chat form so every chat arrives with the car's basics already captured, turning idle chats into structured lead records instead of freeform text." },
      { label: "Post-chat CSAT rating", why: "Enable the post-chat 1-5 satisfaction survey to measure whether sellers feel the offer conversation was fair or pushy, a signal that directly predicts whether they accept or ghost." },
      { label: "Chat tags/dispositions", why: "Tag each chat with an outcome like 'price too low', 'not in service area', or 'wants to book inspection' so DriveOffer can quantify why chat sellers drop off instead of guessing." },
      { label: "Proactive price-page trigger", why: "Fire a proactive chat invite when a visitor lingers on the offer/schedule page or scrolls the FAQ, catching hesitant sellers at the exact moment of doubt before they bounce to a competitor." },
      { label: "Offline lead-capture form", why: "Configure the offline message to collect car details and contact when the solo operator is away, so after-hours sellers become recoverable leads instead of missed chats." },
      { label: "Missed-chat tracking", why: "Track chats that went unanswered because the one-person shop was busy, quantifying lost seller demand and justifying an after-hours autoresponder or bot handoff." },
      { label: "Canned offer responses", why: "Set up saved replies for the recurring questions (how the process works, payment method, whether they buy salvage/high-mileage), cutting response time so sellers don't cool off waiting." },
      { label: "First-response time metric", why: "Surface average time-to-first-reply per chat, since a seller shopping multiple cash-buyers will take the first fast offer and slow replies silently cost deals." },
      { label: "Device and OS", why: "Log whether the seller is on mobile versus desktop so DriveOffer can steer mobile chatters toward a phone-friendly path (text photos, tap-to-call) rather than a long form." },
    ],
  },
  geo: {
    underutilized: [
      { label: "Postal / FSA code", why: "ipwho.is already returns the IP's postal code, which in Alberta maps to a Forward Sortation Area (first 3 chars) — lets DriveOffer estimate drive-distance to the seller and prioritize leads within its Calgary/Edmonton pickup radius instead of guessing from city name." },
      { label: "Latitude / longitude", why: "The free response includes coarse coordinates, so DriveOffer could auto-plot leads on a map and compute a rough km-to-pickup figure per lead rather than eyeballing whether a car is worth the inspection trip." },
      { label: "ISP / connection org", why: "The connection object already names the ISP and org (e.g., Telus, Shaw vs. a datacenter host), which instantly flags a lead coming from a hosting provider or corporate network — a strong signal it's a scraper, competitor, or fake rather than a real seller at home." },
      { label: "Timezone vs. form time", why: "ipwho.is returns the IP's timezone and current local time, so DriveOffer can detect when a 'local' Alberta lead is actually submitting from a non-Mountain-Time zone (mismatch = likely spam/out-of-province) and time follow-up texts to the seller's real waking hours." },
      { label: "IP-city vs. stated city", why: "The resolved city is already stored but not cross-checked against the address/city the seller typed — a divergence (IP says Toronto, form says Calgary) is a cheap fraud/tire-kicker filter the owner isn't applying." },
    ],
    opportunities: [
      { label: "VPN / proxy / Tor flag", why: "ipwho.is's paid security block returns boolean VPN/proxy/Tor/anonymous flags — a private seller listing their own car has no reason to hide their IP, so this is a high-signal filter for bots and fraudulent 'sell my car' submissions, though it costs a paid tier." },
      { label: "Hosting / datacenter flag", why: "The security block's 'hosting' boolean identifies IPs owned by AWS/Google/OVH, which no genuine at-home seller uses — catching these kills competitor-scraper and automated junk leads before they burn the owner's follow-up time." },
      { label: "Fraud / abuse score", why: "Peer APIs (IPQualityScore, ipapi.is) return a 0-100 risk/abuse score per IP, giving DriveOffer a single tunable threshold to auto-deprioritize suspicious leads instead of manually judging each one, at the cost of adding a second enrichment vendor." },
      { label: "Mobile vs. fixed line", why: "Connection-type detection (mobile carrier vs. residential broadband) is available on paid tiers and tells DriveOffer whether the seller is on their phone — useful for choosing SMS-first outreach and knowing the coarse location is less reliable (mobile IPs route through carrier hubs)." },
      { label: "Accuracy radius", why: "Some providers return an accuracy radius (km) with each lookup, letting DriveOffer know when a lead's location is a confident city hit versus a 50km blur — so it can trust or discount the distance-to-pickup estimate rather than treating every geo as exact." },
      { label: "Reverse hostname (PTR)", why: "ipinfo-class APIs return the reverse-DNS hostname, which often exposes the ISP region or a corporate/VPN provider name — an extra cheap corroboration of whether the lead is a real Alberta residential connection." },
      { label: "ASN-based repeat detection", why: "The ASN is in the free connection object but could be logged and aggregated to spot many leads from the same unusual network (a single ASN spamming forms), enabling DriveOffer to rate-limit or block abusive sources it currently can't even see." },
      { label: "Currency / calling code", why: "The API can return the IP's currency and international calling code, letting DriveOffer instantly flag a lead whose phone country code or currency isn't Canadian — a fast tell for offshore fake sellers that the current country-only check misses." },
    ],
  },
  metaAds: {
    underutilized: [
      { label: "Region + DMA breakdown", why: "The Insights `region` breakdown splits spend and cost-per-lead by Alberta locality (Calgary vs Edmonton vs rural), so DriveOffer can see which towns produce cheap sellable cars and stop paying to reach areas outside a sane inspection-drive radius." },
      { label: "Hourly performance breakdown", why: "`hourly_stats_aggregated_by_audience_time_zone` shows leads-per-hour, letting the solo operator dayparting-bid toward evenings/weekends when sellers actually fill the form and can answer the callback quickly." },
      { label: "Placement-level cost-per-lead", why: "`publisher_platform` + `platform_position` reveal whether Reels, Stories, or FB Feed produce the cheapest leads, so budget stops leaking into Audience Network placements that generate junk 'sell my car' clicks." },
      { label: "Age & gender of leads", why: "The age/gender breakdown on the lead action shows which seller demographics convert to actual purchased cars, feeding smarter targeting than treating all Alberta adults as one blob." },
      { label: "Frequency by ad", why: "`frequency` (impressions/reach) flags when the same sellers have seen the ad 6+ times with no new leads, the classic signal to refresh creative before cost-per-lead balloons in a small provincial market." },
      { label: "Ad relevance diagnostics", why: "`quality_ranking`, `engagement_rate_ranking`, and `conversion_rate_ranking` are free per-ad fields that tell you exactly whether a losing ad is dying on the creative, the hook, or the offer, instead of guessing." },
    ],
    opportunities: [
      { label: "Offline conversion upload", why: "The Offline Conversions / Conversions API can push back 'car actually inspected' and 'car purchased' events with the real buy price as value, so Meta optimizes toward sellers who become deals, not just form-fillers — the single highest-leverage add for a buy-side business." },
      { label: "Value-based lookalike audiences", why: "Uploading purchased-car sellers with their margin as the value field lets Meta build value-based lookalikes that skew toward high-margin vehicles, far better seed quality than a generic 'people in Alberta' interest audience." },
      { label: "CRM custom-audience sync", why: "Pushing hashed emails/phones of past leads via the Custom Audiences API enables exclusion of already-bought and dead leads and remarketing to stalled form-abandoners, none of which a read-only reporting setup does today." },
      { label: "Suppression of bought sellers", why: "Uploading the list of people whose car you already purchased as an exclusion audience stops wasting spend re-advertising to someone who no longer has a car to sell." },
      { label: "Audience match rate", why: "When uploading customer files the API returns approximate match/coverage stats, a cheap health check that below-40% match means the CRM's phone/email data is dirty and remarketing is silently underperforming." },
      { label: "Estimated ad recall lift", why: "`estimated_ad_recall_rate` measures how memorable a creative is, useful for the top-of-funnel brand ads that build 'DriveOffer = cash for my car in Alberta' recall before someone is ready to sell." },
      { label: "Creative asset breakdown", why: "Dynamic Creative asset-level reporting (`image_asset`, `video_asset`, `body_asset`, `title_asset`) tells you which specific headline or photo drives leads, so you scale the winning 'Get a cash offer today' variant instead of a whole ad." },
      { label: "Lead Ads instant forms", why: "Native Meta Lead Ad forms retrieved via the API capture the seller (name, phone, vehicle) inside Facebook with no landing-page bounce, and the API can pull those leads straight into DynamoDB for a faster callback than the current site-form-only path." },
      { label: "Ad-level UTM & ad ID join", why: "Reading each ad's `tracking_specs`/URL tags and the ad/adset/campaign IDs via the API lets DriveOffer stitch every DynamoDB lead back to the exact ad that produced it, turning cost-per-lead into true cost-per-purchased-car per creative." },
    ],
  },
  ga4Data: {
    underutilized: [
      { label: "Landing page performance", why: "The landingPage dimension crossed with conversions shows which entry pages (a VIN-specific guide vs. the homepage) actually turn traffic into form-starts, so ad and SEO spend can be steered toward the pages that produce sellers." },
      { label: "Source/medium by conversion", why: "DriveOffer likely reports sessions by source but not keyEvents by sessionSourceMedium, so it can't see that (e.g.) google/organic yields cheap leads while facebook/cpc yields expensive ones — the single most important number for a lead business." },
      { label: "City and region breakdown", why: "The city and region dimensions already reveal whether traffic and leads cluster in Calgary vs. Edmonton vs. rural Alberta, letting the operator concentrate ad geo-targeting and plan inspection-drive routes." },
      { label: "New vs returning behavior", why: "The newVsReturning dimension separates first-time visitors from people who came back to finish, and returning-but-not-converted sellers are the warmest re-marketing audience a car buyer has." },
      { label: "Engagement rate by segment", why: "Engagement rate and averageSessionDuration are already collected but rarely sliced by source or landing page, which is exactly how you spot a traffic channel sending bots or bounce-y clicks that will never sell a car." },
      { label: "Device category conversion gap", why: "DriveOffer sees sessions by device but probably not conversion rate by device, and since most private sellers fill the form on a phone, a mobile-specific drop in form completion is a silent revenue leak." },
    ],
    opportunities: [
      { label: "Form-funnel key events", why: "Register each step (form_start, vehicle_selected, details_completed, contact_submitted) as a GA4 key event and query eventCount by eventName to build a true drop-off funnel, since aggregate pageviews can't show where sellers abandon." },
      { label: "Landing page + query string", why: "The landingPagePlusQueryString dimension preserves UTM and ad parameters on the entry URL, letting DriveOffer attribute leads to a specific ad creative or campaign link rather than a bare page path." },
      { label: "Hour and day-of-week", why: "The hour and dayOfWeek dimensions reveal when sellers actually submit forms, so a solo operator knows when to be ready to call back fast and when to schedule ad budget or send drip messages." },
      { label: "Session campaign name", why: "Querying sessionCampaignName ties conversions back to named Google/Meta campaigns without leaving GA4, closing the loop between ad spend and booked cars for ROAS reporting." },
      { label: "Scroll depth on offer page", why: "GA4's enhanced-measurement scroll event feeds the scrolledUsers metric, showing whether sellers actually read the offer/how-it-works content before bouncing — a proxy for trust in a cash-for-cars pitch." },
      { label: "Estimate value as event value", why: "Send the seller's estimated car value as an event parameter and pull it as eventValue/event revenue, so GA4 can weight high-value trucks and SUVs differently from a $2k beater when judging channel quality." },
      { label: "Session default channel group", why: "The sessionDefaultChannelGroup dimension auto-buckets traffic (Organic Search, Paid Social, Direct, Referral) so the operator gets a clean channel-level lead breakdown without maintaining manual UTM rules." },
      { label: "Cohort / retention report", why: "The Data API's runReport with a cohortSpec can track whether returning-seller cohorts (people who left and came back) eventually convert, quantifying how much follow-up nurture is worth." },
      { label: "Site-search terms", why: "If on-site search is enabled, the searchTerm dimension surfaces what makes/models sellers look up, revealing demand signals and content gaps (e.g. many searches for a model DriveOffer doesn't yet target)." },
    ],
  },
  marketcheck: {
    underutilized: [
      { label: "NeoVIN factory options", why: "NeoVIN decodes the exact installed packages, trim options and MSRP for a specific VIN (leather, tow package, sunroof) even when not on the seller's form, so the offer engine can price the actual car instead of a base trim and stop overpaying on stripped units or underpaying on loaded ones." },
      { label: "Market days-supply", why: "MarketCheck's MDS endpoint returns how fast that year/make/model/trim is selling in-market, so a slow-moving car (high days-supply) can be flagged for a lower offer and a hot one bid more aggressively to win the lead." },
      { label: "Active listing DOM", why: "Comparable listings already carry days-on-market (dom_active / dom_180), telling you how long similar cars sit before selling, which directly informs the resale holding-cost baked into each offer instead of guessing." },
      { label: "Comparable price percentiles", why: "The Price endpoint's comparables return full percentile/median/stddev stats on price and mileage for real live listings near you, so the admin can show the operator a defensible 25th-75th resale band per lead rather than a single opaque number." },
      { label: "Mileage vs the market", why: "Comparable listings include mileage distribution, letting you instantly flag whether this seller's odometer is well below or above the market median for that trim — a mileage-adjusted resale swing the flat percentile price hides." },
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
      { label: "Scroll-depth on landing pages", why: "Enhanced Measurement's 90% scroll event is likely already firing on the homepage and guide pages, revealing whether sellers read past the offer pitch before bouncing so weak below-the-fold copy can be trimmed." },
      { label: "Device category split", why: "GA4 already tags each session mobile/desktop/tablet, and since most cash-for-cars sellers fill the form on a phone, this exposes whether mobile form-completion lags desktop and needs UX fixes." },
      { label: "Engagement time per step", why: "GA4 records engagement_time on each screen, so DriveOffer can already see which funnel step (Vehicle, Details, Contact) sellers stall on longest and is the real abandonment point." },
      { label: "Outbound & tel: clicks", why: "Enhanced Measurement auto-logs outbound and phone-link clicks, capturing sellers who call or leave to check a competitor mid-funnel — a high-intent signal the operator can prioritize for callback." },
    ],
    opportunities: [
      { label: "Vehicle params on events", why: "Attach make, model, year, and mileage as event parameters (registered as custom dimensions) on form-start/submit so GA4 reports show which car types convert best and which are junk leads — not done because each param must be registered and the funnel events currently carry no vehicle context." },
      { label: "Lead-value on submit", why: "Send the estimated offer or resale value as the event's value parameter so GA4 measures revenue-weighted conversions and true cost-per-qualified-lead, instead of counting a $500 beater the same as a $25k truck." },
      { label: "Offer/booking as conversions", why: "Fire and mark key events for offer_sent, offer_accepted, and appointment_booked so GA4's funnel and attribution reflect the full deal, not just the top-of-funnel form submit that the site currently mirrors." },
      { label: "User-scoped lead status", why: "Set a user_property like lead_stage (partial, submitted, offered, bought) via gtag so returning sellers are segmented by where they stalled, enabling GA4 audiences for remarketing instead of treating every visitor identically." },
      { label: "Condition/damage parameter", why: "Pass the seller's self-reported condition and damage flags as event params so GA4 can correlate 'rough/salvage' declarations with close rate — worth adding because damaged cars are the operator's margin sweet spot yet are invisible in analytics today." },
      { label: "Google Ads / signal linking", why: "Enable Google Signals and link Google Ads so GA4 unlocks demographics, cross-device seller journeys, and remarketing audiences of form-abandoners — deferred because it requires consent-mode handling and account linking, not just a tag change." },
      { label: "Custom scroll & timing events", why: "Replace the single 90% scroll event with 25/50/75/100 milestones and a time-on-form timer to pinpoint exactly where long guide pages and the multi-step form lose sellers — not on by default because it needs custom gtag events beyond Enhanced Measurement." },
      { label: "Predictive purchase probability", why: "Once purchase-style conversions are wired with value, GA4's predictive metrics can score which seller sessions are likely to convert, letting the solo operator triage callbacks — unavailable now because the property lacks the qualifying conversion volume and value data to train it." },
      { label: "Form-error / validation events", why: "Emit a custom event when a field validation fails or a submit errors so GA4 surfaces friction (bad VIN entry, phone format) that silently kills leads — worth adding since a failed submit is an invisible lost car today." },
    ],
  },
  pixel: {
    underutilized: [
      { label: "fbclid → server fbc", why: "The Pixel captures the fbclid click ID from ad landings and stores it in the fbc cookie, but if it's not persisted and replayed on the eventual Purchase/close event, DriveOffer loses attribution linking a bought car back to the exact ad that generated the seller." },
      { label: "Value on Lead event", why: "The Lead event supports value + currency parameters, so DriveOffer can fire each form submission with an estimated gross margin (predicted resale minus expected buy price by vehicle segment) and let Meta optimize toward high-value cars instead of counting every lead equally." },
      { label: "Automatic Advanced Matching", why: "The Pixel can auto-scrape the email/phone/name fields the seller already types into the form and hash them into every event, raising Event Match Quality so more form-fillers get matched to Meta profiles and attributed — a big lift a solo operator usually leaves off by default." },
      { label: "ViewContent content_category", why: "ViewContent already fires on vehicle/guide pages but likely without content_category or content_name, so DriveOffer isn't telling Meta which body style or make a visitor browsed — data needed to build make/model-specific lookalikes and retarget SUV-shoppers differently from sedan-shoppers." },
      { label: "Search query parameter", why: "The Search event supports a search_string parameter, so the year/make/model or 'how much is my car worth' terms sellers type into the estimator are capturable signals of intent and vehicle type that DriveOffer probably fires as a bare event without the actual query." },
      { label: "InitiateCheckout drop-off", why: "InitiateCheckout marks sellers who started the multi-step form, so subtracting Lead from InitiateCheckout in Events Manager gives a ready abandonment audience for retargeting, which DriveOffer likely isn't building custom audiences from." },
    ],
    opportunities: [
      { label: "Contact standard event", why: "Meta has a dedicated Contact event for phone/email/message initiations, so firing it when a seller clicks call/text or replies would let DriveOffer optimize campaigns toward people who actually reach out — a stronger buy-intent signal than a form fill." },
      { label: "Schedule standard event", why: "There's a purpose-built Schedule event, so firing it when a seller books an inspection via the self-booking link tells Meta which leads reach the appointment stage, a mid-funnel conversion far closer to a bought car than a raw Lead." },
      { label: "Purchase on car bought", why: "Meta's Purchase event with real value/currency is the true bottom-of-funnel signal, and firing it server-side when the operator marks a car as bought (with the actual buy price) would let Meta optimize for sellers who convert to purchased vehicles, not just leads." },
      { label: "predicted_ltv parameter", why: "The predicted_ltv custom-data field lets DriveOffer attach an estimated deal margin to a Lead the moment it comes in, feeding Meta's value optimization so it hunts for high-margin cars (clean late-model trucks) rather than low-value ones — no purchase-close wait required." },
      { label: "external_id matching", why: "Sending a hashed internal lead ID as external_id on every event stitches the seller's browser sessions and later server CAPI purchase into one identity, lifting match rates and closing the loop even when the same person returns on a different device." },
      { label: "CompleteRegistration event", why: "The CompleteRegistration standard event can distinguish a fully-completed offer request from a partial InitiateCheckout, giving Meta a cleaner 'finished the whole form' conversion to optimize toward than the generic Lead." },
      { label: "AddPaymentInfo as offer-accept", why: "The AddPaymentInfo event (repurposed) or a custom OfferAccepted event marks the seller agreeing to a price, a rare high-intent milestone DriveOffer could optimize toward to find sellers who accept offers rather than just request them." },
      { label: "Custom vehicle-segment events", why: "trackCustom lets DriveOffer fire named events like Lead_Truck or Lead_HighMileage with vehicle parameters, so a solo operator can build separate campaigns and lookalikes per profitable segment instead of treating a $30k truck lead and a scrap sedan identically." },
      { label: "FindLocation for service area", why: "The FindLocation standard event fires when a seller checks whether their town is in DriveOffer's Alberta pickup range, flagging in-area high-intent sellers Meta can prioritize over out-of-region traffic that will never convert." },
    ],
  },
  clarity: {
    underutilized: [
      { label: "Rage & dead clicks", why: "Clarity auto-flags rapid repeat clicks and clicks that do nothing, so filtering to sellers who rage-clicked a broken 'Get Offer' button or a non-clickable make/model tile pinpoints exactly where high-intent leads bail." },
      { label: "Excessive / dead scrolling", why: "Clarity tags sessions where users scroll frantically without engaging, surfacing sellers hunting for a price, VIN field, or trust signal they can't find on the vehicle-details step before abandoning." },
      { label: "Quick-back sessions", why: "Clarity flags visitors who land then immediately bounce back to search, isolating which ad keywords or landing pages send unqualified 'how much is my car worth' traffic that never enters the form." },
      { label: "JavaScript error sessions", why: "Clarity records sessions where the page threw a JS error, letting you replay the exact recording of a seller whose form crashed on submit instead of losing that lead silently." },
      { label: "Scroll-depth on form steps", why: "Clarity heatmaps show how far down each step users actually scroll, revealing whether the condition/damage chips or consent line sit below the fold where sellers never see them." },
      { label: "GA4 Clarity Playback URL", why: "The GA4 integration stamps a replay link on the Clarity event, so you can jump straight from a converted-lead row in GA4 to that seller's recording without hunting through hundreds of sessions." },
    ],
    opportunities: [
      { label: "Identify leads by ID", why: "The identify API attaches your internal lead code / hashed email to the recording, so a Telegram lead alert can deep-link to that exact seller's session replay instead of you scrubbing anonymous recordings." },
      { label: "Custom tag: vehicle value", why: "A 'set' custom tag for estimated car value bucket lets you filter recordings to high-value trucks/SUVs and study how your best-margin sellers behave versus low-value beaters you'd rather deflect." },
      { label: "Custom tag: lead status", why: "Tagging sessions with lifecycle stage (partial, submitted, offer_sent, booked, sold) turns Clarity into a replay index by funnel stage, so you can binge-watch only the sellers who abandoned after seeing the offer." },
      { label: "Custom tag: traffic source", why: "Tagging each session with the UTM source/campaign lets you compare on-page behavior between Meta, Google, and referral sellers to see which channel sends people who actually finish the form." },
      { label: "Smart event: offer viewed", why: "A custom 'event' fired when the seller reaches the offer/confirmation screen lets you build a Clarity funnel from vehicle-select to offer-view to booking and measure exact drop-off at each real step." },
      { label: "Upgrade high-intent sessions", why: "The upgrade API force-keeps recordings of sessions that hit key actions (VIN entered, contact step reached), guaranteeing you never lose a qualified seller's replay to daily sampling on a traffic spike." },
      { label: "Booking-page funnel event", why: "Firing a Clarity event on the self-serve /book/<token> page and its confirm step surfaces sellers who opened the booking link but never picked a slot, so you know to nudge them by SMS/email." },
      { label: "Consent-gated recording", why: "Wiring the consent API to your cookie banner makes Clarity capture legally clean under Alberta/Canadian privacy expectations and stops recording from being blocked outright for consented-only visitors." },
      { label: "Unmask non-sensitive fields", why: "Selectively unmasking non-PII inputs like make/model/year/mileage (while keeping name, phone, email masked) lets you actually see what vehicle details sellers typed and where they hesitated or corrected themselves." },
    ],
  },
  email: {
    underutilized: [
      { label: "Per-URL click data", why: "Resend's clicked webhook reports the exact link clicked, so DriveOffer could tell whether a lead clicked the offer amount, the booking link, or a guide, yet likely treats every click as one undifferentiated engagement signal." },
      { label: "Time-to-open latency", why: "The gap between delivered and opened timestamps reveals how fast a seller engages, letting DriveOffer trigger a Telegram nudge or call the instant a fresh lead opens the offer email instead of waiting on the hourly cron." },
      { label: "Open/click count per lead", why: "Repeated opens or clicks on the same offer email signal a hesitating-but-interested seller comparison-shopping, a strong hot-lead score input that probably isn't feeding the transparent lead score." },
      { label: "Delivery-delayed events", why: "Resend emits a delivery_delayed event (greylisting/soft failure) distinct from a hard bounce, so an offer email silently stuck in retry could be caught and re-sent via SMS instead of the owner assuming the seller ghosted." },
      { label: "Bounce reason surfacing", why: "Hard-bounce payloads carry the specific SMTP reason (invalid mailbox vs. full inbox), letting DriveOffer auto-correct obvious typos in a seller's email and re-attempt rather than losing a real car lead to a fat-fingered address." },
      { label: "Reply-detected auto-warm", why: "An inbound reply is the highest-intent signal a seller can give, and it should instantly flip the lead's nurtureStage to hot and pause the automated drip, not just post to the Telegram Replies channel." },
    ],
    opportunities: [
      { label: "Tag emails by stage", why: "Resend supports up to 75 key-value tags per send, so stamping each email with lead_id, funnel_stage, and vehicle_make would let DriveOffer slice open/click rates by exactly which offer step or car type converts best." },
      { label: "Tag offer price band", why: "Adding an offer_band tag (e.g. under-5k / 5-15k / 15k-plus) to offer emails would reveal whether high-value cars open and book at different rates, informing where to spend ad budget." },
      { label: "Idempotency keys", why: "Resend idempotency keys guarantee an offer or receipt email fires exactly once even if the cron retries or the webhook double-triggers, preventing the embarrassing duplicate-offer emails that erode seller trust." },
      { label: "Native scheduled_at send", why: "Resend can schedule a send up to 30 days out with natural-language timing, letting DriveOffer queue the Day-10/Day-21 follow-ups at send time instead of relying on the hourly cron to wake up and re-check every stale lead." },
      { label: "Audiences + contact properties", why: "Resend Audiences store contacts with custom properties (make, model, year, city), enabling segmented re-marketing broadcasts like 'still selling that 2015 F-150?' without DriveOffer building its own mailing infrastructure." },
      { label: "Managed unsubscribe/topics", why: "Resend Broadcasts auto-handle unsubscribe links and opt-out topics, giving DriveOffer CASL-compliant marketing consent tracking for free instead of hand-rolling suppression logic that risks legal exposure in Canada." },
      { label: "Broadcast open/click analytics", why: "Aggregate broadcast engagement stats would show which subject lines and re-engagement offers actually get past-lead sellers to re-open, guiding copy for the dormant-lead revival campaigns." },
      { label: "Dedicated sending domain warmup", why: "Resend surfaces per-domain reputation and DMARC/SPF/DKIM status, so splitting transactional offers onto a separate subdomain from marketing broadcasts would protect deliverability of the critical offer email that a deal depends on." },
      { label: "Scheduled-send cancellation", why: "Resend lets you cancel or reschedule a queued email before it sends, so if a seller replies or books after a follow-up is queued, DriveOffer could pull the now-irrelevant 'you never responded' nudge before it embarrasses the brand." },
    ],
  },
  sms: {
    underutilized: [
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
