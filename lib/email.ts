import "server-only";
import type { Lead, Referral } from "./types";
import { site, amvicLicence, carsBoughtDisplay, amountPaidDisplay } from "./site-config";
import { makeUnsubToken } from "./unsubscribe";
// No cycle: store.ts imports only aws/types/sms — never this module.
import { atomicLeadEngagement } from "./store";

// ===========================================================================
//  Customer emails via Resend's REST API (no SDK, like notify.ts):
//   - sendLeadConfirmation: instant confirmation when a lead is captured.
//   - cron-driven cadence sends: post-offer + pre-offer nudges, win-back, etc.
//
//  All gated (no-op until RESEND_API_KEY is set), best-effort, never throw, and
//  only target leads with a valid email. PII-free chrome; replies go to the inbox.
// ===========================================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
// From name is a person, not a brand — "Sam at DriveOffer" reads as a human and
// lifts opens vs a faceless "DriveOffer". (If EMAIL_FROM is set in the environment
// it wins — update it there too, keeping the same @driveoffer.ca address for DKIM.)
const EMAIL_FROM = process.env.EMAIL_FROM || `${site.repName} at ${site.name} <hello@driveoffer.ca>`;

/** The display name a customer sees in the inbox "From" column — the part of
 * EMAIL_FROM before the <address>. Parsed (not hard-coded) so the admin inbox /
 * notification previews match whatever actually sends, env override included. */
export function fromDisplayName(): string {
  const m = EMAIL_FROM.match(/^\s*"?([^"<]*?)"?\s*(?:<|$)/);
  return (m?.[1] || "").trim() || site.name;
}
// Replies go to an address ON the sending domain so Resend Inbound (MX → the
// `email.received` webhook at /api/webhooks/resend) catches them and posts them
// straight into the customer's Replies topic — instant, and never lost to a Gmail
// delivery hiccup. site.email (the Gmail inbox) stays a live fallback: it's still
// shown in footers, and the Gmail poller (gmail-reply-to-telegram.gs) still relays
// anyone who mails it directly. Override with EMAIL_REPLY_TO if ever needed.
const REPLY_TO = process.env.EMAIL_REPLY_TO || "reply@driveoffer.ca";
const API = "https://api.resend.com/emails";

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
  if (lead.emailBounced) return ""; // hard-bounced (Resend webhook) — the address is dead, every send skips it
  const to = (lead.contact.email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ? to : "";
}
/** Address for a NURTURE/marketing send — additionally empty once the customer
 * complained (marked-as-spam ⇒ CASL opt-out, stamped by the Resend webhook).
 * Transactional sends (confirmations, offers they asked for, booking emails)
 * keep using validEmail. */
function nurtureEmail(lead: Lead): string {
  if (lead.emailOptOut) return "";
  return validEmail(lead);
}
function firstName(lead: Lead): string {
  return esc((lead.contact.name || "there").trim().split(" ")[0] || "there");
}
function carLine(lead: Lead): string {
  const v = lead.vehicle;
  return v ? esc(`${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`) : "";
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
function ctaBox(): string {
  return callCta("");
}

// Social-proof strip — mirrors the website's trust bar (components/WhySell.tsx):
// three stats, big number over a small uppercase label, hairline rules between,
// licence line centred beneath. Numbers come from site-config so the two surfaces
// can't drift.
//
// On every customer email EXCEPT the three personal ones (message / photo / referral
// thank-you): a 1:1 note from a rep shouldn't carry a marketing strip.
//
// Email-HTML constraints, do not "modernise" these away:
//  - <table>, not flex/grid — Outlook renders through Word's engine.
//  - Dividers are border-left on the cells; 1px spacer cells collapse in Outlook.
//  - Stars are stacked ABOVE the rating (not inline) so they can be a proper size
//    in a narrow phone column; cells are vertical-align:bottom so the three numbers
//    and labels line up across columns even though the middle one is taller.
//  - The Google "G" is text here, not the real multicolour logo — that logo is an
//    image (Gmail strips inline SVG), and this strip is image-free by design.
//  - Middle column is wider (star room). Verified no overflow at 375/320px.
function proofBox(): string {
  const cell = "padding:0 2px;text-align:center;vertical-align:bottom;";
  const num = "font-size:20px;line-height:1.15;font-weight:800;letter-spacing:-.025em;";
  const lbl =
    "font-size:8.5px;line-height:1.35;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#4B5563;padding-top:5px;";
  const rule = "border-left:1px solid #E2E8F0;";

  const stars = `<div style="color:#FBBF24;font-size:14px;line-height:1;letter-spacing:1px;padding-bottom:4px;">&#9733;&#9733;&#9733;&#9733;&#9733;</div>`;

  return `<tr><td style="padding:2px 28px 4px;">
    <div style="border-top:1px solid #eceef1;padding-top:18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;">
        <tr>
          <td width="30%" style="${cell}">
            <div style="${num}color:#0e1c2b;">${carsBoughtDisplay}</div>
            <div style="${lbl}">Cars purchased</div>
          </td>
          <td width="40%" style="${cell}${rule}">
            ${stars}
            <div style="${num}color:#0e1c2b;">${esc(site.googleRating)}</div>
            <div style="${lbl}">Google reviews</div>
          </td>
          <td width="30%" style="${cell}${rule}">
            <div style="${num}color:#0e1c2b;">${amountPaidDisplay}</div>
            <div style="${lbl}">Paid to sellers</div>
          </td>
        </tr>
      </table>
      ${
        amvicLicence
          ? `<div style="text-align:center;font-size:11.5px;line-height:1.5;color:#4B5563;padding-top:14px;">${amvicLicence}</div>`
          : ""
      }
    </div>
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
/** The primary "call or text" button — matches the confirmation email: a small
 * "⚡ Fastest · Call or text" eyebrow ABOVE, then a green button with the white
 * phone icon and the tappable number. Centred as a block. */
function callButtonB(): string {
  return `<div style="text-align:center;">
    <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin-bottom:10px;"><span style="color:#F59E0B;">&#9889;</span>&nbsp; Fastest &middot; Call or text</div>
    <a href="tel:${site.phoneE164}" style="display:inline-block;background:#1A7F54;color:#ffffff;text-decoration:none;font-size:20px;font-weight:800;letter-spacing:-.01em;padding:14px 30px;border-radius:12px;"><img src="${site.url}/email-icons/phone-white.png" width="18" height="18" alt="" style="vertical-align:middle;position:relative;top:-3px;margin-right:9px;border:0;" />${esc(site.phoneDisplay)}</a>
  </div>`;
}
/** A single "Call or text" button, as a full row. */
function callCta(_badge: string): string {
  return `<tr><td style="padding:6px 28px 14px;">${callButtonB()}</td></tr>`;
}
/** Call/text (primary) + a secondary action button (optionally badged), centred below. */
function callFirstCta(_callBadge: string, secondUrl: string, secondLabel: string, secondBadge: string): string {
  const second = secondUrl ? `<div style="text-align:center;margin-top:12px;">${pillButton(secondUrl, secondLabel, secondBadge, true)}</div>` : "";
  return `<tr><td style="padding:6px 28px 14px;">${callButtonB()}${second}</td></tr>`;
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
// footerHtml, when passed, replaces the ENTIRE default footer row (used by the
// confirmation email's reply-focused footer). Everything else — the header bar,
// the card chrome — stays identical across every email.
// The hidden preheader: the gray preview snippet a mail client shows in the inbox
// AFTER the subject. Without it, clients pull the first visible body text (our logo
// bar) into the preview — wasting a second selling line. First div = the text we
// want shown; second div = a run of zero-width spacers that eats the rest of the
// preview slot so no body text ("DriveOffer", "Hi Sarah…") leaks in behind it.
function preheaderBlock(text: string): string {
  if (!text) return "";
  const spacer = "&#847;&zwnj;&nbsp;".repeat(40);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f6f8;opacity:0;">${esc(text)}</div>
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f6f8;opacity:0;">${spacer}</div>`;
}

function shell(
  innerRows: string,
  footerNote = "You're receiving this because you requested an offer at driveoffer.ca.",
  footerHtml?: string,
  preheader = "",
): string {
  const footer =
    footerHtml ??
    `<tr><td style="padding:24px 28px 28px;">
          <div style="border-top:1px solid #eceef1;padding-top:16px;font-size:13px;line-height:1.6;color:#7b8794;">
            AMVIC Licensed Wholesaler &middot; We come to you &middot; Paid the same visit.<br/>
            ${site.name} &middot; <a href="tel:${site.phoneE164}" style="color:#1A7F54;text-decoration:none;">${esc(site.phoneDisplay)}</a> &middot; ${esc(site.email)}<br/>
            ${footerNote}
          </div>
        </td></tr>`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${preheaderBlock(preheader)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e9ec;">
        <tr><td style="background:#0e1c2b;padding:20px 28px;">
          <span style="font-size:20px;font-weight:800;color:#ffffff;">Drive<span style="color:#4f7cf7;">Offer</span></span>
        </td></tr>
        ${innerRows}
        ${footer}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ---- The three messages ---------------------------------------------------

// preheader = the hidden inbox-preview line (see preheaderBlock). Carried on the
// Email so the admin "unopened" previews can show it as its own field, not just
// bury it invisibly in the html. Every template must set it — keep it in sync
// with the text passed to shell().
type Email = { subject: string; html: string; preheader: string };

// Reply-focused footer — on EVERY email, so the customer always knows they can
// just reply to reach a real person. `headline` is tailored per email. Carries the
// one-click Unsubscribe (marketing opt-out) and a tiny Ref so a reply traces back
// to the lead. Pass lead=null for a non-lead email (the referral thank-you): it
// then omits the unsubscribe + Ref.
function replyFooter(lead: Lead | null, headline: string, withUnsub = false): string {
  const sid = lead ? esc(lead.id.split("-")[0]) : "";
  const unsub = withUnsub && lead ? `${site.url}/api/unsubscribe?token=${makeUnsubToken(lead.id)}` : "";
  return `<tr><td style="padding:26px 28px 30px;">
      <div style="border-top:1px solid #eceef1;padding-top:24px;text-align:center;">
        <div style="font-size:22px;line-height:1;color:#64748b;">&#9993;</div>
        <div style="font-size:16px;font-weight:700;color:#0e1c2b;margin-top:10px;">${headline}</div>
        <div style="font-size:13.5px;line-height:1.6;color:#7b8794;margin-top:8px;">A real ${esc(site.name)} specialist will respond personally.<br/>We typically reply within minutes during business hours.</div>
        ${unsub ? `<div style="font-size:12px;line-height:1.6;color:#9aa5b1;margin-top:16px;">Not interested anymore? <a href="${unsub}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a></div>` : ""}
        ${sid ? `<div style="font-size:10px;color:#cfd5dc;margin-top:12px;">Ref: ${sid}</div>` : ""}
      </div></td></tr>`;
}

function confirmationEmail(lead: Lead): Email {
  const v = lead.vehicle;
  const heading = v ? `We've got your ${carLine(lead)}` : "We've got your details";
  const head = `<tr><td style="padding:30px 28px 2px;"><h1 style="margin:0;font-size:24px;line-height:1.2;color:#0e1c2b;font-weight:800;letter-spacing:-.02em;">${heading}</h1></td></tr>`;
  const subline = `<tr><td style="padding:6px 28px 4px;font-size:16px;line-height:1.55;color:#5b6b7b;">Thanks for your request! A ${esc(site.name)} specialist will contact you soon with your offer.</td></tr>`;

  // "What happens next" — a 3-step card. Each step is a hosted icon (public/
  // email-icons/*.png, served from the site) in a soft circle, with a small
  // numbered badge in the top-left corner, over a title + description.
  //
  // The badge overlaps the corner via position:absolute inside a relative wrapper.
  // Clients that strip positioning (Gmail web) fall back gracefully: the badge is
  // FIRST in source, so it renders just above the icon instead — still legible.
  // alt="" keeps the layout clean when a client blocks images (the title carries
  // the meaning). Columns are table-layout:fixed so the three stay even.
  const step = (n: string, icon: string, title: string, desc: string, divider: boolean) => `
        <td width="33%" style="vertical-align:top;text-align:center;padding:0 6px;${divider ? "border-left:1px solid #e4e9ed;" : ""}">
          <div style="display:inline-block;position:relative;margin-bottom:12px;">
            <div style="position:absolute;top:-5px;left:-5px;width:20px;height:20px;border-radius:50%;background:#4B5563;border:2px solid #F5F7F9;text-align:center;">
              <span style="font-size:11px;font-weight:800;color:#ffffff;line-height:20px;">${n}</span>
            </div>
            <div style="width:46px;height:46px;line-height:46px;border-radius:50%;background:#ECEFF3;text-align:center;">
              <img src="${site.url}/email-icons/${icon}" width="26" height="26" alt="" style="vertical-align:middle;border:0;" />
            </div>
          </div>
          <div style="font-size:15px;font-weight:700;color:#0e1c2b;letter-spacing:-.01em;">${title}</div>
          <div style="font-size:12.5px;line-height:1.5;color:#5b6b7b;margin-top:5px;overflow-wrap:break-word;">${desc}</div>
        </td>`;
  const nextBox = `<tr><td style="padding:8px 28px 0;">
      <div style="background:#F5F7F9;border-radius:16px;padding:24px 20px;margin:16px 0 6px;">
        <div style="text-align:center;font-size:12px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#64748b;margin-bottom:22px;">What happens next</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;table-layout:fixed;">
          <tr>
            ${step("1", "phone.png", "We contact you", "A specialist will call, text, or email you shortly.", false)}
            ${step("2", "tag.png", "Get your offer", "A fair, no-obligation offer for your vehicle.", true)}
            ${step("3", "car.png", "We come to you", "We handle pickup, payment, and all the paperwork.", true)}
          </tr>
        </table>
      </div></td></tr>`;

  // Prominent "call now" card — the hero action. Outlined (not filled) so it sits
  // lighter than the steps card above it. The button is inline-block + centred so
  // it's proportionate rather than a full-width slab.
  const ctaCard = `<tr><td style="padding:12px 28px 6px;">
      <div style="border:1px solid #e4e9ed;border-radius:16px;padding:26px 20px;text-align:center;">
        <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b;"><span style="color:#F59E0B;">&#9889;</span>&nbsp; Fastest way to get your offer</div>
        <div style="font-size:26px;line-height:1.15;font-weight:800;color:#0e1c2b;margin-top:10px;letter-spacing:-.03em;">Get your offer in minutes.</div>
        <div style="font-size:15px;line-height:1.5;color:#5b6b7b;font-weight:600;margin-top:6px;">Talk to a real person now.</div>
        <a href="tel:${site.phoneE164}" style="display:inline-block;background:#1A7F54;color:#ffffff;text-decoration:none;font-size:20px;font-weight:800;letter-spacing:-.01em;padding:14px 30px;border-radius:12px;margin-top:16px;"><img src="${site.url}/email-icons/phone-white.png" width="18" height="18" alt="" style="vertical-align:middle;position:relative;top:-3px;margin-right:9px;border:0;" />${esc(site.phoneDisplay)}</a>
        <div style="font-size:13px;line-height:1.5;color:#8792a2;margin-top:13px;">Call or text anytime. We're here to help.</div>
      </div></td></tr>`;

  const pre = v
    ? `Your offer for your ${carPlain(lead)} is on the way — ${site.repName} will be in touch shortly.`
    : `Thanks for reaching out — ${site.repName} will be in touch shortly with your offer.`;
  return {
    subject: v ? `We've got your ${v.year} ${v.make} ${v.model} — ${site.name}` : `Thanks for reaching out — ${site.name}`,
    preheader: pre,
    html: shell(head + subline + nextBox + ctaCard + proofBox(), undefined, replyFooter(lead, "Questions? Just reply to this email."), pre),
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
  // Plain-text price (no HTML entity) for the inbox preheader.
  const pricePlain = lead.offer
    ? lead.offer.low === lead.offer.high
      ? money(lead.offer.low)
      : `${money(lead.offer.low)}–${money(lead.offer.high)}`
    : "your offer";
  const bodies = [
    `Just making sure our offer of <strong>${priceText}</strong> for your <strong>${car}</strong> reached you.`,
    `Your offer of <strong>${priceText}</strong> for your <strong>${car}</strong> still stands.\nUsed values shift week to week, so it's worth locking in this week's number.`,
    `Last note on your offer of <strong>${priceText}</strong> for your <strong>${car}</strong>.\nWhenever you're ready, just call, text, or reply and we'll come to you and pay on the spot.`,
  ];
  const subjects = [
    `Any questions about your ${plain} offer?`,
    `Your offer still stands — ${site.name}`,
    `Last reminder — your offer for ${plain}`,
  ];
  const headings = ["Your offer's ready", "Still good to go?", "Still here when you're ready"];
  const preheaders = [
    `Just checking our offer of ${pricePlain} for your ${plain} reached you.`,
    `Used values shift weekly — worth locking in ${pricePlain} for your ${plain} now.`,
    `Last note on your ${pricePlain} offer — we'll come to you and pay on the spot.`,
  ];
  const i = step <= 0 ? 0 : step >= 2 ? 2 : 1;
  return {
    subject: subjects[i],
    preheader: preheaders[i],
    html: shell(intro(headings[i], bodies[i]) + callCta("fastest") + proofBox(), undefined, replyFooter(lead, "To book a time or ask anything, just reply to this email.", true), preheaders[i]),
  };
}

// Sent by /moreinfo — the questions we need answered before quoting. Call/text first.
function moreInfoEmail(lead: Lead, questions: string[]): Email {
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your vehicle";
  const heading = v ? `We reviewed your ${esc(v.make)} ${esc(v.model)}` : "We reviewed your details";
  const body = `Thanks for the details so far! One of our specialists went over ${carRef}, and to put together an accurate offer we just need a couple more details:`;
  // A personal sign-off so it reads like a note from a real rep, not a blast.
  const signoff = `<tr><td style="padding:16px 28px 4px;font-size:16px;line-height:1.6;color:#3a4654;">
    Looking forward to getting you your offer.<br/><br/>
    Thanks,<br/>
    <strong>${esc(site.repName)}</strong><br/>
    <span style="font-size:14px;color:#5b6b7b;">Your ${esc(site.name)} Representative</span>
  </td></tr>`;
  const pre = v
    ? `Just a couple details and ${site.repName} can send your offer for your ${carPlain(lead)}.`
    : `Just a couple details and ${site.repName} can send your offer.`;
  return {
    subject: v ? `A couple quick questions about your ${v.make} ${v.model}` : `A couple quick questions — ${site.name}`,
    preheader: pre,
    html: shell(intro(heading, body) + questionsBox(questions) + callCta("fastest") + signoff + proofBox(), undefined, replyFooter(lead, "Easiest way to answer? Just reply to this email."), pre),
  };
}

// Pre-offer nudges while we're awaiting the customer's info (cron-driven, after
// /moreinfo or /ask): +2 / +5 / +10 days, mirroring the post-offer set. The ONLY
// reason we haven't quoted yet is these missing details, so EVERY step re-prints
// the exact questions we asked (questionsBox) — they may simply have missed the
// first email. Copy escalates gently across the three steps. step 0/1/2.
function awaitingInfoReminderEmail(lead: Lead, step = 0): Email {
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const plain = v ? `${v.make} ${v.model}` : "";
  const bodies = [
    `Just circling back on ${carRef} — we can get your offer out the moment we have a couple more details from you.`,
    `Your offer for ${carRef} is ready to go as soon as we hear back — we just need those last details.`,
    `Last check-in on ${carRef} — whenever you get a minute, send these over and we'll get your offer right out to you.`,
  ];
  const subjects = [
    plain ? `A couple details to finish your ${plain} offer` : `A couple details to finish your offer — ${site.name}`,
    plain ? `Still want your offer for your ${plain}?` : `Still want your offer? — ${site.name}`,
    plain ? `Last reminder — your ${plain} offer is ready` : `Last reminder — your offer is ready — ${site.name}`,
  ];
  const headings = ["Let's finish your offer", "Still want your offer?", "Still here when you're ready"];
  const carPre = plain ? `your ${plain}` : "your car";
  const preheaders = [
    `A couple details and your offer for ${carPre} is ready to go.`,
    `We're holding your offer for ${carPre} — just need those last details.`,
    `Last check-in — send the details and we'll get your ${plain || "car"} offer right out.`,
  ];
  const i = step <= 0 ? 0 : step >= 2 ? 2 : 1;
  return {
    subject: subjects[i],
    preheader: preheaders[i],
    html: shell(intro(headings[i], bodies[i]) + questionsBox(lead.infoQuestions || []) + callCta("fastest") + proofBox(), undefined, replyFooter(lead, "Got the details? Just reply to this email.", true), preheaders[i]),
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
  const pre = `${site.repName} comes by today at ${time} to inspect, confirm your offer, and pay you — tap to confirm.`;
  return {
    subject: `Today: your ${site.name} inspection at ${time}`,
    preheader: pre,
    html: shell(intro("See you today!", body) + confirmBtn + ctaBox() + proofBox(), undefined, replyFooter(lead, "Running late or need to reschedule? Just reply to this email."), pre),
  };
}

// Day-21 win-back — re-engages any still-open lead ~3 weeks after it came in (not
// just "lost" ones). Quote-agnostic wording, so it fits leads we never quoted too.
function winbackEmail(lead: Lead): Email {
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `We'd still love to make you an offer on ${carRef} — no obligation at all.\nUsed-car prices move week to week, so it may be worth more than you'd expect.\nAlready sold it? No worries — just ignore this.`;
  const pre = v
    ? `Prices move weekly — your ${carPlain(lead)} may be worth more than you think. No obligation.`
    : `Prices move weekly — your car may be worth more than you think. No obligation.`;
  return {
    subject: v ? `Still have your ${v.make} ${v.model}? We'd love to make an offer` : `Still selling your car? — ${site.name}`,
    preheader: pre,
    html: shell(intro("Still have your car?", body) + callFirstCta("fastest", `${site.url}/get-offer`, "Get an offer online &rarr;", "") + proofBox(), undefined, replyFooter(lead, "Want another look? Just reply to this email.", true), pre),
  };
}

// Sent to the person who refers a friend (the referrer). The friend themselves
// isn't emailed — only the owner alert + this thank-you to the referrer.
function referralConfirmationEmail(ref: Referral): Email {
  const first = esc((ref.referrer.name || "there").trim().split(" ")[0] || "there");
  const friend = ref.friend?.name ? esc(ref.friend.name.trim().split(" ")[0]) : "";
  const who = friend || "your friend";
  // Plain (un-escaped) friend name for the preheader, which esc()'s its own input.
  const whoPlain = (ref.friend?.name ? ref.friend.name.trim().split(" ")[0] : "") || "your friend";
  const body = `Thanks for spreading the word!\nWe've got your referral${friend ? ` for ${friend}` : ""} and a specialist will reach out to ${who} soon.\nWhen ${who} sells their car to ${esc(site.name)}, you'll earn $100 — we'll be in touch to get you paid, nothing more you need to do.`;
  // No pushy call button here — a referral isn't urgent. The footer just offers
  // both ways to reach us (reply or call) in case they have any questions.
  const contact = `Questions or concerns? Reply here, or call <a href="tel:${site.phoneE164}" style="color:#1A7F54;text-decoration:none;font-weight:700;">${esc(site.phoneDisplay)}</a>.`;
  const pre = `Your $100 referral reward is on the way once ${whoPlain} sells to ${site.name}.`;
  return {
    subject: `Thanks for referring ${friend || "a friend"} — ${site.name}`,
    preheader: pre,
    html: shell(
      intro(`Thanks, ${first}!`, body),
      undefined,
      replyFooter(null, contact),
      pre,
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

  const noPressure = `<tr><td style="padding:2px 28px 4px;">
    <div style="font-size:15px;line-height:1.6;color:#3a4654;">No pressure &mdash; once you see it, it's your call.</div>
    <div style="font-size:15px;line-height:1.6;color:#3a4654;margin-top:10px;">If it's a yes, we come to you and pay on the spot.</div>
  </td></tr>`;
  const signoff = `<tr><td style="padding:14px 28px 4px;font-size:16px;line-height:1.6;color:#3a4654;">
    Talk soon,<br/>
    <strong>${esc(site.repName)}</strong><br/>
    <span style="font-size:14px;color:#5b6b7b;">Your ${esc(site.name)} Representative</span>
  </td></tr>`;
  const pre = `No hassle, no headache. Selling with ${site.name} is easy 😊`;
  return {
    subject: plain ? `Your ${plain} offer is here!` : `Your offer is here! — ${site.name}`,
    preheader: pre,
    html: shell(intro("Your offer is here!", leadIn) + offerBox + callCta("fastest") + noPressure + signoff + proofBox(), undefined, replyFooter(lead, "To schedule or ask anything, just reply to this email."), pre),
  };
}

// A free-text message the owner sends from Telegram (/message) — for normal,
// day-to-day conversation that isn't a quote/offer. Framed as a note from the
// rep: greeting + a "New message" box holding whatever was typed, then the
// reply/call nudge. The customer can reply straight to this email (the
// Gmail->Telegram script routes their reply to the Replies channel).
function messageEmail(lead: Lead, message: string): Email {
  const first = firstName(lead);
  const paras = message
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 10px;font-size:16px;line-height:1.65;color:#1f2a36;">${esc(p)}</p>`)
    .join("");
  const head = `<tr><td style="padding:28px 28px 4px;">
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0e1c2b;font-weight:800;">Hi ${first},</h1>
    <p style="margin:0;font-size:16px;line-height:1.6;color:#3a4654;">You have a new message from ${esc(site.repName)}, your ${esc(site.name)} representative:</p>
  </td></tr>`;
  const box = `<tr><td style="padding:14px 28px 6px;">
    <div style="background:#f4f7fb;border:1px solid #dbe4ef;border-radius:12px;padding:16px 18px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5b6b63;font-weight:700;margin-bottom:9px;">New message</div>
      ${paras}
    </div></td></tr>`;
  // Sign-off under the message so it reads as a note from a real person.
  const signoff = `<tr><td style="padding:14px 28px 4px;font-size:16px;line-height:1.6;color:#3a4654;">
    Thank you,<br/>
    <strong>${esc(site.repName)}</strong><br/>
    <span style="font-size:14px;color:#5b6b7b;">Your ${esc(site.name)} Representative</span>
  </td></tr>`;
  // Subject leads with the customer's vehicle when we have it (specific + personal
  // beats generic for opens), signed by the rep by name; falls back to the rep-name
  // line when there's no vehicle on the lead.
  const plain = carPlain(lead);
  const subject = plain
    ? `About your ${plain} — a message from ${site.repName}`
    : `A message from ${site.repName}, your ${site.name} representative`;
  const pre = plain
    ? `${site.repName} has a quick note about your ${plain}.`
    : `${site.repName} sent you a quick message.`;
  return {
    subject,
    preheader: pre,
    html: shell(head + box + signoff + callCta("fastest"), undefined, replyFooter(lead, "Just reply to this email to get back to us."), pre),
  };
}

// ---- Condensed text previews for the Telegram confirm-before-send flow ----
// Plain-text renderings of the three owner-sent emails (offer / more-info /
// message), faithful to the real copy but skimmable on a phone. Shown in Telegram
// BEFORE the email goes out: first with a blank where the owner's input goes, then
// again with it filled in behind a ✅ Send / ✋ Cancel confirm. Kept next to the HTML
// templates above so the wording stays in sync.

const PREVIEW_DIVIDER = "──────────────";

/** Plain (un-escaped) "year make model trim" for the previews, or a fallback. */
function previewCar(lead: Lead): string {
  return carPlain(lead) || "your vehicle";
}
function previewTo(lead: Lead): string {
  return `To: ${lead.contact.name || "(no name)"} <${lead.contact.email || "(no email)"}>`;
}

/** The offer email as text. Pass low/high to fill the price; omit both for the blank draft. */
export function offerPreview(lead: Lead, low?: number, high?: number): string {
  const car = previewCar(lead);
  const plain = carPlain(lead);
  const priceText =
    low == null || high == null
      ? "______  (you'll fill this in)"
      : low === high
        ? money(low)
        : `${money(low)}–${money(high)}`;
  return [
    "📧 EMAIL PREVIEW · Offer",
    previewTo(lead),
    `Subject: ${plain ? `Your ${plain} offer is here!` : `Your offer is here! — ${site.name}`}`,
    `Preview: No hassle, no headache. Selling with ${site.name} is easy 😊`,
    PREVIEW_DIVIDER,
    "Your offer is here!",
    "",
    `We looked at similar vehicles — here's your offer for your ${car}:`,
    "",
    `   💰 Your offer:  ${priceText}`,
    "",
    "No pressure — once you see it, it's your call. If it's a yes, we come to you and pay on the spot.",
    "",
    "Talk soon,",
    site.repName,
    `Your ${site.name} Representative`,
    `${site.phoneDisplay} · ${site.email}`,
  ].join("\n");
}

/** The more-info email as text. Pass questions to fill them; omit for the blank draft. */
export function moreInfoPreview(lead: Lead, questions?: string[]): string {
  const car = previewCar(lead);
  const qBlock =
    questions && questions.length
      ? questions.map((q) => `   •  ${q}`).join("\n")
      : "   (your questions go here — one per line)";
  return [
    "📧 EMAIL PREVIEW · Ask for info",
    previewTo(lead),
    `Subject: A couple quick questions about your ${car}`,
    PREVIEW_DIVIDER,
    "Just need a couple details",
    "",
    `To get you an accurate offer on your ${car}, we just need a couple details. Fastest is a quick call or text; prefer email? Just reply with the answers.`,
    "",
    "What we still need:",
    qBlock,
    "",
    `📞 Call or text ${site.phoneDisplay}`,
  ].join("\n");
}

/** The free-text message email as text. Pass message to fill it; omit for the blank draft. */
export function messagePreview(lead: Lead, message?: string): string {
  const first = (lead.contact.name || "there").trim().split(" ")[0] || "there";
  const body = message && message.trim() ? message.trim() : "(your message goes here)";
  const plain = carPlain(lead);
  const subject = plain
    ? `About your ${plain} — a message from ${site.repName}`
    : `A message from ${site.repName}, your ${site.name} representative`;
  return [
    "📧 EMAIL PREVIEW · Message",
    previewTo(lead),
    `Subject: ${subject}`,
    PREVIEW_DIVIDER,
    `Hi ${first},`,
    "",
    `You have a new message from ${site.repName}, your ${site.name} representative:`,
    "",
    body,
    "",
    "Fastest response: just reply to this email, or call or text us anytime.",
  ].join("\n");
}

// ---- Resend transport -----------------------------------------------------

/** Resend tag values only allow ASCII letters, numbers, underscores, and dashes. */
function sanitizeTag(s: string): string {
  return (s || "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}
/** The two standard tags every send gets, for stage-level analytics in Resend
 * (kind = which template, plus the id it's about — "lead" for lead-keyed sends,
 * overridable via idName for sends keyed on something else, e.g. a referral). */
function emailTags(kind: string, id: string, idName = "lead"): { name: string; value: string }[] {
  return [
    { name: "kind", value: sanitizeTag(kind) },
    { name: idName, value: sanitizeTag(id) },
  ];
}
/** Small deterministic hash (FNV-1a) for turning free-text content (the /moreinfo
 * questions, a typed /message) into a short idempotency-key discriminator — not
 * security-sensitive, just stable so identical content dedupes and different
 * content still sends. */
function contentKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Log a successful lead-keyed send locally — the SEND side of the receipts
 * ledger. The Resend webhook stamps deliveries/opens/clicks onto the lead, but
 * until now nothing recorded that we SENT an email, so "delivery rate" had no
 * denominator and per-template stats were impossible. Called right after every
 * postEmail that returned a real id, with the same `kind` the Resend tags carry.
 *
 * AWAITED (but never throws): the Telegram/cron callers follow a send with
 * updateLead(), whose get→merge→put would clobber an in-flight append — so the
 * log must land BEFORE the send helper resolves. A DynamoDB hiccup while
 * bookkeeping still must never break the send that already succeeded.
 */
async function logEmailSent(leadId: string, kind: string): Promise<void> {
  const now = new Date().toISOString();
  await atomicLeadEngagement(leadId, {
    increment: { "emailEngagement.sentCount": 1 },
    set: { "emailEngagement.lastSentAt": now },
    appendCommsEvent: { at: now, channel: "email", type: "sent", kind },
  }).catch(() => {});
}

/** POST one email (optionally scheduled). Returns its id, or "" on any failure.
 * `opts.idempotencyKey` rides Resend's `Idempotency-Key` header (24h dedupe
 * window) so a cron retry or webhook double-fire can't double-send; `opts.tags`
 * are attached for stage-level analytics in the Resend dashboard. Both optional
 * and additive — a caller with nothing safe to key on just omits them. */
async function postEmail(
  to: string,
  email: Email,
  scheduledAt?: string,
  opts?: {
    idempotencyKey?: string;
    tags?: { name: string; value: string }[];
    // Resend attachments: { filename, content: base64 } — used to email a photo the
    // owner sent in a topic. Kept small (Resend caps total message size ~40MB).
    attachments?: { filename: string; content: string }[];
  },
): Promise<string> {
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" };
    if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    const res = await fetch(API, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject: email.subject,
        html: email.html,
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
        ...(opts?.tags?.length ? { tags: opts.tags } : {}),
        ...(opts?.attachments?.length ? { attachments: opts.attachments } : {}),
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
  const id = await postEmail(to, confirmationEmail(lead), undefined, {
    idempotencyKey: `confirmation:${lead.id}`,
    tags: emailTags("confirmation", lead.id),
  });
  if (id) await logEmailSent(lead.id, "confirmation");
}

/** Thank-you confirmation to the referrer. Best-effort; no-op without a config/email. */
export async function sendReferralConfirmation(ref: Referral): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = (ref.referrer.email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  await postEmail(to, referralConfirmationEmail(ref), undefined, {
    idempotencyKey: `referral_confirmation:${ref.id}`,
    tags: emailTags("referral_confirmation", ref.id, "ref"),
  });
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
  const id = await postEmail(to, offerEmail(lead, low, high), undefined, {
    // Discriminator includes the amount so a NEW price still sends even if a
    // prior offer at a different number already went out inside the 24h window.
    idempotencyKey: `offer:${lead.id}:${low}-${high}`,
    tags: emailTags("offer", lead.id),
  });
  if (id) await logEmailSent(lead.id, "offer");
  return id ? { ok: true } : { ok: false, reason: "the email provider rejected the send" };
}

// ---- Cron-driven cadence sends (best-effort; no-op without config/email) ----
// These are called by app/api/cron on a schedule the cron computes from lead
// timestamps. Each is gated and never throws, mirroring sendLeadConfirmation.

/** Post-offer follow-up to a lead who received an offer but hasn't replied. step 0=+1d, 1=+4d. */
export async function sendPostOfferFollowup(lead: Lead, step: number): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = nurtureEmail(lead);
  if (!to) return;
  const kind = `post_offer_followup_${step}`;
  const id = await postEmail(to, postOfferFollowupEmail(lead, step), undefined, {
    idempotencyKey: `${kind}:${lead.id}`,
    tags: emailTags(kind, lead.id),
  });
  if (id) await logEmailSent(lead.id, kind);
}

/** Day-21 win-back for a lead marked "lost". */
export async function sendWinback(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = nurtureEmail(lead);
  if (!to) return;
  const id = await postEmail(to, winbackEmail(lead), undefined, {
    idempotencyKey: `winback:${lead.id}`,
    tags: emailTags("winback", lead.id),
  });
  if (id) await logEmailSent(lead.id, "winback");
}

/** Pre-offer nudge while awaiting the customer's info (cron, after /moreinfo or /ask). step 0=+2d, 1=+5d, 2=+10d. */
export async function sendAwaitingInfoReminder(lead: Lead, step: number): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = nurtureEmail(lead);
  if (!to) return;
  const kind = `awaiting_info_reminder_${step}`;
  const id = await postEmail(to, awaitingInfoReminderEmail(lead, step), undefined, {
    idempotencyKey: `${kind}:${lead.id}`,
    tags: emailTags(kind, lead.id),
  });
  if (id) await logEmailSent(lead.id, kind);
}

/** /moreinfo — email the customer the questions we need answered before quoting.
 * Returns a result so the Telegram reply can tell Samir what happened. */
export async function sendMoreInfo(lead: Lead, questions: string[]): Promise<{ ok: boolean; reason?: string }> {
  if (!RESEND_API_KEY) return { ok: false, reason: "email isn't configured (RESEND_API_KEY missing)" };
  const to = validEmail(lead);
  if (!to) return { ok: false, reason: "this lead has no valid email address" };
  const id = await postEmail(to, moreInfoEmail(lead, questions), undefined, {
    // Discriminator is a hash of the questions — a webhook double-fire with the
    // SAME question set dedupes, but a genuinely different ask still sends.
    idempotencyKey: `more_info:${lead.id}:${contentKey(questions.join("|"))}`,
    tags: emailTags("more_info", lead.id),
  });
  if (id) await logEmailSent(lead.id, "more_info");
  return id ? { ok: true } : { ok: false, reason: "the email provider rejected the send" };
}

/** Send a free-text message email (Telegram /message) — direct rep-to-customer
 * communication. Uses validEmail (skips a dead/bounced or missing address) but
 * NOT the nurture gate, since a manual reply is transactional, not marketing.
 * Returns a result so the Telegram reply can report what happened. */
export async function sendMessageEmail(lead: Lead, message: string): Promise<{ ok: boolean; reason?: string }> {
  if (!RESEND_API_KEY) return { ok: false, reason: "email isn't configured (RESEND_API_KEY missing)" };
  const to = validEmail(lead);
  if (!to) return { ok: false, reason: "this lead has no valid email address" };
  const id = await postEmail(to, messageEmail(lead, message), undefined, {
    // Discriminator is a hash of the message text — a double-fire of the exact
    // same message dedupes, a genuinely different message still sends.
    idempotencyKey: `message:${lead.id}:${contentKey(message)}`,
    tags: emailTags("message", lead.id),
  });
  if (id) await logEmailSent(lead.id, "message");
  return id ? { ok: true } : { ok: false, reason: "the email provider rejected the send" };
}

/** Email a photo the owner sent in a customer's topic — the image goes as an
 * attachment, with the owner's caption (or a default) as the message body. Reuses the
 * /message email chrome. Transactional (validEmail, not the nurture gate). Best-effort;
 * returns a result so the Telegram relay can report what happened. */
export async function sendPhotoMessageEmail(
  lead: Lead,
  photo: { base64: string; filename: string; caption?: string; dedupeKey: string },
): Promise<{ ok: boolean; reason?: string }> {
  if (!RESEND_API_KEY) return { ok: false, reason: "email isn't configured (RESEND_API_KEY missing)" };
  const to = validEmail(lead);
  if (!to) return { ok: false, reason: "this lead has no valid email address" };
  const caption = (photo.caption || "").trim();
  const email = messageEmail(lead, caption || "Here's a photo for you — it's attached to this email.");
  const id = await postEmail(to, email, undefined, {
    // Key off the OWNER ACTION (the Telegram message id), not the image content: two
    // different photos have different ids so both go out, a redelivery of the same id
    // dedupes, and a deliberate re-send of the SAME image (a new id) actually delivers
    // instead of being silently deduped. (Redeliveries are also caught upstream by
    // claimRelayMessage; this is belt-and-suspenders.)
    idempotencyKey: `photo:${lead.id}:${photo.dedupeKey}`,
    tags: emailTags("photo", lead.id),
    attachments: [{ filename: photo.filename, content: photo.base64 }],
  });
  if (id) await logEmailSent(lead.id, "photo");
  return id ? { ok: true } : { ok: false, reason: "the email provider rejected the send" };
}

/** Morning-of inspection reminder with a confirm button (cron-driven). */
export async function sendBookingDayOf(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = validEmail(lead);
  if (!to) return;
  const id = await postEmail(to, bookingDayOfEmail(lead), undefined, {
    idempotencyKey: `booking_day_of:${lead.id}:${lead.appointmentAt || ""}`,
    tags: emailTags("booking_day_of", lead.id),
  });
  if (id) await logEmailSent(lead.id, "booking_day_of");
}

/** Cancel scheduled emails by id. Best-effort; never throws. */
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

// ---- Preview registry (admin "Emails" tab) --------------------------------
// Renders every customer-facing template against ONE realistic sample lead so
// the owner can see exactly what each email looks like, when it goes out, and
// who gets it — without ever emailing anyone. Lives here (not in the admin
// route) so it can call the private template functions directly: previews can
// never drift from the real sends because they ARE the real renderers.

export type EmailPreview = {
  /** Template key — matches the Resend `kind` tag / logEmailSent, so the tab
   * can join a preview card to its live stats. */
  kind: string;
  title: string;
  /** Journey grouping for the gallery: First contact / Sent by you / Automatic follow-ups / Booking. */
  group: string;
  /** Plain-English "when does this go out" line. */
  trigger: string;
  /** transactional = always sends (validEmail); nurture = respects emailOptOut (nurtureEmail). */
  audience: "transactional" | "nurture";
  subject: string;
  /** The inbox-preview snippet (hidden preheader) — shown as its own field in the
   * admin "unopened" previews, since it's invisible in the rendered html. */
  preheader: string;
  /** The "From" display name the customer sees (e.g. "Sam at DriveOffer"). Same
   * for every email, but carried per-preview so the inbox/notification mock is
   * self-contained. */
  fromName: string;
  html: string;
};

/** One believable lead every preview renders against — a real-looking Edmonton
 * seller with an offer, a booking, and open info questions, so EVERY template
 * has the data it wants (booking button, questions box, offer amount, …). */
const SAMPLE_LEAD: Lead = {
  id: "8f3a1c2b-4d21-4e6a-9c3f-1a2b3c4d5e6f",
  kind: "vehicle",
  createdAt: "2026-07-18T15:00:00.000Z",
  status: "new",
  contact: { name: "Sarah Mitchell", email: "sarah.mitchell@example.ca", phone: "780-555-0142" },
  vehicle: { year: 2019, make: "Honda", model: "Civic", trim: "EX", mileageKm: 96000 },
  offer: { low: 8500, high: 9000, sentAt: "2026-07-18T16:00:00.000Z" },
  appointmentAt: "2026-07-24T20:30:00.000Z", // 2:30 pm MT — renders in the day-of email
  appointmentLocation: "8923 137 Ave NW, Edmonton",
  bookingToken: "b7c9d1e3f5a7b9",
  infoQuestions: ["Are the tires the originals?", "Any accident history we should know about?"],
  photos: [],
  source: "website",
};

/** Matching referral fixture for the one non-lead template (the thank-you). */
const SAMPLE_REFERRAL: Referral = {
  id: "r-1",
  createdAt: "2026-07-18T15:00:00.000Z",
  status: "new",
  referrer: { name: "Sarah Mitchell", email: "sarah.mitchell@example.ca" },
  friend: { name: "Mike Chen" },
  code: "SARAH100",
};

/** Sample body for the free-text /message template — previews the chrome, not
 * any particular real message. */
const SAMPLE_MESSAGE =
  "Hi Sarah — just tried giving you a call about your Civic. Whenever you have a minute, give us a shout or reply here and we'll get everything sorted for you.";

/** Metadata for one email "reason for sending" — its display title + journey
 * group. `order` is the canonical top-to-bottom sort for the admin stats table
 * (the gallery re-buckets by group, so it uses this only for labels). */
export type EmailKindMeta = { kind: string; title: string; group: string; order: number };

/**
 * SINGLE SOURCE OF TRUTH for every email type the system sends — one row per
 * distinct "reason for sending", including each step of the multi-step
 * follow-ups (so "Info reminder · 1st / 2nd / last" are three separate things,
 * never collapsed to a generic "info reminder"). Both the gallery previews
 * below AND the admin email-stats table read their labels from this list, so
 * the two can never drift. Keep in customer-journey order.
 */
export const EMAIL_KINDS: EmailKindMeta[] = [
  { kind: "confirmation", title: "Lead confirmation", group: "First contact", order: 1 },
  { kind: "referral_confirmation", title: "Referral thank-you", group: "First contact", order: 2 },
  { kind: "offer", title: "Your offer", group: "Sent by you", order: 3 },
  { kind: "more_info", title: "Ask for details", group: "Sent by you", order: 4 },
  { kind: "message", title: "Message from you", group: "Sent by you", order: 5 },
  { kind: "photo", title: "Photo message", group: "Sent by you", order: 6 },
  { kind: "post_offer_followup_0", title: "Offer follow-up · 1st", group: "Automatic follow-ups", order: 7 },
  { kind: "post_offer_followup_1", title: "Offer follow-up · 2nd", group: "Automatic follow-ups", order: 8 },
  { kind: "post_offer_followup_2", title: "Offer follow-up · last", group: "Automatic follow-ups", order: 9 },
  { kind: "awaiting_info_reminder_0", title: "Info reminder · 1st", group: "Automatic follow-ups", order: 10 },
  { kind: "awaiting_info_reminder_1", title: "Info reminder · 2nd", group: "Automatic follow-ups", order: 11 },
  { kind: "awaiting_info_reminder_2", title: "Info reminder · last", group: "Automatic follow-ups", order: 12 },
  { kind: "winback", title: "Day-21 win-back", group: "Automatic follow-ups", order: 13 },
  { kind: "booking_day_of", title: "Day-of pickup reminder", group: "Booking", order: 14 },
];

const KIND_META = new Map(EMAIL_KINDS.map((m) => [m.kind, m]));

/**
 * Every email the system can send, rendered fresh with the fixtures above, in
 * customer-journey order. Server-side only (makeUnsubToken needs env — fine,
 * the admin API route is the only caller). Titles/groups come from EMAIL_KINDS
 * so a gallery card and its stats row always agree.
 */
export function renderAllEmailPreviews(): EmailPreview[] {
  const lead = SAMPLE_LEAD;
  const wrap = (
    kind: string,
    trigger: string,
    audience: "transactional" | "nurture",
    email: Email,
  ): EmailPreview => {
    const meta = KIND_META.get(kind);
    return { kind, title: meta?.title ?? kind, group: meta?.group ?? "Other", trigger, audience, subject: email.subject, preheader: email.preheader, fromName: fromDisplayName(), html: email.html };
  };

  return [
    // -- First contact ------------------------------------------------------
    wrap("confirmation", "Instantly when a lead submits the form", "transactional", confirmationEmail(lead)),
    // -- Sent by you (Telegram-driven, one at a time) ------------------------
    wrap("offer", "When you send /offer → ✅ from Telegram", "transactional", offerEmail(lead, 8500, 9000)),
    wrap("more_info", "When you ask for details via /moreinfo", "transactional", moreInfoEmail(lead, lead.infoQuestions || [])),
    wrap("message", "Free-text /message from Telegram", "transactional", messageEmail(lead, SAMPLE_MESSAGE)),
    wrap(
      "photo",
      "When you send a photo in a lead's Telegram topic — image rides as an attachment",
      "transactional",
      messageEmail(lead, "Here's a photo for you — it's attached to this email."),
    ),
    // -- Automatic follow-ups (cron-driven nurture) --------------------------
    wrap("post_offer_followup_0", "+2 days after an offer with no reply", "nurture", postOfferFollowupEmail(lead, 0)),
    wrap("post_offer_followup_1", "+5 days after an offer with no reply", "nurture", postOfferFollowupEmail(lead, 1)),
    wrap("post_offer_followup_2", "+10 days after an offer with no reply", "nurture", postOfferFollowupEmail(lead, 2)),
    wrap("awaiting_info_reminder_0", "+2 days waiting on requested details", "nurture", awaitingInfoReminderEmail(lead, 0)),
    wrap("awaiting_info_reminder_1", "+5 days waiting on requested details", "nurture", awaitingInfoReminderEmail(lead, 1)),
    wrap("awaiting_info_reminder_2", "+10 days waiting on requested details", "nurture", awaitingInfoReminderEmail(lead, 2)),
    // -- Booking -------------------------------------------------------------
    wrap("booking_day_of", "Morning of a booked pickup", "transactional", bookingDayOfEmail(lead)),
    // -- Late-journey nurture + referrals ------------------------------------
    wrap("winback", "Day 21, still-open leads", "nurture", winbackEmail(lead)),
    wrap("referral_confirmation", "When someone refers a friend", "transactional", referralConfirmationEmail(SAMPLE_REFERRAL)),
  ];
}
