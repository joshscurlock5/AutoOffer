import "server-only";
import type { Lead } from "./types";
import { site } from "./site-config";

// ===========================================================================
//  Instant lead-confirmation email (via Resend's REST API — no SDK, like notify).
//  Fires the moment a lead is captured, to the customer, so they stay warm while
//  they wait for the owner's call (speed-to-lead). Only sends when we actually
//  have an email address (phone-only call/text leads have none — SMS covers those).
//
//  - No-op until RESEND_API_KEY is set (safe to ship before Resend is configured).
//  - Never throws — the lead is already saved by the time this runs.
//  - Sending domain must be verified in Resend; EMAIL_FROM must be on that domain.
//    Replies go to the real inbox (site.email) via reply_to.
// ===========================================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || `${site.name} <hello@driveoffer.ca>`;
const REPLY_TO = process.env.EMAIL_REPLY_TO || site.email;

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function subjectFor(lead: Lead): string {
  if (lead.vehicle) {
    const v = lead.vehicle;
    return `We've got your ${v.year} ${v.make} ${v.model} — ${site.name}`;
  }
  return `Thanks for reaching out — ${site.name}`;
}

function buildHtml(lead: Lead): string {
  const c = lead.contact;
  const first = esc((c.name || "there").trim().split(" ")[0] || "there");
  const v = lead.vehicle;
  const method = c.contactMethod || "call";
  const reachVerb = method === "email" ? "email you" : method === "text" ? "text you" : "call you";
  const priced = !!(v && lead.estimate && !lead.estimate.unique);
  const carLine = v ? esc(`${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`) : "";

  const lead_intro = v
    ? `Thanks, ${first}! We've received your request for your <strong>${carLine}</strong>, and a member of our team will <strong>${reachVerb}</strong> shortly to confirm your firm offer.`
    : `Thanks, ${first}! We've received your message and a member of our team will be in touch shortly.`;

  const estimateBlock = priced
    ? `<tr><td style="padding:0 0 20px;">
         <div style="background:#EAF5EF;border-radius:12px;padding:16px 18px;">
           <div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b63;font-weight:600;">Your estimated range</div>
           <div style="font-size:24px;font-weight:800;color:#0f5132;margin-top:2px;">${money(lead.estimate!.low)} – ${money(lead.estimate!.high)}</div>
           <div style="font-size:13px;color:#5b6b63;margin-top:4px;">This is an estimate — we'll confirm your firm offer when we ${reachVerb}.</div>
         </div>
       </td></tr>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e9ec;">
        <tr><td style="background:#0e1c2b;padding:18px 28px;">
          <img src="https://www.driveoffer.ca/apple-touch-icon.png" width="34" height="34" alt="DriveOffer" style="display:inline-block;vertical-align:middle;border-radius:8px;" />
          <span style="font-size:20px;font-weight:800;color:#ffffff;vertical-align:middle;margin-left:10px;">Drive<span style="color:#4f7cf7;">Offer</span></span>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0e1c2b;font-weight:800;">You're all set, ${first} 🚗</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#3a4654;">${lead_intro}</p>
        </td></tr>
        <tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${estimateBlock}</table></td></tr>
        <tr><td style="padding:0 28px 8px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3a4654;">Prefer to skip the wait? Call or text us and we'll get your offer finalized right away.</p>
          <a href="tel:${site.phoneE164}" style="display:inline-block;background:#1A7F54;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 26px;border-radius:999px;">Call or text ${esc(site.phoneDisplay)}</a>
        </td></tr>
        <tr><td style="padding:24px 28px 28px;">
          <div style="border-top:1px solid #eceef1;padding-top:16px;font-size:13px;line-height:1.6;color:#7b8794;">
            AMVIC Licensed Wholesaler · We come to you · Paid the same visit.<br/>
            ${site.name} · <a href="tel:${site.phoneE164}" style="color:#1A7F54;text-decoration:none;">${esc(site.phoneDisplay)}</a> · ${esc(site.email)}<br/>
            You're receiving this because you requested an offer at driveoffer.ca.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Email the customer an instant confirmation. Best-effort; no-op when unconfigured
 * or when the lead has no email address. Never throws.
 */
export async function sendLeadConfirmation(lead: Lead): Promise<void> {
  if (!RESEND_API_KEY) return;
  const to = (lead.contact.email || "").trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject: subjectFor(lead),
        html: buildHtml(lead),
      }),
    });
    if (!res.ok) {
      console.error("[email] confirmation failed:", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[email] confirmation send failed:", e);
  }
}
