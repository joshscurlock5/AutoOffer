import "server-only";
import type { Lead } from "./types";
import { updateLead } from "./store";
import { notifyOwner } from "./notify";

// ===========================================================================
//  Daily re-contact list — a noon (MT) Telegram digest of phone leads that are
//  due a manual "still interested?" text: 7, 14, and 21 days after the lead
//  came in (or after the last human touch, whichever is later). The owner
//  texts them by hand from their phone; this just builds the call sheet.
//
//  Mechanics: each appearance bumps lead.recontactStage (0→1→2→3) and stamps
//  recontactLastAt; a lead is due again 7 days after its last touch, and done
//  for good after the third (21-day) appearance. Leads that predate the
//  feature simply start at stage 0 — the first run is the full backlog, which
//  is exactly the "start the timer from now" backfill the owner asked for.
// ===========================================================================

const DAY = 86_400_000;

/** The copy-paste text message the owner sends — its own Telegram message,
 * wrapped in <pre> so ONE TAP copies exactly this. Written to sound like a real
 * person (Sam), with no emojis or dashes. */
export const RECONTACT_TEMPLATE =
  "Hey, it's Sam with DriveOffer! Just checking in to see if you still want to sell your car. " +
  "We're still interested and happy to send you an updated offer. No rush, just let me know!";

const STAGE_HEADERS = [
  "🟢 1st check-in (7+ days)",
  "🟡 2nd check-in (14+ days)",
  "🔴 Final check-in (21+ days)",
  "📅 Scheduled re-contact",
];

/** Escape the few dynamic bits (phone, vehicle, name) for the HTML-parsed digest. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Telegram hard limit is 4096 chars — chunk comfortably below it. */
const CHUNK_MAX = 3500;

export type RecontactStage = 0 | 1 | 2 | 3;
export interface RecontactDue {
  lead: Lead;
  /** 0 = 1st/7d, 1 = 2nd/14d, 2 = final/21d, 3 = owner-scheduled one-off. */
  stage: RecontactStage;
  /** For a scheduled (stage 3) entry, the owner's reason — shown next to the line. */
  note?: string;
  /** Other due leads with the SAME phone (repeat submissions) — hidden from the
   * list (one text covers the person) but stamped alongside so they don't
   * resurface on their own tomorrow. */
  also: Lead[];
}

/** The last time anyone actually talked to (or at) this lead — lead creation,
 * owner contact/call/offer, a customer reply, or a previous re-contact list. */
function lastTouchMs(l: Lead): number {
  const stamps = [l.createdAt, l.contactedAt, l.calledAt, l.offerSentAt, l.lastReplyAt, l.recontactLastAt];
  return Math.max(...stamps.map((s) => (s ? new Date(s).getTime() : 0)));
}

/** Vehicle leads with a usable phone that are due a check-in text. One entry per
 * PHONE NUMBER — repeat submissions from the same person collapse into the
 * newest lead (the rest ride along in `also` for stamping). */
export function collectRecontactDue(leads: Lead[], now: number): RecontactDue[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(new Date(now));
  const eligible: { lead: Lead; stage: 0 | 1 | 2; digits: string }[] = [];
  for (const l of leads) {
    // Open pipeline only: booked, closed, lost, spam and never-submitted partials
    // are out; so is anyone who texted STOP.
    if (l.status !== "new" && l.status !== "contacted") continue;
    if (l.kind !== "vehicle") continue;
    if (l.smsOptOut) continue;
    // A due owner-scheduled one-off is shown in the Scheduled section instead.
    if (l.scheduledRecontactAt && l.scheduledRecontactAt <= today) continue;
    const digits = (l.contact.phone || "").replace(/\D/g, "");
    if (digits.length < 10) continue;
    const stage = Math.min(Math.max(l.recontactStage ?? 0, 0), 3);
    if (stage >= 3) continue; // all three pings sent — done for good
    const touched = lastTouchMs(l);
    if (!touched || now - touched < 7 * DAY) continue; // talked to within the week
    eligible.push({ lead: l, stage: stage as 0 | 1 | 2, digits });
  }
  // Collapse to one entry per phone: newest lead represents the person; the
  // furthest-along stage wins so nobody gets extra pings via a repeat submission.
  const byPhone = new Map<string, { lead: Lead; stage: 0 | 1 | 2; also: Lead[] }>();
  for (const e of eligible) {
    const cur = byPhone.get(e.digits);
    if (!cur) {
      byPhone.set(e.digits, { lead: e.lead, stage: e.stage, also: [] });
    } else {
      const newer = (e.lead.createdAt || "") > (cur.lead.createdAt || "");
      const stage = Math.max(cur.stage, e.stage) as 0 | 1 | 2;
      if (newer) byPhone.set(e.digits, { lead: e.lead, stage, also: [...cur.also, cur.lead] });
      else {
        cur.stage = stage;
        cur.also.push(e.lead);
      }
    }
  }
  // Newest lead first inside each group — warmest prospects at the top, the cold
  // tail at the bottom. Stable day to day, so the list always reads the same way.
  return [...byPhone.values()].sort(
    (a, b) => a.stage - b.stage || (b.lead.createdAt || "").localeCompare(a.lead.createdAt || ""),
  );
}

/** Owner-scheduled one-off re-contacts that are due (scheduledRecontactAt on or before
 * today, MT) — the "📅 Scheduled re-contact" section. Same phone-dedup as the regular
 * list; each carries the owner's note. */
export function collectScheduledDue(leads: Lead[], now: number): RecontactDue[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(new Date(now));
  const byPhone = new Map<string, RecontactDue>();
  for (const l of leads) {
    if (l.status !== "new" && l.status !== "contacted") continue;
    if (l.kind !== "vehicle") continue;
    if (l.smsOptOut) continue;
    if (!l.scheduledRecontactAt || l.scheduledRecontactAt > today) continue; // not due yet
    const digits = (l.contact.phone || "").replace(/\D/g, "");
    if (digits.length < 10) continue;
    const cur = byPhone.get(digits);
    if (!cur) {
      byPhone.set(digits, { lead: l, stage: 3, note: l.scheduledRecontactNote, also: [] });
    } else {
      const newer = (l.createdAt || "") > (cur.lead.createdAt || "");
      if (newer) byPhone.set(digits, { lead: l, stage: 3, note: l.scheduledRecontactNote, also: [...cur.also, cur.lead] });
      else cur.also.push(l);
    }
  }
  // Earliest-scheduled first, then newest lead.
  return [...byPhone.values()].sort(
    (a, b) =>
      (a.lead.scheduledRecontactAt || "").localeCompare(b.lead.scheduledRecontactAt || "") ||
      (b.lead.createdAt || "").localeCompare(a.lead.createdAt || ""),
  );
}

/** One numbered line per lead: the phone as a tap-to-copy <code> chip, then the
 * vehicle/name for context. The name only appears when we have one (the form
 * doesn't collect it). */
function dueLine(n: number, d: RecontactDue): string {
  const c = d.lead.contact;
  const v = d.lead.vehicle;
  const who = [c.name, v ? `${v.year} ${v.make} ${v.model}` : ""].filter(Boolean).join(" · ");
  const reason = d.stage === 3 && d.note ? ` — ${esc(d.note)}` : "";
  return `${n}. <code>${esc(c.phone || "")}</code>${who ? ` ${esc(who)}` : ""}${reason}`;
}

/** The full digest as a list of Telegram-sized messages:
 *  [0] header + counts, [1] the copy-paste template, [2..] the numbered list. */
export function buildRecontactMessages(due: RecontactDue[], now: number): string[] {
  const dateLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(now));
  // Simple header — title + date — with a marker emoji so the list stands out from
  // the "🚗 New lead" alerts in the same channel.
  const header = `🔄 <b>Re-contact list</b>\n${dateLabel}`;

  // Numbered lines with a bold group header before each stage block. Empty stages
  // never appear — a header is only emitted when a lead of that stage shows up.
  const listLines: string[] = [];
  let lastStage = -1;
  due.forEach((d, i) => {
    if (d.stage !== lastStage) {
      if (listLines.length) listLines.push("");
      listLines.push(`<b>${STAGE_HEADERS[d.stage]}</b>`);
      lastStage = d.stage;
    }
    listLines.push(dueLine(i + 1, d));
  });

  // Chunk the list under Telegram's message limit, labelling continuations.
  const chunks: string[] = [];
  let cur = "";
  for (const line of listLines) {
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length > CHUNK_MAX) {
      chunks.push(cur);
      cur = `…continued\n${line}`;
    } else {
      cur = next;
    }
  }
  if (cur) chunks.push(cur);

  return [header, `<pre>${esc(RECONTACT_TEMPLATE)}</pre>`, ...chunks];
}

/** Compute the due list, and (unless dry) send it to the Leads channel and stamp
 * every listed lead. Stamps make re-runs in the same hour harmless — a second
 * pass finds nothing due. */
export async function runRecontactDigest(
  leads: Lead[],
  now: number,
  dry: boolean,
): Promise<{ due: number; byStage: number[]; messages: string[] }> {
  const scheduled = collectScheduledDue(leads, now);
  const scheduledPhones = new Set(
    scheduled.flatMap((s) => [s.lead, ...s.also]).map((l) => (l.contact.phone || "").replace(/\D/g, "")),
  );
  // Regular check-ins, minus anyone already covered by a scheduled entry (same phone).
  const regular = collectRecontactDue(leads, now).filter(
    (d) => !scheduledPhones.has((d.lead.contact.phone || "").replace(/\D/g, "")),
  );
  const due = [...regular, ...scheduled]; // 🟢🟡🔴 first, 📅 scheduled last
  const byStage = [0, 0, 0, 0];
  for (const d of due) byStage[d.stage] += 1;
  if (!due.length) return { due: 0, byStage, messages: [] };

  const messages = buildRecontactMessages(due, now);
  if (!dry) {
    // Send the whole digest as HTML (tap-to-copy template + tappable phone chips).
    let allSent = true;
    for (const m of messages) {
      if (!(await notifyOwner(m, "leads", "HTML"))) allSent = false;
    }
    // Only stamp once the list actually went out — otherwise a failed send would
    // silently mark leads "re-contacted" and they'd never resurface. A miss just
    // retries on the next run.
    if (allSent) {
      const nowISO = new Date(now).toISOString();
      for (const d of due) {
        // Stamp the listed lead AND its same-phone duplicates — one text covered
        // the person, so none of their leads should resurface separately.
        for (const l of [d.lead, ...d.also]) {
          try {
            if (d.stage === 3) {
              // Scheduled one-off: clear it so it doesn't recur; counts as a touch.
              await updateLead(l.id, { scheduledRecontactAt: undefined, scheduledRecontactNote: undefined, recontactLastAt: nowISO });
            } else {
              await updateLead(l.id, { recontactStage: d.stage + 1, recontactLastAt: nowISO });
            }
          } catch (e) {
            console.error("[recontact] stamp failed", l.id, e);
          }
        }
      }
    } else {
      console.error("[recontact] some digest messages failed to send — leads NOT stamped (will retry next run)");
    }
  }
  return { due: due.length, byStage, messages };
}

// ===========================================================================
//  Daily recap — a 10pm (MT) Telegram list of every phone number that came in
//  TODAY, each with its vehicle, so the rep can sweep anyone they didn't get to.
//  Unlike the re-contact list there's NO copy-paste template — the rep writes
//  whatever they want; this is just the tappable call sheet for the day.
// ===========================================================================

/** Today's (MT) submitted leads that have a usable phone — one entry per phone
 * (repeat submissions collapse to the newest). Junk is excluded: spam, archived,
 * and never-submitted partials. Newest first. */
export function collectTodayPhoneLeads(leads: Lead[], now: number): Lead[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" });
  const today = fmt.format(new Date(now));
  const byPhone = new Map<string, Lead>();
  for (const l of leads) {
    if (l.archived) continue;
    if (l.status === "spam" || l.status === "partial") continue;
    if (!l.createdAt || fmt.format(new Date(l.createdAt)) !== today) continue;
    const digits = (l.contact.phone || "").replace(/\D/g, "");
    if (digits.length < 10) continue;
    const cur = byPhone.get(digits);
    if (!cur || (l.createdAt || "") > (cur.createdAt || "")) byPhone.set(digits, l);
  }
  return [...byPhone.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/** One recap line: tap-to-copy phone chip, then the vehicle (make model trim). */
function recapLine(n: number, l: Lead): string {
  const v = l.vehicle;
  const vehicle = v ? [v.make, v.model, v.trim].filter(Boolean).join(" ") : "";
  return `${n}. <code>${esc(l.contact.phone || "")}</code>${vehicle ? ` ${esc(vehicle)}` : ""}`;
}

/** The recap as Telegram-sized HTML messages: a "📆 Daily recap" header followed
 * by the numbered phone list (chunked under Telegram's 4096-char limit). */
export function buildDailyRecapMessages(todayLeads: Lead[], now: number): string[] {
  const dateLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(now));
  const header = `📆 <b>Daily recap</b>\n${dateLabel}`;
  if (!todayLeads.length) return [`${header}\n\nNo new numbers today.`];

  const chunks: string[] = [];
  let cur = header;
  todayLeads.forEach((l, i) => {
    const line = recapLine(i + 1, l);
    const next = `${cur}\n${line}`;
    if (next.length > CHUNK_MAX) {
      chunks.push(cur);
      cur = `…continued\n${line}`;
    } else {
      cur = next;
    }
  });
  if (cur) chunks.push(cur);
  return chunks;
}

/** Compute today's phone leads and (unless dry) send the recap to the Leads
 * channel. No stamping — it's a pure daily snapshot, safe to recompute. */
export async function runDailyRecap(
  leads: Lead[],
  now: number,
  dry: boolean,
): Promise<{ count: number; messages: string[] }> {
  const today = collectTodayPhoneLeads(leads, now);
  const messages = buildDailyRecapMessages(today, now);
  if (!dry) {
    for (const m of messages) await notifyOwner(m, "leads", "HTML");
  }
  return { count: today.length, messages };
}
