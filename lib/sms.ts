import "server-only";
import type { Lead } from "./types";
import { site } from "./site-config";
import { formatEdmonton } from "./time";

/**
 * Outbound customer SMS via Twilio — the texting counterpart to lib/email.ts.
 *
 * Gated exactly like the Telegram bot in lib/notify.ts: a silent no-op until
 * TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM are ALL set, so it ships
 * dormant and only wakes once the number + A2P registration are live. Every send
 * is best-effort and NEVER throws — a failed text must never break the lead,
 * offer, or booking that triggered it (all already saved by the time we run).
 *
 * Eligibility (smsTo): any lead with a valid phone number that hasn't opted out.
 * CASL: the customer submitted a car-sale inquiry and gave their number (implied
 * consent for related messages), the contact form carries the consent + opt-out
 * notice, every message identifies DriveOffer, and STOP is honoured — auto by
 * Twilio on the long code, and recorded by app/api/sms for our own gating.
 *
 * IMPORTANT: callers must `await` these — Amplify's Lambda freezes the instant
 * the HTTP response returns, so a fire-and-forget send can die mid-flight.
 */

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM;

/** True only when every Twilio credential is present. */
export function smsConfigured(): boolean {
  return Boolean(SID && TOKEN && FROM);
}

/** Normalize a phone to E.164 for Canada/US (+1XXXXXXXXXX). null if not 10/11 digits. */
export function toE164(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

/** The number to text, or null: any lead with a valid phone that hasn't opted out. */
export function smsTo(lead: Lead): string | null {
  if (lead.smsOptOut) return null;
  return toE164(lead.contact.phone);
}

/** Low-level send. Best-effort: returns false (never throws) on any failure. */
async function send(to: string, body: string): Promise<boolean> {
  if (!smsConfigured()) return false;
  try {
    const auth = Buffer.from(`${SID}:${TOKEN}`).toString("base64");
    const params = new URLSearchParams({
      To: to,
      From: FROM as string,
      Body: body,
      // Delivery receipts land on the lead via this signed callback.
      StatusCallback: `${site.url}/api/sms/status`,
    });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error(`[sms] send ${r.status}: ${t.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[sms] send error:", e);
    return false;
  }
}

const CALL = site.phoneDisplay; // the line customers already know
const STOP = "Reply STOP to opt out.";

function car(lead: Lead): string {
  const v = lead.vehicle;
  return v ? `${v.year} ${v.make} ${v.model}` : "your car";
}

// ---- Per-event senders (best-effort; no-op without config / phone / opt-out) ----

/** Instant confirmation after a lead is captured. */
export async function smsLeadConfirmation(lead: Lead): Promise<void> {
  const to = smsTo(lead);
  if (!to) return;
  await send(
    to,
    `DriveOffer: Thanks! We've got your ${car(lead)} details and we're on it — we'll be in touch shortly with your offer. Questions? Call or text ${CALL}. ${STOP}`,
  );
}

/** The owner's custom offer is ready (fired alongside the /offer email). */
export async function smsOfferReady(lead: Lead, low: number, high: number): Promise<void> {
  const to = smsTo(lead);
  if (!to) return;
  const m = (n: number) => `$${n.toLocaleString("en-CA")}`;
  const range = low === high ? m(low) : `${m(low)}–${m(high)}`;
  await send(
    to,
    `DriveOffer: Good news — your offer for the ${car(lead)} is ready (${range}). Details + booking are in your email, or reply here / call ${CALL}. ${STOP}`,
  );
}

/** We need a detail before we can quote (fired alongside /moreinfo). */
export async function smsMoreInfo(lead: Lead): Promise<void> {
  const to = smsTo(lead);
  if (!to) return;
  await send(
    to,
    `DriveOffer: We just need one quick detail to finish your ${car(lead)} offer — check your email, or reply here / call ${CALL}. ${STOP}`,
  );
}

/** Post-offer follow-up nudge (+2 / +5 / +10 days). */
export async function smsPostOfferFollowup(lead: Lead): Promise<void> {
  const to = smsTo(lead);
  if (!to) return;
  await send(
    to,
    `DriveOffer: Still interested in selling your ${car(lead)}? Your offer's ready when you are — reply here or call/text ${CALL}. ${STOP}`,
  );
}

/** Awaiting-info reminder (+2 / +5 days after /moreinfo). */
export async function smsAwaitingInfo(lead: Lead): Promise<void> {
  const to = smsTo(lead);
  if (!to) return;
  await send(
    to,
    `DriveOffer: Just need a quick detail to finish your ${car(lead)} offer — reply here or call ${CALL} and we'll wrap it up. ${STOP}`,
  );
}

/** Day-21 win-back for a declined lead. */
export async function smsWinback(lead: Lead): Promise<void> {
  const to = smsTo(lead);
  if (!to) return;
  await send(
    to,
    `DriveOffer: Still have your ${car(lead)}? If you'd like a fresh offer, we're here — reply or call ${CALL}. ${STOP}`,
  );
}

/** One-time abandoned-cart nudge to a "partial" lead that left a number. */
export async function smsPartialRecovery(lead: Lead): Promise<void> {
  const to = smsTo(lead);
  if (!to) return;
  await send(
    to,
    `DriveOffer: You're almost done getting your car offer — reply here or call ${CALL} and we'll finish it for you. ${STOP}`,
  );
}

/** Confirmation after the customer self-books an inspection. */
export async function smsBookingConfirmation(lead: Lead): Promise<void> {
  const to = smsTo(lead);
  if (!to || !lead.appointmentAt) return;
  const when = formatEdmonton(lead.appointmentAt, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  await send(
    to,
    `DriveOffer: You're booked for ${when}. We come to you & pay on the spot. Need to change it? Reply here or call ${CALL}. ${STOP}`,
  );
}

/** Morning-of inspection reminder with a confirm nudge (cron-driven). */
export async function smsBookingDayOf(lead: Lead): Promise<void> {
  const to = smsTo(lead);
  if (!to || !lead.appointmentAt) return;
  const time = formatEdmonton(lead.appointmentAt, { hour: "numeric", minute: "2-digit" });
  await send(
    to,
    `DriveOffer: See you today at ${time} for your ${car(lead)}. Reply C to confirm, or call ${CALL} if anything changes. ${STOP}`,
  );
}
