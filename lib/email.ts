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
  return `<tr><td style="padding:28px 28px 8px;">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0e1c2b;font-weight:800;">${heading}</h1>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#3a4654;">${paragraphHtml}</p>
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
  const first = firstName(lead);
  const v = lead.vehicle;
  const body = v
    ? `Thanks, ${first}! We've got the details for your <strong>${carLine(lead)}</strong>. One of our specialists will <strong>${reachVerb(lead)}</strong> shortly with your offer.`
    : `Thanks, ${first}! We've received your message and a member of our team will be in touch shortly.`;
  return {
    subject: v ? `We've got your ${v.year} ${v.make} ${v.model} — ${site.name}` : `Thanks for reaching out — ${site.name}`,
    html: shell(intro(`You're all set, ${first}`, body) + nextStepsBox(lead) + ctaBox()),
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
  const first = firstName(lead);
  const car = carLine(lead) || "your car";
  const plain = carPlain(lead) || "your car";
  const priceText = lead.offer
    ? lead.offer.low === lead.offer.high
      ? money(lead.offer.low)
      : `${money(lead.offer.low)} &ndash; ${money(lead.offer.high)}`
    : "your offer";
  const bodies = [
    `Hi ${first} — just making sure our offer of <strong>${priceText}</strong> for your <strong>${car}</strong> reached you. The fastest way to lock it in is a quick call or text — we can often confirm on the spot. Ready to go? Book a time below and we'll come to you and pay on the spot.`,
    `Hi ${first} — your offer of <strong>${priceText}</strong> for your <strong>${car}</strong> still stands. Used values shift week to week, so it's worth locking in this week's number. Call or text for the quickest answer, or book your pickup below.`,
    `Hi ${first} — last note on your offer of <strong>${priceText}</strong> for your <strong>${car}</strong>. Whenever you're ready, call or text or pick a time below and we'll come to you and pay on the spot.`,
  ];
  const subjects = [
    `Any questions about your ${plain} offer?`,
    `Your offer still stands — ${site.name}`,
    `Last reminder — your offer for ${plain}`,
  ];
  const headings = [`Your offer's ready, ${first}`, "Still good to go?", "Still here when you're ready"];
  const i = step <= 0 ? 0 : step >= 2 ? 2 : 1;
  return {
    subject: subjects[i],
    html: shell(intro(headings[i], bodies[i]) + bookingBox(lead) + ctaBox() + proofBox()),
  };
}

// Sent by /moreinfo — we need a bit more detail before quoting. Call/text first.
function moreInfoEmail(lead: Lead): Email {
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your vehicle";
  const body = `Hi ${first} — thanks for sending over ${carRef}! To get you an accurate offer, we just need a couple more details about the car. The fastest and easiest way is to <strong>call or text us</strong> — we can usually finish your offer right then. Prefer email? No problem — just reply to this message and we'll take it from there.`;
  return {
    subject: v ? `A couple quick questions about your ${v.make} ${v.model}` : `A couple quick questions — ${site.name}`,
    html: shell(intro(`Almost there, ${first}`, body) + ctaBox() + proofBox()),
  };
}

// Sent by /ask — a specific question about the vehicle. Call/text first.
function askEmail(lead: Lead, question: string): Email {
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your vehicle";
  const q = esc(question);
  const body = `Hi ${first} — quick question about ${carRef} so we can finalize your offer:<br/><br/><strong>${q}</strong><br/><br/>The fastest way to answer is a quick <strong>call or text</strong> — we can often wrap up your offer on the spot. Or just reply to this email, whatever's easiest.`;
  return {
    subject: v ? `Quick question about your ${v.make} ${v.model}` : `Quick question about your vehicle — ${site.name}`,
    html: shell(intro(`One quick thing, ${first}`, body) + ctaBox() + proofBox()),
  };
}

// Cron reminder while we're awaiting the customer's info (after /moreinfo or /ask).
function awaitingInfoReminderEmail(lead: Lead): Email {
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `Hi ${first} — we're ready to send your offer on ${carRef} as soon as we get the last detail or two. The fastest way is a quick <strong>call or text</strong> — we can often sort it out and give you a number on the spot. Prefer email? Just reply and we'll take it from there.`;
  return {
    subject: v ? `Still want your offer for your ${v.make} ${v.model}?` : `Still want your offer? — ${site.name}`,
    html: shell(intro(`Let's finish your offer, ${first}`, body) + ctaBox() + proofBox()),
  };
}

// Confirmation after the customer self-books an inspection.
function bookingConfirmationEmail(lead: Lead): Email {
  const first = firstName(lead);
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
  const body = `You're booked, ${first}! A ${esc(site.name)} rep will come to ${carRef} at the time and place below, confirm your offer on the spot, and — if it's a yes — pay you right there (e-transfer or bank draft). Need to change it? Just call or text.`;
  return {
    subject: `Booked — your ${site.name} inspection`,
    html: shell(intro("You're booked!", body) + detailBox + ctaBox() + proofBox()),
  };
}

// Morning-of reminder with a one-tap "Confirm I'll be there" button.
function bookingDayOfEmail(lead: Lead): Email {
  const first = firstName(lead);
  const time = lead.appointmentAt
    ? new Date(lead.appointmentAt).toLocaleString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" })
    : "today";
  const where = lead.appointmentLocation ? esc(lead.appointmentLocation) : "your address";
  const confirmBtn = lead.bookingToken
    ? `<tr><td style="padding:0 28px 8px;">
        <a href="${site.url}/api/book/confirm?token=${lead.bookingToken}" style="display:inline-block;background:#1A7F54;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 26px;border-radius:999px;">&#10003; Confirm I'll be there</a>
      </td></tr>`
    : "";
  const body = `Hi ${first} — quick reminder that a ${esc(site.name)} rep is coming by <strong>today at ${time}</strong> (&#128205; ${where}) to inspect your car, confirm your offer, and pay you on the spot if it's a yes. Tap below to confirm you'll be there — or call/text us if anything's changed.`;
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
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `Hi ${first} — still have ${carRef}? Prices have moved since we last talked, and we'd be glad to take another look and re-quote — no obligation at all. If you've already sold it, no worries; just ignore this.`;
  return {
    subject: v ? `Still have your ${v.make} ${v.model}? Happy to re-quote` : `Happy to re-quote — ${site.name}`,
    html: shell(intro(`Want a fresh offer, ${first}?`, body) + ctaBox() + proofBox()),
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
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `Hi ${first} — looks like you started getting an offer for ${carRef} but didn't finish. Want us to pick it up? It takes about a minute — reply, call, or text and we'll get you a firm, no-obligation number. We come to you and pay on the spot.`;
  return {
    subject: v ? `Finish your offer for your ${v.make} ${v.model}?` : `Want us to finish your offer? — ${site.name}`,
    html: shell(intro(`Your offer's almost ready, ${first}`, body) + ctaBox() + proofBox()),
  };
}

// Sent to the person who refers a friend (the referrer). The friend themselves
// isn't emailed — only the owner alert + this thank-you to the referrer.
function referralConfirmationEmail(ref: Referral): Email {
  const first = esc((ref.referrer.name || "there").trim().split(" ")[0] || "there");
  const friend = ref.friend?.name ? esc(ref.friend.name.trim().split(" ")[0]) : "";
  const who = friend || "your friend";
  const body = `Thanks for spreading the word, ${first}! We've got your referral${friend ? ` for ${friend}` : ""} and a specialist will reach out to ${who} soon. When ${who} sells their car to ${esc(site.name)}, you'll earn $100 — we'll be in touch to get you paid.`;
  const codeBox = `<tr><td style="padding:0 28px;">
    <div style="background:#EAF5EF;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b63;font-weight:600;">Your referral code</div>
      <div style="font-size:24px;font-weight:800;color:#0f5132;margin-top:2px;letter-spacing:.02em;">${esc(ref.code)}</div>
      <div style="font-size:13px;color:#5b6b63;margin-top:4px;">Ask ${who} to mention this code so we know the referral came from you.</div>
    </div></td></tr>`;
  return {
    subject: `Thanks for referring ${friend || "a friend"} — ${site.name}`,
    html: shell(
      intro(`Thanks, ${first}!`, body) + codeBox + ctaBox(),
      "You're receiving this because you referred a friend at driveoffer.ca.",
    ),
  };
}

// The customized offer the owner sends from Telegram (/offer -> /confirm). The
// number is whatever the owner decided; we present it and note it's confirmed
// at a quick, no-obligation inspection. Signed by the owner from site-config.
function offerEmail(lead: Lead, low: number, high: number): Email {
  const first = firstName(lead);
  const car = carLine(lead); // escaped, for HTML
  const priceText = low === high ? money(low) : `${money(low)} &ndash; ${money(high)}`;
  const leadIn = car
    ? `Thanks for sending over your <strong>${car}</strong>. Based on the basics, here's our range:`
    : `Thanks for the details on your vehicle. Based on the basics, here's our range:`;

  const rangeBox = `<tr><td style="padding:0 28px;">
    <div style="background:#EAF5EF;border:1px solid #cfe6da;border-radius:12px;padding:20px 18px;margin-bottom:18px;text-align:center;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#5b6b63;font-weight:600;">Your offer range</div>
      <div style="font-size:32px;font-weight:800;color:#0f5132;margin-top:6px;line-height:1.1;">${priceText}</div>
      <div style="font-size:13px;color:#5b6b63;margin-top:8px;">A quick estimate from the details so far.</div>
    </div></td></tr>`;

  const phone = `<a href="tel:${site.phoneE164}" style="color:#1A7F54;text-decoration:none;font-weight:700;">${esc(site.phoneDisplay)}</a>`;
  const actionBox = `<tr><td style="padding:0 28px;">
    <div style="background:#f3f6f8;border:1px solid #e4e9ed;border-radius:12px;padding:18px;margin-bottom:18px;">
      <div style="font-size:15px;line-height:1.5;color:#3a4654;margin-bottom:12px;">Want your exact, firm number? Just reach out and we'll lock it in:</div>
      <div style="font-size:15px;font-weight:700;color:#1f2a36;margin-bottom:3px;">${ICON_FAST} Fastest &mdash; text or call</div>
      <div style="font-size:15px;line-height:1.55;color:#3a4654;margin:0 0 14px;padding-left:22px;">Reach us at ${phone} and we'll send your exact offer back in minutes.</div>
      <div style="font-size:15px;font-weight:700;color:#1f2a36;margin-bottom:3px;">${ICON_MAIL} Not a phone person?</div>
      <div style="font-size:15px;line-height:1.55;color:#3a4654;margin:0;padding-left:22px;">Just reply to this email and you'll have it within the hour.</div>
    </div></td></tr>`;

  const noPressure = `<tr><td style="padding:0 28px 4px;font-size:15px;line-height:1.6;color:#3a4654;">
    No pressure &mdash; once you see it, it's your call. If it's a yes, we come to you and pay on the spot.
  </td></tr>`;
  const signoff = `<tr><td style="padding:14px 28px 4px;font-size:16px;line-height:1.6;color:#3a4654;">
    Talk soon,<br/>
    <strong>The ${esc(site.name)} Team</strong><br/>
    <a href="tel:${site.phoneE164}" style="color:#1A7F54;text-decoration:none;">${esc(site.phoneDisplay)}</a> &middot; <a href="mailto:${esc(site.email)}" style="color:#1A7F54;text-decoration:none;">${esc(site.email)}</a>
  </td></tr>`;
  return {
    subject: carPlain(lead) ? `Your offer range for your ${carPlain(lead)} — ${site.name}` : `Your offer range is ready — ${site.name}`,
    html: shell(intro(`Your offer range is ready, ${first}`, leadIn) + rangeBox + actionBox + bookingBox(lead) + noPressure + signoff),
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

/** /moreinfo — email the customer that we need a bit more detail. Returns a result
 * so the Telegram reply can tell Samir what happened (mirrors sendOfferEmail). */
export async function sendMoreInfo(lead: Lead): Promise<{ ok: boolean; reason?: string }> {
  if (!RESEND_API_KEY) return { ok: false, reason: "email isn't configured (RESEND_API_KEY missing)" };
  const to = validEmail(lead);
  if (!to) return { ok: false, reason: "this lead has no valid email address" };
  const id = await postEmail(to, moreInfoEmail(lead));
  return id ? { ok: true } : { ok: false, reason: "the email provider rejected the send" };
}

/** /ask <question> — email the customer a specific question. Returns a result. */
export async function sendAsk(lead: Lead, question: string): Promise<{ ok: boolean; reason?: string }> {
  if (!RESEND_API_KEY) return { ok: false, reason: "email isn't configured (RESEND_API_KEY missing)" };
  const to = validEmail(lead);
  if (!to) return { ok: false, reason: "this lead has no valid email address" };
  const id = await postEmail(to, askEmail(lead, question));
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
