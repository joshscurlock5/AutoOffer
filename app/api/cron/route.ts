import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLead } from "@/lib/store";
import { notifyOwner, leadLine } from "@/lib/notify";
import { resolveGeo } from "@/lib/geo";
import {
  sendPostOfferFollowup,
  sendAwaitingInfoReminder,
  sendWinback,
  sendBookingDayOf,
  sendPartialRecovery,
} from "@/lib/email";
import {
  smsPostOfferFollowup,
  smsAwaitingInfo,
  smsWinback,
  smsBookingDayOf,
  smsPartialRecovery,
  smsConfigured,
} from "@/lib/sms";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ===========================================================================
//  Scheduled worker — the ONE cron behind the whole ops/cadence layer.
//  Triggered hourly by an AWS EventBridge Scheduler rule (POST or GET) with an
//  `Authorization: Bearer ${CRON_SECRET}` header. It scans all leads and fires
//  any work that is DUE based on timestamps — idempotent, so re-running never
//  double-messages. Every send is best-effort (notifyOwner never throws).
//
//  P0 branch (live): escalating stale-lead SLA alerts for unworked "new" leads.
//  P1/P2 branches (post-offer follow-ups, daily digest, appointment reminders,
//  win-back, weekly scoreboard) slot into the same per-lead loop / run tail.
// ===========================================================================

const CRON_SECRET = process.env.CRON_SECRET || "";

// Stale-lead SLA tiers for a status:"new" lead that hasn't been worked yet.
// Hourly cron => a tier fires on the first run after its age threshold is crossed.
const STALE_TIERS_MS = [30 * 60_000, 2 * 3_600_000, 12 * 3_600_000]; // ~30m, ~2h, ~12h
const STALE_LABELS = ["~30 min", "~2 hours", "12+ hours"];
const DAY = 86_400_000;

/** Authorize the caller. Fail closed: if CRON_SECRET isn't configured, no-op (401). */
function authorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${CRON_SECRET}`;
}

async function runCron(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const nowISO = new Date(now).toISOString();
  const summary = {
    scanned: 0,
    staleAlerts: 0,
    postOffer: 0,
    awaitingInfo: 0,
    winback: 0,
    apptReminders: 0,
    dayOfReminders: 0,
    partialRecovery: 0,
    geoResolved: 0,
    digestSent: false,
    scoreboardSent: false,
  };

  // Business-local (Mountain Time) helpers for the daily digest + "today" checks.
  const mtHour = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", hour: "2-digit", hour12: false }).format(new Date(now)),
  );
  const mtDate = (ms: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const todayMT = mtDate(now);
  const digestNew: Lead[] = [];
  const digestStalled: Lead[] = [];
  const digestInspections: Lead[] = [];

  let leads: Lead[];
  try {
    leads = await getLeads();
  } catch (e) {
    console.error("[cron] getLeads failed", e);
    return NextResponse.json({ ok: false, error: "scan failed" }, { status: 500 });
  }
  // Soft-deleted leads get no nurture, no geo, and don't count in the digest.
  leads = leads.filter((l) => !l.archived);
  summary.scanned = leads.length;

  // Contacts that already have a REAL (submitted) lead — so an abandoned-cart
  // "partial" that later converted never gets a recovery nudge.
  const realContacts = new Set<string>();
  for (const l of leads) {
    if (l.status !== "partial") {
      if (l.contact.email) realContacts.add("e:" + l.contact.email.toLowerCase());
      if (l.contact.phone) realContacts.add("p:" + l.contact.phone.replace(/\D/g, ""));
    }
  }

  const GEO_CAP = 25; // cap geo lookups per run (free API courtesy)
  let geoAttempts = 0;

  for (const lead of leads) {
    try {
      // --- Backfill coarse geolocation from the stored IP (best-effort, capped).
      //     Keeps geo off the lead-submit path; new + historical leads fill in here.
      //     Also re-resolves OLD-shape geos captured before the richer fields
      //     (postal/timezone/isp/asn) were added, so existing leads upgrade in place. ---
      const needsGeo = !lead.geo || (!lead.geo.timezone && !lead.geo.postal);
      if (geoAttempts < GEO_CAP && lead.meta?.clientIp && needsGeo) {
        geoAttempts += 1;
        const g = await resolveGeo(lead.meta.clientIp);
        if (g) {
          await updateLead(lead.id, { geo: g });
          summary.geoResolved += 1;
        }
      }

      // --- Stale-lead SLA alerts: unworked "new" leads, escalating + de-duped ---
      if (lead.status === "new" && lead.createdAt) {
        const age = now - new Date(lead.createdAt).getTime();
        const dueTier = STALE_TIERS_MS.filter((t) => age >= t).length; // 0..3
        const sent = lead.staleNudges ?? 0;
        if (dueTier > sent) {
          const label = STALE_LABELS[dueTier - 1] || `${Math.round(age / 3_600_000)}h`;
          const sid = lead.id.split("-")[0];
          await notifyOwner(
            `⏰ Still NEW after ${label} — reach out now:\n${leadLine(lead)}\nSend offer → /offer ${sid} 8500-9000`,
          );
          await updateLead(lead.id, {
            staleNudges: dueTier,
            lastNudgedAt: new Date(now).toISOString(),
          });
          summary.staleAlerts += 1;
        }
      }

      // --- Customer nurture (cron-driven, email-gated; keyed on nurtureStage) ---
      const created = lead.createdAt ? new Date(lead.createdAt).getTime() : 0;
      const lastNurture = lead.lastNurtureAt ? new Date(lead.lastNurtureAt).getTime() : 0;
      if (lead.nurtureStage === "offer_sent" && lead.offerSentAt && lead.status === "contacted") {
        // (A) Offer reminders after the offer was sent: +2 / +5 / +10 days.
        const base = new Date(lead.offerSentAt).getTime();
        const dues = [base + 2 * DAY, base + 5 * DAY, base + 10 * DAY];
        for (let i = 0; i < dues.length; i += 1) {
          if (now >= dues[i] && lastNurture < dues[i]) {
            await sendPostOfferFollowup(lead, i);
            await smsPostOfferFollowup(lead);
            await updateLead(lead.id, { lastNurtureAt: nowISO });
            summary.postOffer += 1;
            break;
          }
        }
      } else if (lead.nurtureStage === "awaiting_info" && lead.moreInfoSentAt && lead.status === "contacted") {
        // (D) Awaiting-info reminders after /moreinfo or /ask: +2 / +5 days.
        const base = new Date(lead.moreInfoSentAt).getTime();
        const dues = [base + 2 * DAY, base + 5 * DAY];
        for (let i = 0; i < dues.length; i += 1) {
          if (now >= dues[i] && lastNurture < dues[i]) {
            await sendAwaitingInfoReminder(lead);
            await smsAwaitingInfo(lead);
            await updateLead(lead.id, { lastNurtureAt: nowISO });
            summary.awaitingInfo += 1;
            break;
          }
        }
      } else if (lead.status === "lost" && lead.nurtureStage !== "winback_sent" && created) {
        // (B) Day-21 win-back for a declined lead, once.
        const due = created + 21 * DAY;
        if (now >= due) {
          await sendWinback(lead);
          await smsWinback(lead);
          await updateLead(lead.id, { nurtureStage: "winback_sent", lastNurtureAt: nowISO });
          summary.winback += 1;
        }
      }

      // --- Appointment: day-of customer reminder (morning, with confirm) + T-2h owner ping ---
      if (lead.status === "scheduled" && lead.appointmentAt) {
        const apptMs = new Date(lead.appointmentAt).getTime();
        // Day-of morning reminder to the customer (with the "Confirm" button), once.
        if (!lead.dayOfRemindedAt && mtHour >= 7 && mtDate(apptMs) === todayMT) {
          await sendBookingDayOf(lead);
          await smsBookingDayOf(lead);
          await updateLead(lead.id, { dayOfRemindedAt: nowISO });
          summary.dayOfReminders += 1;
        }
        // T-2h owner heads-up (owner-only — the customer already got the morning email), once.
        if (!lead.apptRemindedAt && apptMs - now <= 2 * 3_600_000 && apptMs - now > -30 * 60_000) {
          const when = new Date(apptMs).toLocaleString("en-CA", {
            timeZone: "America/Edmonton",
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          });
          const loc = lead.appointmentLocation ? `\n📍 ${lead.appointmentLocation}` : "";
          const confirmed = lead.appointmentConfirmedAt ? " ✅ confirmed" : "";
          await notifyOwner(`📅 Inspection soon (${when})${confirmed} — ${leadLine(lead)}${loc}`, "bookings");
          await updateLead(lead.id, { apptRemindedAt: nowISO });
          summary.apptReminders += 1;
        }
      }

      // --- Abandoned-cart recovery: one nudge to a "partial" lead (>1h old) ---
      if (lead.status === "partial" && lead.nurtureStage !== "partial_done" && created && now - created >= 3_600_000) {
        const eKey = lead.contact.email ? "e:" + lead.contact.email.toLowerCase() : "";
        const pKey = lead.contact.phone ? "p:" + lead.contact.phone.replace(/\D/g, "") : "";
        if ((eKey && realContacts.has(eKey)) || (pKey && realContacts.has(pKey))) {
          // They converted after all — mark done, never nudge.
          await updateLead(lead.id, { nurtureStage: "partial_done" });
        } else {
          if (lead.contact.email) {
            await sendPartialRecovery(lead);
          }
          if (lead.contact.phone) {
            if (smsConfigured()) {
              await smsPartialRecovery(lead);
            } else if (!lead.contact.email) {
              // No SMS yet and no email — fall back to the owner ping (unchanged behavior).
              await notifyOwner(`🛒 Abandoned offer — reach out:\n${leadLine(lead)}`);
            }
          }
          await updateLead(lead.id, { nurtureStage: "partial_done", lastNurtureAt: nowISO });
          summary.partialRecovery += 1;
        }
      }

      // --- Collect data for the daily "needs action" digest ---
      if (lead.status === "new") digestNew.push(lead);
      if (lead.status === "contacted") {
        const since = lead.contactedAt ? new Date(lead.contactedAt).getTime() : created;
        if (since && now - since >= 5 * DAY) digestStalled.push(lead);
      }
      if (lead.status === "scheduled" && lead.appointmentAt && mtDate(new Date(lead.appointmentAt).getTime()) === todayMT) {
        digestInspections.push(lead);
      }
    } catch (e) {
      console.error("[cron] lead processing failed", lead.id, e);
    }
  }

  // --- Daily "Needs Action" digest — one consolidated message at ~8am MT ---
  if (mtHour === 8) {
    const lines: string[] = ["📋 DriveOffer — needs action today", ""];
    if (digestNew.length) {
      lines.push(`🆕 New, not yet worked (${digestNew.length}):`);
      digestNew
        .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
        .slice(0, 10)
        .forEach((l) => lines.push(`• ${leadLine(l)}`));
      lines.push("");
    }
    if (digestInspections.length) {
      lines.push(`📅 Inspections today (${digestInspections.length}):`);
      digestInspections.forEach((l) => {
        const when = l.appointmentAt
          ? new Date(l.appointmentAt).toLocaleString("en-CA", { timeZone: "America/Edmonton", hour: "numeric", minute: "2-digit" })
          : "";
        lines.push(`• ${when} — ${leadLine(l)}`);
      });
      lines.push("");
    }
    if (digestStalled.length) {
      lines.push(`⏳ Contacted 5+ days, no close (${digestStalled.length}):`);
      digestStalled.slice(0, 10).forEach((l) => lines.push(`• ${leadLine(l)}`));
      lines.push("");
    }
    if (!digestNew.length && !digestInspections.length && !digestStalled.length) {
      lines.push("All clear — nothing needs chasing. 🎉");
    }
    await notifyOwner(lines.join("\n"));
    summary.digestSent = true;
  }

  // --- Weekly scoreboard — the back-half numbers, once on Monday ~8am MT ---
  const mtWeekday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", weekday: "short" }).format(new Date(now));
  if (mtWeekday === "Mon" && mtHour === 8) {
    const weekAgo = now - 7 * DAY;
    const within = (iso?: string) => !!iso && new Date(iso).getTime() >= weekAgo;
    const newCount = leads.filter((l) => within(l.createdAt) && l.status !== "partial").length;
    const offers = leads.filter((l) => within(l.offerSentAt)).length;
    const closedLeads = leads.filter((l) => within(l.closedAt) && l.status === "closed");
    const revenue = closedLeads.reduce((s, l) => s + (l.purchasePrice || 0), 0);
    const openNew = leads.filter((l) => l.status === "new").length;
    // Avg first-response latency for leads created this week that got a first touch.
    const latencies = leads
      .filter((l) => within(l.createdAt) && l.firstTouchAt)
      .map((l) => (new Date(l.firstTouchAt as string).getTime() - new Date(l.createdAt).getTime()) / 60_000)
      .filter((m) => m >= 0);
    const avgMins = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
    const fmtLatency = avgMins == null ? "—" : avgMins < 60 ? `${avgMins} min` : `${(avgMins / 60).toFixed(1)} h`;
    await notifyOwner(
      [
        "📊 DriveOffer — weekly scoreboard (last 7 days)",
        "",
        `🆕 New leads: ${newCount}`,
        `📨 Offers sent: ${offers}`,
        `✅ Closed: ${closedLeads.length}${revenue ? ` ($${revenue.toLocaleString("en-CA")})` : ""}`,
        `⚡ Avg first-response: ${fmtLatency}`,
        `📥 Still open (new): ${openNew}`,
      ].join("\n"),
    );
    summary.scoreboardSent = true;
  }

  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

// Some schedulers only issue GET — same auth, same work.
export async function GET(req: NextRequest) {
  return runCron(req);
}
