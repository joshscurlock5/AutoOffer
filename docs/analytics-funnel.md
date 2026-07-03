# DriveOffer — funnel tracking & remarketing

How the GA4 + Meta Pixel funnel instrumentation works, which events to flag in
GA4, how to read drop-off, and how to build the remarketing audiences this was
built for ("advertise to people who only went part-way").

## Architecture

All tracking goes through three tiny helpers — never call `gtag`/`fbq` directly:

| Helper | File | Fires |
|---|---|---|
| `track(event, params)` | `lib/analytics.ts` | one GA4 event |
| `trackCtaClick(location)` | `lib/analytics.ts` | GA4 `cta_click` (used by `<OfferCtaLink/>`) |
| `trackFunnel(event, ga, meta?)` | `lib/analytics.ts` | GA4 event **+** its mirrored Meta standard event |
| `trackPhoneClick(location)` | `lib/analytics.ts` | GA4 `phone_click` + Meta `Contact` |
| `trackMeta(event, params, id?)` | `lib/metaPixel.ts` | one Meta Pixel event (optional CAPI dedup id) |

`trackFunnel` owns the GA4→Meta mapping in one place so the two can't drift:

| GA4 event | Meta standard event | Meaning |
|---|---|---|
| `widget_submit` | `Search` | looked up a car's value |
| `estimate_viewed` | `ViewContent` | **saw their offer** (prime remarketing signal) |
| `contact_engaged` | `InitiateCheckout` | started filling the contact form |
| `generate_lead` | `Lead` | submitted — fired inline with a CAPI dedup id |

Server-side conversions (recover ad-blocked users) live in `lib/metaCapi.ts`
(Meta `Lead`) and `lib/ga4Mp.ts` (GA4 `generate_lead`), both called from
`app/api/leads/route.ts`.

> **Remarketing channel = Meta only (by design).** GA4 is configured
> measurement-only (`allow_google_signals:false`, `allow_ad_personalization_signals:false`
> in `app/layout.tsx`) and the privacy policy says so, so GA4 audiences can't feed
> Google Ads. The mid-funnel Meta events above are what build the remarketing
> audiences. To later add Google Ads remarketing you'd flip those flags **and**
> update the privacy policy.

## The funnel (canonical order)

```
cta_click ─▶ offer_flow_start ─▶ step1_submitted ─▶ details_submitted
          ─▶ estimate_viewed ─▶ contact_engaged ─▶ generate_lead
```

`widget_submit` precedes `offer_flow_start` when the entry was the homepage
widget. VIN path: `vin_submitted → vin_confirmed` (or `vin_failed`/`vin_rejected`)
feeds into `step1_submitted`. Every entry CTA carries a `location` on `cta_click`
and stamps `?source=<location>` on the URL, which surfaces as `cta_source` on
`offer_flow_start` and `generate_lead`.

### Full event reference

**Entry / top:** `cta_click` (`location`), `widget_submit` (+Meta Search),
`phone_click` (`location`).
**Vehicle:** `offer_flow_start` (`source`, `cta_source`), `step1_submitted`,
`vin_submitted`, `vin_confirmed`, `vin_rejected`, `vin_failed` (`reason`).
**Details:** `details_submitted` (`hasDamage`), `form_error`
(`step`, `reason`).
**Value:** `estimate_viewed` (+Meta ViewContent), `estimate_error`.
**Contact:** `contact_started` (impression, GA4-only), `contact_engaged`
(interaction, +Meta InitiateCheckout), `edit_vehicle`, `generate_lead`
(+Meta Lead +server CAPI +server GA4 MP), `lead_error`, `form_error`.
**Engagement:** `chat_opened`, `chat_message_sent`, `chat_conversation_started`,
`exit_intent_shown/clicked/dismissed/email_captured`, `contact_popup_opened`,
`email_click`, `faq_opened`, `scroll_depth` (`percent`, `slug`).
**Recovery:** `partial_captured` (abandoned-cart beacon on the contact step),
`resume_shown/clicked` (returning-visitor banner).
**Secondary conversions:** `referral_submitted` (+Meta Lead), `referral_error`,
`contact_form_submitted` (+Meta Lead), `contact_form_error`.

## GA4 setup

### Mark as Key events (Admin → Events → "Mark as key event")
`generate_lead` (primary), `phone_click`, `widget_submit`, `referral_submitted`,
`contact_form_submitted`. Optionally `contact_engaged` as a soft/micro conversion.

> **`generate_lead` is counted twice** — once by the browser, once by the server
> GA4 MP mirror (tagged `transport: server`). They are **not** auto-deduped.
> Pick one as the canonical conversion: keep the **browser** `generate_lead` as
> the Key event and treat the server copy as a blocker-recovery comparison (build
> a `transport = server` segment to see how many conversions gtag missed). If you
> instead want the server count to be canonical, mark it and filter the browser
> one out of the conversion. Don't mark both.

### Drop-off report (Explore → Funnel exploration)
Add steps in this order, then read the % drop between each:
1. `offer_flow_start`
2. `step1_submitted`
3. `details_submitted`
4. `estimate_viewed`
5. `contact_engaged`
6. `generate_lead`

Open the funnel as a **trended** funnel and break down by the `cta_source`
dimension (register `cta_source`, `location`, `reason`, `step` as custom
dimensions under Admin → Custom definitions if you want them in standard reports;
they're queryable in Explorations either way). `form_error` / `estimate_error` /
`vin_failed` counts beside each step explain *why* people leave.

## Meta remarketing audiences (Events Manager → Audiences → Custom Audience → Website)

These are the "went part-way" audiences — each is *reached a step* **AND NOT**
*Lead*, over a lookback window:

| Audience | Rule | Who it captures |
|---|---|---|
| Saw their offer, didn't submit | `ViewContent` AND NOT `Lead`, last 30 days | hottest — they saw a number |
| Started contact, didn't finish | `InitiateCheckout` AND NOT `Lead`, last 30 days | warmest — form abandoners |
| Searched a car value | `Search` AND NOT `Lead`, last 14 days | top-of-funnel re-engage |

Build them in Events Manager, then target them (or a lookalike) in Ads Manager.
The server CAPI `Lead` improves match quality for the exclusion. Mid-funnel
events are browser-Pixel only — fine for audience membership.

## Environment variables

| Var | Enables |
|---|---|
| `NEXT_PUBLIC_GA_ID` | GA4 (browser) — `G-XXXXXXX` |
| `GA4_MP_API_SECRET` | server-side GA4 `generate_lead` (Admin → Data Streams → Measurement Protocol API secrets) |
| `GA4_MP_DEBUG=1` | route MP events to GA4's validation endpoint (logs issues); unset in prod |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Pixel (browser) |
| `META_CAPI_TOKEN` | Meta Conversions API (server `Lead`) |
| `META_TEST_EVENT_CODE` | route server CAPI to Events Manager → Test Events; unset in prod |
| `CRON_SECRET` | bearer token the scheduled worker (`/api/cron`) requires; also gates the ops/cadence layer |

Everything is a **safe no-op** until its keys are set — nothing breaks if a
channel isn't configured yet.

## Post-submission cadence & ops layer (email + Telegram, no SMS)

Automated communication *after* a lead submits, plus the owner-facing ops layer.
The hourly worker at **`/api/cron`** (triggered by an AWS EventBridge Scheduler
rule with `Authorization: Bearer ${CRON_SECRET}`) drives all the timed work. Every
send is gated/best-effort. Customer emails require a valid email; phone-only leads
are covered by the owner Telegram alerts. **The flow assumes we can usually quote,
so a new lead gets NO automatic "still want an offer?" drip** — the owner drives it.

**Customer (email), keyed on `nurtureStage`:**
- **Submit →** instant confirmation only (method-aware copy). No drip.
- **`/moreinfo <id> <questions, one per line>` → `awaiting_info`:** one email with
  the questions (each line after the id becomes a bullet in the "What we still need"
  box; **at least one question is required** — with nothing to ask, send an offer
  instead; stored on the lead as `infoQuestions`). Reminders at **+2d / +5d** from
  `moreInfoSentAt` that RE-SEND the same questions, then stop.
- **`/offer`→`/confirm` → `offer_sent`:** offer reminders at **+2d / +5d / +10d**
  from `offerSentAt` (each restates the offer, pushes call/text, includes the
  booking link), then stop.
- **`lost`:** a single **Day-21 win-back**. **`partial`:** one abandoned-cart recovery.
- **Booked:** booking confirmation (on booking) + a **day-of morning reminder**
  with a one-tap Confirm button.

**Owner (Telegram):** stale-lead SLA alerts (~30m/2h/12h) for unworked "new"
leads; a daily **needs-action digest** (8am MT); **T-2h** inspection ping
(owner-only); a **weekly scoreboard** (Mon 8am MT). Commands: `/offer`→`/confirm`
(send offer + mint booking link), **`/moreinfo <id> <questions, one per line>`** (one
email; at least one question required, one bullet per line), `/schedule <id> <YYYY-MM-DD HH:MM>` (Mountain Time), `/cancel`, `/usage`.

**Telegram channels (split by urgency).** `lib/notify.ts` routes each alert to one
of four optional chats via env vars; anything unset falls back to `TELEGRAM_CHAT_ID`:
**🚗 Leads** (`TELEGRAM_CHAT_LEADS` — new leads, website chats, your command replies),
**💬 Replies** (`TELEGRAM_CHAT_REPLIES` — customer email replies, via the Gmail script),
**💰 Bookings** (`TELEGRAM_CHAT_BOOKINGS` — booked, confirmed, T-2h heads-up),
**📋 Updates** (`TELEGRAM_CHAT_UPDATES`, keep muted — stale nudges, abandoned-cart,
referrals, daily digest, weekly scoreboard). The webhook accepts commands from ANY
configured chat (`telegramChatIds()`). All four must be added to the `amplify.yml`
env whitelist or they won't reach the runtime.

**Customer self-booking:** the offer email + reminders link to `/book/<token>`
(unguessable token minted on `/confirm`). The page shows the car/offer and 45-min
slots within the shop's hours (Mon/Tue 8–3:30, Wed/Thu 8–6:30, Fri 8–4:30, Sat
8–2:30; 14 days out, ≥3h notice, multiple bookings allowed per slot). Availability
lives in `lib/availability.ts` (+ MT helpers in `lib/time.ts`); booking API is
`app/api/book` (+ `/api/book/confirm`).

**Back-half metrics** come from lifecycle timestamps stamped on transitions
(`firstTouchAt`, `contactedAt`, `offerSentAt`, `scheduledAt`, `closedAt`): first-
response latency, offer-sent rate, and lead→close feed the weekly scoreboard and
the existing offline **Purchase** CAPI.

## Verifying

- **Regression:** `node scripts/smoke-test.mjs` against a local `npm run dev`
  (checks pages render, lead/referral POST, admin gating, damage/condition capture,
  the abandoned-cart partial route, cron auth, and that the `OfferCtaLink`
  source-merge didn't break `?make=` deep-links).
- **GA4 events:** set a debug `NEXT_PUBLIC_GA_ID` and watch **GA4 → Admin →
  DebugView** while clicking through the funnel; confirm `cta_click.location`
  values and that `?make=Toyota` still pre-fills the vehicle.
- **Meta events:** the **Meta Pixel Helper** extension, or set
  `META_TEST_EVENT_CODE` and watch **Events Manager → Test Events** (covers the
  server CAPI `Lead`).
- **Server GA4 MP:** set `GA4_MP_DEBUG=1`, submit a lead, and read the
  `[ga4-mp]` validation response in the server logs.
