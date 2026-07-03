import "server-only";
import type { Lead, Referral } from "./types";
import { site, amvicLicence } from "./site-config";

// ===========================================================================
//  Customer emails via Resend's REST API (no SDK, like notify.ts):
//   - sendLeadConfirmation: instant confirmation when a lead is captured.
//   - scheduleLeadDrip: 2 follow-up reminders (Day 2 + Day 5) scheduled at lead
//     time via Resend's `scheduled_at` (no cron needed). Returns their email ids.
//   - cancelScheduledEmails: cancel those scheduled drips when the lead leaves
//     "new" (so we never nudge someone the owner already reached).
//
//  All gated (no-op until RESEND_API_KEY is set), best-effort, never throw, and
//  only target leads with a valid email. PII-free chrome; replies go to the inbox.
// ===========================================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || `${site.name} <hello@driveoffer.ca>`;
const REPLY_TO = process.env.EMAIL_REPLY_TO || site.email;
const API = "https://api.resend.com/emails";
const DAY = 86400000;

// Small inline "icons" for the offer email, built from codepoints so they
// survive the build + JSON transport intact (literal emoji can arrive escaped).
const ICON_FAST = String.fromCodePoint(0x26a1); //  ⚡
const ICON_MAIL = String.fromCodePoint(0x2709); //  ✉

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** Plain "year make model trim" for subject lines — control-char-stripped,
 * whitespace-collapsed, and length-clamped (the vehicle fields come from the
 * public form, so the subject header gets hygiene even though the body is esc()'d). */
function carPlain(lead: Lead): string {
  const v = lead.vehicle;
  if (!v) return "";
  const raw = `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`;
  const printable = Array.from(raw).map((ch) => { const c = ch.charCodeAt(0); return c < 32 || c === 127 ? " " : ch; }).join("");
  return printable.replace(/\s+/g, " ").trim().slice(0, 120);
}
function validEmail(lead: Lead): string {
  const to = (lead.contact.email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ? to : "";
}
function firstName(lead: Lead): string {
  return esc((lead.contact.name || "there").trim().split(" ")[0] || "there");
}
function carLine(lead: Lead): string {
  const v = lead.vehicle;
  return v ? esc(`${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`) : "";
}
function reachVerb(lead: Lead): string {
  const m = lead.contact.contactMethod || "call";
  return m === "email" ? "email you" : m === "text" ? "text you" : "call you";
}

// ---- HTML building blocks (shared chrome) ---------------------------------

function intro(heading: string, paragraphHtml: string): string {
  // Split on newlines so a body can be several short paragraphs (easier to skim
  // on a phone). A single-line body stays one paragraph, unchanged.
  const paras = paragraphHtml
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#3a4654;">${p}</p>`)
    .join("");
  return `<tr><td style="padding:28px 28px 10px;">
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#0e1c2b;font-weight:800;">${heading}</h1>
    ${paras}
  </td></tr>`;
}
// "What happens next" reassurance box for vehicle leads. (Replaced the old
// instant "estimated range" box — there is no on-screen number anymore; a
// specialist prepares the offer and reaches out. To re-introduce an emailed
// estimate later, add a box here keyed off lead.estimate.)
function nextStepsBox(lead: Lead): string {
  if (!lead.vehicle) return "";
  return `<tr><td style="padding:0 28px;">
    <div style="background:#EAF5EF;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b63;font-weight:600;">What happens next</div>
      <div style="font-size:15px;line-height:1.55;color:#0f5132;margin-top:4px;">A ${esc(site.name)} specialist will ${reachVerb(lead)} with your offer. There's no obligation &mdash; and if it's a fit, we handle pickup, payment, and the paperwork.</div>
    </div></td></tr>`;
}
function ctaBox(): string {
  return `<tr><td style="padding:0 28px 8px;">
    <a href="tel:${site.phoneE164}" style="display:inline-block;background:#1A7F54;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 26px;border-radius:999px;">Call or text ${esc(site.phoneDisplay)}</a>
  </td></tr>`;
}

// Social-proof strip for the nurture emails — pulls straight from site-config so
// the numbers never drift. Reused by the drip / win-back / follow-up templates.
function proofBox(): string {
  const bits = [
    `<a href="${site.reviewsUrl}" style="color:#1A7F54;text-decoration:none;">&#9733;&#9733;&#9733;&#9733;&#9733; top-rated on Google</a>`,
    `${site.carsBought.toLocaleString("en-CA")}+ cars bought`,
    amvicLicence,
    "paid on the spot",
  ].filter(Boolean).join(" &middot; ");
  return `<tr><td style="padding:0 28px 4px;">
    <div style="border-top:1px solid #eceef1;padding-top:12px;font-size:13px;line-height:1.6;color:#5b6b63;">${bits}</div>
  </td></tr>`;
}

/** The customer's self-booking link — empty until an offer is sent + a token minted. */
export function bookingLink(lead: Lead): string {
  return lead.bookingToken ? `${site.url}/book/${lead.bookingToken}` : "";
}
/** Green "Book your pickup" button — only rendered once the lead has a booking token.
 * Framed as OPTIONAL: a quick call or text is the fastest way to finalize. */
function bookingBox(lead: Lead): string {
  const url = bookingLink(lead);
  if (!url) return "";
  return `<tr><td style="padding:0 28px 8px;">
    <a href="${url}" style="display:inline-block;background:#1A7F54;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 26px;border-radius:999px;">Book your pickup &rarr;</a>
    <div style="font-size:13px;line-height:1.5;color:#7b8794;margin-top:8px;">Booking a time is optional — the fastest way to finalize is a quick <a href="tel:${site.phoneE164}" style="color:#1A7F54;text-decoration:none;font-weight:600;">call or text to ${esc(site.phoneDisplay)}</a>. No need to pick a time here unless you'd prefer to.</div>
  </td></tr>`;
}

/** A pill button linking anywhere — green by default, dark navy when alt=true. */
function linkButton(url: string, label: string, alt = false): string {
  return `<tr><td style="padding:0 28px 8px;">
    <a href="${url}" style="display:inline-block;background:${alt ? "#0e1c2b" : "#1A7F54"};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 26px;border-radius:999px;">${label}</a>
  </td></tr>`;
}
/** A pill button with an optional badge INSIDE it, vertically centered with the label.
 * Used for the SECONDARY actions (Book online, etc.); the call button uses callButtonB. */
function pillButton(href: string, label: string, badge: string, dark: boolean): string {
  const bg = dark ? "#0e1c2b" : "#1A7F54";
  const badgeHtml = badge
    ? `<span style="display:inline-block;vertical-align:middle;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;background:rgba(255,255,255,.24);color:#ffffff;border-radius:999px;padding:2px 7px;margin-left:7px;">${badge}</span>`
    : "";
  return `<a href="${href}" style="display:inline-block;background:${bg};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:12px 20px;border-radius:999px;margin:0 8px 8px 0;"><span style="vertical-align:middle;">${label}</span>${badgeHtml}</a>`;
}
/** The primary "call or text" button — stacked (a small "Fastest · Call or text"
 * line over the big, tappable number) so it never wraps/smushes on a phone. */
function callButtonB(): string {
  return `<a href="tel:${site.phoneE164}" style="display:block;background:#1A7F54;color:#ffffff;text-decoration:none;text-align:center;padding:13px 18px;border-radius:14px;margin:0 0 8px;">
    <span style="display:block;font-size:11px;line-height:1.3;letter-spacing:.06em;text-transform:uppercase;font-weight:800;color:#d6f5e5;">&#9889; Fastest &middot; Call or text</span>
    <span style="display:block;font-size:21px;line-height:1.3;font-weight:800;margin-top:2px;">${esc(site.phoneDisplay)}</span>
  </a>`;
}
/** A single "Call or text" button, as a full row. */
function callCta(_badge: string): string {
  return `<tr><td style="padding:0 28px 12px;">${callButtonB()}</td></tr>`;
}
/** Call/text (primary) + a secondary action button (optionally badged). No caption. */
function callFirstCta(_callBadge: string, secondUrl: string, secondLabel: string, secondBadge: string): string {
  const second = secondUrl ? pillButton(secondUrl, secondLabel, secondBadge, true) : "";
  return `<tr><td style="padding:0 28px 12px;">${callButtonB()}${second}</td></tr>`;
}
/** "Call or text is fastest" emphasis line — used to nudge phone contact in every email. */
function fastestLine(): string {
  return `<tr><td style="padding:2px 28px 10px;font-size:14px;line-height:1.55;color:#3a4654;">
    &#9889; <strong>Fastest:</strong> call or text <a href="tel:${site.phoneE164}" style="color:#1A7F54;text-decoration:none;font-weight:700;">${esc(site.phoneDisplay)}</a> now — we can often sort your offer on the spot.
  </td></tr>`;
}
/** Bulleted list of the questions we asked via /moreinfo (reused by the request + reminder). */
function questionsBox(qs: string[]): string {
  if (!qs || !qs.length) return "";
  const items = qs
    .map((q) => `<div style="font-size:15px;line-height:1.5;color:#1f2a36;margin:5px 0;">&#8226;&nbsp;&nbsp;${esc(q)}</div>`)
    .join("");
  return `<tr><td style="padding:0 28px 6px;">
    <div style="background:#f3f6f8;border:1px solid #e4e9ed;border-radius:12px;padding:15px 18px;margin-bottom:14px;">
      <div style="font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;color:#5b6b63;font-weight:700;margin-bottom:4px;">What we still need</div>
      ${items}
    </div></td></tr>`;
}
/** A tiny reference line so a customer's reply can be traced back to the lead —
 * the Gmail→Telegram script reads this to prefill the /offer command. */
function refRow(lead: Lead): string {
  const sid = lead.id.split("-")[0];
  return `<tr><td style="padding:4px 28px 10px;font-size:11px;color:#c2c8cf;">Ref: ${esc(sid)}</td></tr>`;
}
function shell(
  innerRows: string,
  footerNote = "You're receiving this because you requested an offer at driveoffer.ca.",
): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e9ec;">
        <tr><td style="background:#0e1c2b;padding:20px 28px;">
          <span style="font-size:20px;font-weight:800;color:#ffffff;">Drive<span style="color:#4f7cf7;">Offer</span></span>
        </td></tr>
        ${innerRows}
        <tr><td style="padding:24px 28px 28px;">
          <div style="border-top:1px solid #eceef1;padding-top:16px;font-size:13px;line-height:1.6;color:#7b8794;">
            AMVIC Licensed Wholesaler &middot; We come to you &middot; Paid the same visit.<br/>
            ${site.name} &middot; <a href="tel:${site.phoneE164}" style="color:#1A7F54;text-decoration:none;">${esc(site.phoneDisplay)}</a> &middot; ${esc(site.email)}<br/>
            ${footerNote}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ---- The three messages ---------------------------------------------------

type Email = { subject: string; html: string };

function confirmationEmail(lead: Lead): Email {
  const v = lead.vehicle;
  const heading = v ? `We've got your ${carLine(lead)}` : "We've got your details";
  const head = `<tr><td style="padding:28px 28px 4px;"><h1 style="margin:0;font-size:22px;line-height:1.25;color:#0e1c2b;font-weight:800;">${heading}</h1></td></tr>`;
  const faster = `<tr><td style="padding:0 28px 8px;font-size:14px;line-height:1.55;color:#3a4654;">Want it faster? <strong>Call or text ${esc(site.phoneDisplay)}</strong> now — we can often give you your offer on the spot.</td></tr>`;
  return {
    subject: v ? `We've got your ${v.year} ${v.make} ${v.model} — ${site.name}` : `Thanks for reaching out — ${site.name}`,
    html: shell(head + nextStepsBox(lead) + faster + callCta("fastest")),
  };
}

function drip1Email(lead: Lead): Email {
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your <strong>${carLine(lead)}</strong>` : "your car";
  const body = `Just checking in, ${first} — we'd still love to make you an offer on ${carRef}. Used-car values shift week to week, so it's worth locking in this week's number. It only takes a minute: call or text and we'll get you your offer.`;
  return {
    subject: v ? `Still want an offer for your ${v.make} ${v.model}?` : `Still here when you're ready — ${site.name}`,
    html: shell(intro(`Still thinking it over, ${first}?`, body) + nextStepsBox(lead) + ctaBox() + proofBox()),
  };
}

function drip2Email(lead: Lead): Email {
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `Last check-in, ${first} — we'd still love to buy ${carRef}, and we come to you and pay on the spot (e-transfer or bank draft). No pressure at all — whenever you're ready, just call or text and we'll handle the rest.`;
  return {
    subject: `Ready when you are — ${site.name}`,
    html: shell(intro("Still here when you're ready", body) + ctaBox() + proofBox()),
  };
}

// Post-offer reminders (cron-driven off offerSentAt): a written offer with no
// booking yet. steps 0/1/2 = +2 / +5 / +10 days. Each pushes call/text as the
// fastest path and offers the self-booking link.
function postOfferFollowupEmail(lead: Lead, step: number): Email {
  const car = carLine(lead) || "your car";
  const plain = carPlain(lead) || "your car";
  const priceText = lead.offer
    ? lead.offer.low === lead.offer.high
      ? money(lead.offer.low)
      : `${money(lead.offer.low)} &ndash; ${money(lead.offer.high)}`
    : "your offer";
  const bodies = [
    `Just making sure our offer of <strong>${priceText}</strong> for your <strong>${car}</strong> reached you.\nThe fastest way to lock it in is a quick call or text — we can often confirm on the spot.\nReady to go? Book a time below and we'll come to you and pay on the spot.`,
    `Your offer of <strong>${priceText}</strong> for your <strong>${car}</strong> still stands.\nUsed values shift week to week, so it's worth locking in this week's number.\nCall or text for the quickest answer, or book your pickup below.`,
    `Last note on your offer of <strong>${priceText}</strong> for your <strong>${car}</strong>.\nWhenever you're ready, call or text or pick a time below and we'll come to you and pay on the spot.`,
  ];
  const subjects = [
    `Any questions about your ${plain} offer?`,
    `Your offer still stands — ${site.name}`,
    `Last reminder — your offer for ${plain}`,
  ];
  const headings = ["Your offer's ready", "Still good to go?", "Still here when you're ready"];
  const i = step <= 0 ? 0 : step >= 2 ? 2 : 1;
  return {
    subject: subjects[i],
    html: shell(intro(headings[i], bodies[i]) + callFirstCta("fastest", bookingLink(lead), "Book online", "optional") + proofBox()),
  };
}

// Sent by /moreinfo — the questions we need answered before quoting. Call/text first.
function moreInfoEmail(lead: Lead, questions: string[]): Email {
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your vehicle";
  const body = `To get you an accurate offer on ${carRef}, we just need a couple details.\nThe fastest and easiest way is to <strong>call or text us</strong> — we can usually finish your offer right then.\nPrefer email? Just reply with the answers below.`;
  return {
    subject: v ? `A couple quick questions about your ${v.make} ${v.model}` : `A couple quick questions — ${site.name}`,
    html: shell(intro("Just need a couple details", body) + questionsBox(questions) + callCta("fastest") + refRow(lead)),
  };
}

// Cron reminder while we're awaiting the customer's info (after /moreinfo or /ask).
function awaitingInfoReminderEmail(lead: Lead): Email {
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `We're ready to send your offer on ${carRef} as soon as we get the final details.\nThe fastest way is a quick <strong>call or text</strong> — we can often sort it out and give you a number on the spot.\nPrefer email? Just reply with the answers below and we'll take it from there.`;
  return {
    subject: v ? `Still want your offer for your ${v.make} ${v.model}?` : `Still want your offer? — ${site.name}`,
    html: shell(intro("Let's finish your offer", body) + questionsBox(lead.infoQuestions || []) + callCta("fastest") + refRow(lead)),
  };
}

// Confirmation after the customer self-books an inspection.
function bookingConfirmationEmail(lead: Lead): Email {
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const when = lead.appointmentAt
    ? new Date(lead.appointmentAt).toLocaleString("en-CA", {
        timeZone: "America/Edmonton",
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "your selected time";
  const where = lead.appointmentLocation ? esc(lead.appointmentLocation) : "the address you gave us";
  const detailBox = `<tr><td style="padding:0 28px;">
    <div style="background:#EAF5EF;border:1px solid #cfe6da;border-radius:12px;padding:18px;margin-bottom:18px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#5b6b63;font-weight:600;">Your inspection</div>
      <div style="font-size:18px;font-weight:800;color:#0f5132;margin-top:6px;">${when}</div>
      <div style="font-size:15px;color:#1f2a36;margin-top:6px;">&#128205; ${where}</div>
    </div></td></tr>`;
  const confirmNote = `<tr><td style="padding:0 28px 10px;font-size:14px;line-height:1.55;color:#3a4654;">We'll send you a reminder the morning of — <strong>please tap &ldquo;Confirm&rdquo; so we know you're still on.</strong> We only send a rep out to bookings that are confirmed.</td></tr>`;
  const body = `A ${esc(site.name)} rep will come to ${carRef} at the time and place below, inspect your vehicle, and pay you on the spot (bank draft).\nNeed to change it? Just call or text.`;
  return {
    subject: `Booked — your ${site.name} inspection`,
    html: shell(intro("You're booked!", body) + detailBox + confirmNote + ctaBox()),
  };
}

// Morning-of reminder with a one-tap "Confirm I'll be there" button.
function bookingDayOfEmail(lead: Lead): Email {
  const time = lead.appointmentAt
    ? new Date(lead.appointmentAt).toLocaleString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" })
    : "today";
  const where = lead.appointmentLocation ? esc(lead.appointmentLocation) : "your address";
  const confirmBtn = lead.bookingToken
    ? `<tr><td style="padding:0 28px 8px;">
        <a href="${site.url}/api/book/confirm?token=${lead.bookingToken}" style="display:inline-block;background:#1A7F54;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 26px;border-radius:999px;">&#10003; Confirm I'll be there</a>
      </td></tr>`
    : "";
  const body = `Quick reminder that a ${esc(site.name)} rep is coming by <strong>today at ${time}</strong> (&#128205; ${where}) to inspect your car, confirm your offer, and pay you on the spot.\n<strong>Please tap below to confirm you'll be there</strong> — if we don't hear from you, we may have to cancel the visit.\nSomething changed? Just call or text.`;
  return {
    subject: `Today: your ${site.name} inspection at ${time}`,
    html: shell(intro("See you today!", body) + confirmBtn + ctaBox()),
  };
}

// Day-10 extended nurture for a lead still sitting in "new" (cron-driven).
function extendedNurtureEmail(lead: Lead): Email {
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `Hi ${first} — still thinking about selling ${carRef}? No rush, but used-car values move week to week, so this week's number may be better than you'd expect. Call or text and we'll get you a firm offer — we come to you and pay on the spot.`;
  return {
    subject: v ? `A quick offer for your ${v.make} ${v.model}?` : `Still here when you're ready — ${site.name}`,
    html: shell(intro(`Still open to an offer, ${first}?`, body) + ctaBox() + proofBox()),
  };
}

// Day-21 win-back for a lead marked "lost" (declined / went cold), cron-driven, once.
function winbackEmail(lead: Lead): Email {
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `Still have ${carRef}?\nPrices have moved, and we'd be glad to take another look and re-quote — no obligation at all.\nIf you've already sold it, no worries; just ignore this.`;
  return {
    subject: v ? `Still have your ${v.make} ${v.model}? Happy to re-quote` : `Happy to re-quote — ${site.name}`,
    html: shell(intro("Want a fresh offer?", body) + callFirstCta("fastest", `${site.url}/get-offer`, "Get an offer online &rarr;", "")),
  };
}

// Customer reminder before a booked inspection (cron-driven off appointmentAt).
function appointmentReminderEmail(lead: Lead): Email {
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const when = lead.appointmentAt
    ? new Date(lead.appointmentAt).toLocaleString("en-CA", {
        timeZone: "America/Edmonton",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "soon";
  const body = `Hi ${first} — quick reminder that we're set to look at ${carRef} on <strong>${when}</strong>. We'll confirm the offer on the spot and, if it's a yes, pay you right there (e-transfer or bank draft). Need to reschedule? Just call or text.`;
  return {
    subject: `Reminder: your ${site.name} inspection ${when}`,
    html: shell(intro("See you soon", body) + ctaBox()),
  };
}

// Abandoned-cart recovery: a single, transactional nudge to someone who typed
// their contact but never submitted (cron-driven off a "partial" lead).
function partialRecoveryEmail(lead: Lead): Email {
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `Looks like you started getting an offer on ${carRef} but didn't finish.\nPick up where you left off — it only takes a minute, and we come to you and pay on the spot.`;
  return {
    subject: v ? `Finish your offer for your ${v.make} ${v.model}?` : `Finish your offer — ${site.name}`,
    html: shell(intro("Your offer is almost ready", body) + callFirstCta("fastest", `${site.url}/get-offer`, "Finish online &rarr;", "")),
  };
}

// Sent to the person who refers a friend (the referrer). The friend themselves
// isn't emailed — only the owner alert + this thank-you to the referrer.
function referralConfirmationEmail(ref: Referral): Email {
  const first = esc((ref.referrer.name || "there").trim().split(" ")[0] || "there");
  const friend = ref.friend?.name ? esc(ref.friend.name.trim().split(" ")[0]) : "";
  const who = friend || "your friend";
  const body = `Thanks for spreading the word!\nWe've got your referral${friend ? ` for ${friend}` : ""} and a specialist will reach out to ${who} soon.\nWhen ${who} sells their car to ${esc(site.name)}, you'll earn $100 — we'll be in touch to get you paid.`;
  const codeBox = `<tr><td style="padding:0 28px;">
    <div style="background:#EAF5EF;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b63;font-weight:600;">Your referral code</div>
      <div style="font-size:24px;font-weight:800;color:#0f5132;margin-top:2px;letter-spacing:.02em;">${esc(ref.code)}</div>
      <div style="font-size:13px;color:#5b6b63;margin-top:4px;">Ask ${who} to mention this code so we know the referral came from you.</div>
    </div></td></tr>`;
  return {
    subject: `Thanks for referring ${friend || "a friend"} — ${site.name}`,
    html: shell(
      intro(`Thanks, ${first}!`, body) + codeBox + linkButton(site.url, "Visit DriveOffer") + ctaBox(),
      "You're receiving this because you referred a friend at driveoffer.ca.",
    ),
  };
}

// The customized offer the owner sends from Telegram (/offer -> /confirm). The
// number is whatever the owner decided; we present it and note it's confirmed
// at a quick, no-obligation inspection. Signed by the owner from site-config.
function offerEmail(lead: Lead, low: number, high: number): Email {
  const car = carLine(lead); // escaped, for HTML
  const plain = carPlain(lead);
  const priceText = low === high ? money(low) : `${money(low)} &ndash; ${money(high)}`;
  const leadIn = car
    ? `We looked at similar vehicles — here's your offer for your <strong>${car}</strong>:`
    : `We looked at similar vehicles — here's your offer:`;

  const offerBox = `<tr><td style="padding:0 28px;">
    <div style="background:#EAF5EF;border:1px solid #cfe6da;border-radius:12px;padding:20px 18px;margin-bottom:14px;text-align:center;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#5b6b63;font-weight:600;">Your offer</div>
      <div style="font-size:34px;font-weight:800;color:#0f5132;margin-top:6px;line-height:1.1;">${priceText}</div>
      <div style="font-size:13px;color:#5b6b63;margin-top:8px;">Based on the details you gave us — it'd only change if something about the car turns out different than described.</div>
    </div></td></tr>`;

  const questionsLine = `<tr><td style="padding:0 28px 6px;font-size:14px;line-height:1.55;color:#3a4654;">
    Questions? You can always reply to this email, or <a href="tel:${site.phoneE164}" style="color:#1A7F54;text-decoration:none;font-weight:600;">call or text us</a> — whatever's easiest.
  </td></tr>`;

  const noPressure = `<tr><td style="padding:2px 28px 4px;font-size:15px;line-height:1.6;color:#3a4654;">
    No pressure &mdash; once you see it, it's your call. If it's a yes, we come to you and pay on the spot.
  </td></tr>`;
  const signoff = `<tr><td style="padding:14px 28px 4px;font-size:16px;line-height:1.6;color:#3a4654;">
    Talk soon,<br/>
    <strong>The ${esc(site.name)} Team</strong><br/>
    <a href="tel:${site.phoneE164}" style="color:#1A7F54;text-decoration:none;">${esc(site.phoneDisplay)}</a> &middot; <a href="mailto:${esc(site.email)}" style="color:#1A7F54;text-decoration:none;">${esc(site.email)}</a>
  </td></tr>`;
  return {
    subject: plain ? `Your offer for your ${plain} — ${site.name}` : `Your offer is ready — ${site.name}`,
    html: shell(intro("Your offer is ready", leadIn) + offerBox + questionsLine + callFirstCta("fastest", bookingLink(lead), "Book online", "optional") + noPressure + signoff),
  };
}

// ---- Resend transport -----------------------------------------------------

/** POST one email (optionally scheduled). Returns its id, or "" on any failure. */
async function postEmail(to: string, email: Email, scheduledAt?: string): Promise<string> {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject: email.subject,
        html: email.html,
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[email] send failed:", res.status, await res.text().catch(() => ""));
      return "";
    }
    const data = (await res.json()) as { id?: string };
    return data.id || "";
  } catch (e) {
    console.error("[email] send error:", e);
    return "";
  }
}

/** Instant confirmation to the customer. Best-effort; no-op without a config/email. */
export async function sendLeadConfirmation(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = validEmail(lead);
  if (!to) return;
  await postEmail(to, confirmationEmail(lead));
}

/** Thank-you confirmation to the referrer. Best-effort; no-op without a config/email. */
export async function sendReferralConfirmation(ref: Referral): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = (ref.referrer.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  await postEmail(to, referralConfirmationEmail(ref));
}

/**
 * Send the owner's customized offer to a lead. Unlike the fire-and-forget
 * helpers above, this returns a result so the Telegram /confirm reply can tell
 * the owner exactly what happened. Not gated to "new" leads — the owner decides.
 */
export async function sendOfferEmail(
  lead: Lead,
  low: number,
  high: number,
): Promise<{ ok: boolean; reason?: string }> {
  if (!RESEND_API_KEY) return { ok: false, reason: "email isn't configured (RESEND_API_KEY missing)" };
  const to = validEmail(lead);
  if (!to) return { ok: false, reason: "this lead has no valid email address" };
  const id = await postEmail(to, offerEmail(lead, low, high));
  return id ? { ok: true } : { ok: false, reason: "the email provider rejected the send" };
}

// ---- Cron-driven cadence sends (best-effort; no-op without config/email) ----
// These are called by app/api/cron on a schedule the cron computes from lead
// timestamps. Each is gated and never throws, mirroring sendLeadConfirmation.

/** Post-offer follow-up to a lead who received an offer but hasn't replied. step 0=+1d, 1=+4d. */
export async function sendPostOfferFollowup(lead: Lead, step: number): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = validEmail(lead);
  if (!to) return;
  await postEmail(to, postOfferFollowupEmail(lead, step));
}

/** Day-10 extended nurture for a lead still in "new". */
export async function sendExtendedNurture(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = validEmail(lead);
  if (!to) return;
  await postEmail(to, extendedNurtureEmail(lead));
}

/** Day-21 win-back for a lead marked "lost". */
export async function sendWinback(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = validEmail(lead);
  if (!to) return;
  await postEmail(to, winbackEmail(lead));
}

/** Reminder to the customer before a booked inspection. */
export async function sendAppointmentReminder(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = validEmail(lead);
  if (!to) return;
  await postEmail(to, appointmentReminderEmail(lead));
}

/** One-time abandoned-cart recovery to a "partial" lead that left an email. */
export async function sendPartialRecovery(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = validEmail(lead);
  if (!to) return;
  await postEmail(to, partialRecoveryEmail(lead));
}

/** Reminder while awaiting the customer's info (cron, after /moreinfo or /ask). */
export async function sendAwaitingInfoReminder(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = validEmail(lead);
  if (!to) return;
  await postEmail(to, awaitingInfoReminderEmail(lead));
}

/** /moreinfo — email the customer the questions we need answered before quoting.
 * Returns a result so the Telegram reply can tell Samir what happened. */
export async function sendMoreInfo(lead: Lead, questions: string[]): Promise<{ ok: boolean; reason?: string }> {
  if (!RESEND_API_KEY) return { ok: false, reason: "email isn't configured (RESEND_API_KEY missing)" };
  const to = validEmail(lead);
  if (!to) return { ok: false, reason: "this lead has no valid email address" };
  const id = await postEmail(to, moreInfoEmail(lead, questions));
  return id ? { ok: true } : { ok: false, reason: "the email provider rejected the send" };
}

/** Confirmation after the customer self-books an inspection. */
export async function sendBookingConfirmation(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = validEmail(lead);
  if (!to) return;
  await postEmail(to, bookingConfirmationEmail(lead));
}

/** Morning-of inspection reminder with a confirm button (cron-driven). */
export async function sendBookingDayOf(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = validEmail(lead);
  if (!to) return;
  await postEmail(to, bookingDayOfEmail(lead));
}

/**
 * Schedule the 2 reminder follow-ups (Day 2 + Day 5) via Resend's scheduled send.
 * Returns the scheduled email ids (to cancel later). Best-effort; [] if unconfigured.
 */
export async function scheduleLeadDrip(lead: Lead): Promise<string[]> {
  if (!RESEND_API_KEY) return [];
  const to = validEmail(lead);
  if (!to) return [];
  const at1 = new Date(Date.now() + 2 * DAY).toISOString();
  const at2 = new Date(Date.now() + 5 * DAY).toISOString();
  const results = await Promise.allSettled([
    postEmail(to, drip1Email(lead), at1),
    postEmail(to, drip2Email(lead), at2),
  ]);
  return results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}

/** Cancel scheduled drip emails (when a lead leaves "new"). Best-effort; never throws. */
export async function cancelScheduledEmails(ids: string[]): Promise<void> {
  if (!RESEND_API_KEY || !ids?.length) return;
  await Promise.allSettled(
    ids.map((id) =>
      fetch(`${API}/${id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      }).catch(() => undefined),
    ),
  );
}
