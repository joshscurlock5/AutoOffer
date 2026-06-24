import "server-only";
import type { Lead } from "./types";
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

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
function estimateBox(lead: Lead): string {
  if (!(lead.vehicle && lead.estimate && !lead.estimate.unique)) return "";
  return `<tr><td style="padding:0 28px;">
    <div style="background:#EAF5EF;border-radius:12px;padding:16px 18px;margin-bottom:20px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b63;font-weight:600;">Your estimated range</div>
      <div style="font-size:24px;font-weight:800;color:#0f5132;margin-top:2px;">${money(lead.estimate.low)} &ndash; ${money(lead.estimate.high)}</div>
      <div style="font-size:13px;color:#5b6b63;margin-top:4px;">This is an estimate &mdash; we'll confirm your firm offer when we ${reachVerb(lead)}.</div>
    </div></td></tr>`;
}
function ctaBox(): string {
  return `<tr><td style="padding:0 28px 8px;">
    <a href="tel:${site.phoneE164}" style="display:inline-block;background:#1A7F54;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 26px;border-radius:999px;">Call or text ${esc(site.phoneDisplay)}</a>
  </td></tr>`;
}
function shell(innerRows: string): string {
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
            You're receiving this because you requested an offer at driveoffer.ca.
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
    ? `Thanks, ${first}! We've received your request for your <strong>${carLine(lead)}</strong>, and a member of our team will <strong>${reachVerb(lead)}</strong> shortly to confirm your firm offer.`
    : `Thanks, ${first}! We've received your message and a member of our team will be in touch shortly.`;
  return {
    subject: v ? `We've got your ${v.year} ${v.make} ${v.model} — ${site.name}` : `Thanks for reaching out — ${site.name}`,
    html: shell(intro(`You're all set, ${first}`, body) + estimateBox(lead) + ctaBox()),
  };
}

function drip1Email(lead: Lead): Email {
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your <strong>${carLine(lead)}</strong>` : "your car";
  const body = `Just checking in, ${first} — your offer for ${carRef} is still ready whenever you are. It only takes a couple of minutes on the phone to lock in your firm number.`;
  return {
    subject: v ? `Still want your offer for your ${v.make} ${v.model}?` : `Still here when you're ready — ${site.name}`,
    html: shell(intro(`Still thinking it over, ${first}?`, body) + estimateBox(lead) + ctaBox()),
  };
}

function drip2Email(lead: Lead): Email {
  const first = firstName(lead);
  const v = lead.vehicle;
  const carRef = v ? `your ${carLine(lead)}` : "your car";
  const body = `Last check-in, ${first} — we'd still love to buy ${carRef}. No pressure at all, but your offer is on the table whenever you want it. Just call or text and we'll take care of the rest.`;
  return {
    subject: `Your ${site.name} offer is still available`,
    html: shell(intro("Your offer's still on the table", body) + ctaBox()),
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
