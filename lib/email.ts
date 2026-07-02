import "server-only";
import type { Lead, Referral } from "./types";
import { site } from "./site-config";

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
  const body = `Just checking in, ${first} — we'd still love to make you an offer on ${carRef}. It only takes a couple of minutes: call or text and a specialist will get you your offer.`;
  return {
    subject: v ? `Still want an offer for your ${v.make} ${v.model}?` : `Still here when you're ready — ${site.name}`,
    html: shell(intro(`Still thinking it over, ${first}?`, body) + nextStepsBox(lead) + ctaBox()),
  };
}

function drip2Email(lead: Lead): Email {
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `Last check-in, ${first} — we'd still love to buy ${carRef}. No pressure at all. Whenever you're ready, just call or text and a specialist will sort out your offer and handle the rest.`;
  return {
    subject: `Ready when you are — ${site.name}`,
    html: shell(intro("Still here when you're ready", body) + ctaBox()),
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
    html: shell(intro(`Your offer range is ready, ${first}`, leadIn) + rangeBox + actionBox + noPressure + signoff),
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
