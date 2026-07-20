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

/** The copy-paste text message the owner sends — sent as its own Telegram
 * message so a long-press copies exactly this and nothing else. */
export const RECONTACT_TEMPLATE =
  "Hi, it's DriveOffer 👋 Just checking in — any luck selling your car? " +
  "We're still interested in buying it, and can get you a quick updated offer if you'd like. " +
  "No pressure at all — if it's already sold or you've changed your mind, no worries. " +
  "Just let us know either way. Thanks!";

const STAGE_HEADERS = [
  "🟢 1st check-in — 7+ days",
  "🟡 2nd check-in — 14+ days",
  "🔴 Final check-in — 21+ days",
];

/** Telegram hard limit is 4096 chars — chunk comfortably below it. */
const CHUNK_MAX = 3500;

export interface RecontactDue {
  lead: Lead;
  /** Which check-in this appearance is (0 = 1st/7d, 1 = 2nd/14d, 2 = final/21d). */
  stage: 0 | 1 | 2;
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
  const eligible: { lead: Lead; stage: 0 | 1 | 2; digits: string }[] = [];
  for (const l of leads) {
    // Open pipeline only: booked, closed, lost, spam and never-submitted partials
    // are out; so is anyone who texted STOP.
    if (l.status !== "new" && l.status !== "contacted") continue;
    if (l.kind !== "vehicle") continue;
    if (l.smsOptOut) continue;
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

/** One numbered line per lead: phone first (Telegram makes it tappable). The
 * name only appears when we actually have one — the form doesn't collect it. */
function dueLine(n: number, d: RecontactDue): string {
  const c = d.lead.contact;
  const v = d.lead.vehicle;
  const who = [c.name, v ? `${v.year} ${v.make} ${v.model}` : ""].filter(Boolean).join(" · ");
  const sid = d.lead.id.split("-")[0];
  return `${n}. ${c.phone} — ${who || "(no details)"} 🆔 ${sid}`;
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
  const counts = [0, 0, 0];
  for (const d of due) counts[d.stage] += 1;
  const countBits = [
    counts[0] ? `${counts[0]} first (7d)` : "",
    counts[1] ? `${counts[1]} second (14d)` : "",
    counts[2] ? `${counts[2]} final (21d)` : "",
  ].filter(Boolean);

  const header = [
    `📞 Re-contact list — ${dateLabel}`,
    "",
    `${due.length} lead${due.length === 1 ? "" : "s"} to text today${countBits.length ? ` · ${countBits.join(" · ")}` : ""}`,
    "Work top to bottom — every lead is numbered, so just remember the last number you texted.",
    "Long-press the next message to copy it, then tap a phone number below.",
  ].join("\n");

  // Numbered lines with a group header before each stage block.
  const listLines: string[] = [];
  let lastStage = -1;
  due.forEach((d, i) => {
    if (d.stage !== lastStage) {
      if (listLines.length) listLines.push("");
      listLines.push(`${STAGE_HEADERS[d.stage]} (${counts[d.stage]})`);
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

  return [header, RECONTACT_TEMPLATE, ...chunks];
}

/** Compute the due list, and (unless dry) send it to the Leads channel and stamp
 * every listed lead. Stamps make re-runs in the same hour harmless — a second
 * pass finds nothing due. */
export async function runRecontactDigest(
  leads: Lead[],
  now: number,
  dry: boolean,
): Promise<{ due: number; byStage: number[]; messages: string[] }> {
  const due = collectRecontactDue(leads, now);
  const byStage = [0, 0, 0];
  for (const d of due) byStage[d.stage] += 1;
  if (!due.length) return { due: 0, byStage, messages: [] };

  const messages = buildRecontactMessages(due, now);
  if (!dry) {
    for (const m of messages) {
      await notifyOwner(m, "leads");
    }
    const nowISO = new Date(now).toISOString();
    for (const d of due) {
      // Stamp the listed lead AND its same-phone duplicates — one text covered
      // the person, so none of their leads should resurface separately.
      for (const l of [d.lead, ...d.also]) {
        try {
          await updateLead(l.id, { recontactStage: d.stage + 1, recontactLastAt: nowISO });
        } catch (e) {
          console.error("[recontact] stamp failed", l.id, e);
        }
      }
    }
  }
  return { due: due.length, byStage, messages };
}
