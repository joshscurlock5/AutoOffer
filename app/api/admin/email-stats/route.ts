import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getLeads } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
//  Email analytics for the admin "Emails" tab — three honesty tiers, because
//  the underlying data has three different lifetimes:
//
//  1. allTime  — lead-level stamps (emailEngagement counters, emailBounced,
//     emailOptOut). "Reached" only counts leads with a delivery receipt, and
//     receipts only exist since the Resend webhook went live — the tab says so.
//  2. inRange  — commsEvents receipts filtered by the ?since/?until window.
//     "sent" rows only exist since local send-logging shipped (today), so a
//     window before that will honestly show 0 sent.
//  3. perKind  — receipts that carry a template `kind` (tag-stamped receipts +
//     send logs, both forward-collected). trackingSince tells the UI when this
//     collection actually began.
//
//  historicalSends is the retroactive bridge: per-template counts reconstructed
//  from the lifecycle stamps the app has ALWAYS written (offerSentAt,
//  winbackSentAt, …) — labelled with the method so nobody mistakes an estimate
//  for a receipt.
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Same shape-check lib/email.ts validEmail uses — "could we even email them".
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  // Both bounds optional → all time. String-compare on the ISO date prefix is
  // deliberate (UTC-naive): commsEvents timestamps are ISO strings, so
  // slice(0,10) lexicographic compare is exactly a date compare.
  const since = DATE_RE.test(sp.get("since") || "") ? (sp.get("since") as string) : "";
  const until = DATE_RE.test(sp.get("until") || "") ? (sp.get("until") as string) : "";
  const inWindow = (at: string): boolean => {
    const d = (at || "").slice(0, 10);
    if (!d) return false;
    if (since && d < since) return false;
    if (until && d > until) return false;
    return true;
  };

  try {
    // Archived (soft-deleted) leads are excluded from ALL analytics, same as
    // every other dashboard endpoint.
    const leads = (await getLeads()).filter((l) => !l.archived);

    // -- Tier 1: all-time lead-level stamps ---------------------------------
    const emailable = leads.filter((l) => EMAIL_RE.test((l.contact.email || "").trim()));
    const allTime = {
      leads: leads.length,
      emailableLeads: emailable.length,
      reached: leads.filter((l) => (l.emailEngagement?.deliveredCount || 0) > 0).length,
      opened: leads.filter((l) => (l.emailEngagement?.opensCount || 0) > 0).length,
      clicked: leads.filter((l) => (l.emailEngagement?.clicksCount || 0) > 0).length,
      // Leads who have replied at least once. A lead-level counter, so it counts
      // RETROACTIVELY — and a reply is a far stronger signal than an open (and can't
      // be blocked the way opens can). SMS isn't live, so these are effectively email replies.
      responded: leads.filter((l) => (l.repliesCount || 0) > 0).length,
      bounced: leads.filter((l) => l.emailBounced).length,
      optedOut: leads.filter((l) => l.emailOptOut).length,
    };

    // -- Tier 2 + 3: walk commsEvents once for both -------------------------
    const inRange = { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, complained: 0, unsubscribed: 0 };
    type KindRow = { kind: string; sent: number; delivered: number; opened: number; clicked: number; responded: number; bounced: number; optedOut: number };
    const perKindMap = new Map<string, KindRow>();
    let trackingSince: string | null = null;

    for (const l of leads) {
      for (const e of l.commsEvents || []) {
        if (e.channel !== "email") continue;
        // trackingSince: when kind-bearing send-logging actually began, across
        // ALL time (not the window) — the caption for the per-template table.
        if (e.kind && e.type === "sent" && (!trackingSince || e.at < trackingSince)) trackingSince = e.at;
        if (!inWindow(e.at)) continue;
        if (e.type in inRange) inRange[e.type as keyof typeof inRange] += 1;
        if (!e.kind) continue;
        let row = perKindMap.get(e.kind);
        if (!row) {
          row = { kind: e.kind, sent: 0, delivered: 0, opened: 0, clicked: 0, responded: 0, bounced: 0, optedOut: 0 };
          perKindMap.set(e.kind, row);
        }
        // Map each receipt type onto the per-template column it belongs to.
        if (e.type === "sent") row.sent += 1;
        else if (e.type === "delivered") row.delivered += 1;
        else if (e.type === "opened") row.opened += 1;
        else if (e.type === "clicked") row.clicked += 1;
        else if (e.type === "replied") row.responded += 1;
        else if (e.type === "bounced" || e.type === "failed") row.bounced += 1;
        else if (e.type === "unsubscribed" || e.type === "complained") row.optedOut += 1;
      }
    }
    const perKind = [...perKindMap.values()].sort((a, b) => b.sent - a.sent || a.kind.localeCompare(b.kind));

    // -- Retroactive per-template evidence (range-independent) --------------
    // Counts derived from lifecycle stamps that predate send-logging. Honest
    // approximations, each labelled with HOW it was counted.
    const historicalSends = [
      {
        kind: "confirmation",
        count: allTime.emailableLeads,
        method: "≈ every lead with a valid email (sent on submit)",
      },
      {
        kind: "offer",
        count: leads.filter((l) => l.offerSentAt || l.offer?.sentAt).length,
        method: "offerSentAt stamp",
      },
      {
        kind: "more_info",
        count: leads.filter((l) => l.moreInfoSentAt).length,
        method: "moreInfoSentAt stamp",
      },
      {
        kind: "winback",
        count: leads.filter((l) => l.winbackSentAt).length,
        method: "winbackSentAt stamp",
      },
      {
        kind: "booking_day_of",
        count: leads.filter((l) => l.dayOfRemindedAt).length,
        method: "dayOfRemindedAt stamp",
      },
    ];

    return NextResponse.json({ since, until, allTime, inRange, perKind, trackingSince, historicalSends });
  } catch (e) {
    // Soft-fail 200 (same convention as the other admin analytics routes): the
    // tab renders an empty state instead of a hard error page.
    console.error("[email-stats] failed:", e);
    return NextResponse.json({
      since,
      until,
      allTime: { leads: 0, emailableLeads: 0, reached: 0, opened: 0, clicked: 0, responded: 0, bounced: 0, optedOut: 0 },
      inRange: { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, complained: 0, unsubscribed: 0 },
      perKind: [],
      trackingSince: null,
      historicalSends: [],
      error: "Failed to read leads",
    });
  }
}
