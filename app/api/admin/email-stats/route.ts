import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getLeads } from "@/lib/store";
import { EMAIL_KINDS } from "@/lib/email";
import type { Lead } from "@/lib/types";

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

    // -- Window-scoped activity chips (respect ?since/?until) ---------------
    const inRange = { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, complained: 0, unsubscribed: 0 };

    // -- Per-type receipts: kind-tagged commsEvents, ALL-TIME (not window) --
    // The per-type table answers "how is each individual email doing overall",
    // so it deliberately ignores the date window. Opens/clicks are still only
    // as old as tracking (trackingSince); the UI captions that.
    type KindRow = { sent: number; delivered: number; opened: number; clicked: number; responded: number; bounced: number; optedOut: number };
    const zero = (): KindRow => ({ sent: 0, delivered: 0, opened: 0, clicked: 0, responded: 0, bounced: 0, optedOut: 0 });
    const perKindMap = new Map<string, KindRow>();
    let trackingSince: string | null = null;

    for (const l of leads) {
      for (const e of l.commsEvents || []) {
        if (e.channel !== "email") continue;
        // trackingSince: when kind-bearing send-logging actually began.
        if (e.kind && e.type === "sent" && (!trackingSince || e.at < trackingSince)) trackingSince = e.at;
        // Window chips.
        if (inWindow(e.at) && e.type in inRange) inRange[e.type as keyof typeof inRange] += 1;
        // Per-type receipts (all-time).
        if (!e.kind) continue;
        let row = perKindMap.get(e.kind);
        if (!row) { row = zero(); perKindMap.set(e.kind, row); }
        if (e.type === "sent") row.sent += 1;
        else if (e.type === "delivered") row.delivered += 1;
        else if (e.type === "opened") row.opened += 1;
        else if (e.type === "clicked") row.clicked += 1;
        else if (e.type === "replied") row.responded += 1;
        else if (e.type === "bounced" || e.type === "failed") row.bounced += 1;
        else if (e.type === "unsubscribed" || e.type === "complained") row.optedOut += 1;
      }
    }

    // -- All-time SEND estimates from lifecycle stamps (predate send-logging).
    // 0 = we have no retroactive signal for this type (the forward-tracked
    // `sent` count is then the only number we can stand behind).
    const estSent = new Map<string, number>([
      ["confirmation", allTime.emailableLeads],
      ["offer", leads.filter((l) => l.offerSentAt || l.offer?.sentAt).length],
      ["more_info", leads.filter((l) => l.moreInfoSentAt).length],
      ["winback", leads.filter((l) => l.winbackSentAt).length],
      ["booking_day_of", leads.filter((l) => l.dayOfRemindedAt).length],
    ]);

    // -- Best-effort per-type RESPONSE attribution (all-time) ----------------
    // Historical replies were never tagged with which email they answered, so
    // we attribute each replied lead to the LAST email we can prove/ infer went
    // to them (the one a reply most likely answers). Exact going forward (the
    // kind-tagged `responded` receipts above are a subset of this). Sum over
    // all types == allTime.responded, so the table reconciles with the card.
    const inferLastEmailKind = (l: Lead): string => {
      let bestAt = "";
      let bestKind = "";
      const consider = (kind: string, at?: string | null) => {
        if (at && at > bestAt) { bestAt = at; bestKind = kind; }
      };
      for (const e of l.commsEvents || []) {
        if (e.channel === "email" && e.type === "sent" && e.kind) consider(e.kind, e.at);
      }
      consider("offer", l.offerSentAt || l.offer?.sentAt);
      consider("more_info", l.moreInfoSentAt);
      consider("winback", l.winbackSentAt);
      consider("booking_day_of", l.dayOfRemindedAt);
      // Everyone emailable got a confirmation at signup — the safe default.
      return bestKind || "confirmation";
    };
    const estResponded = new Map<string, number>();
    for (const l of leads) {
      if ((l.repliesCount || 0) <= 0) continue;
      const k = inferLastEmailKind(l);
      estResponded.set(k, (estResponded.get(k) || 0) + 1);
    }

    // -- Assemble one row per KNOWN email type, in journey order ------------
    // Every "reason for sending" appears — even those with no receipts yet —
    // so the table is the complete list, never a sparse subset.
    const perKind = EMAIL_KINDS.map((m) => {
      const r = perKindMap.get(m.kind) || zero();
      return {
        kind: m.kind,
        title: m.title,
        group: m.group,
        order: m.order,
        sent: r.sent,
        delivered: r.delivered,
        opened: r.opened,
        clicked: r.clicked,
        responded: r.responded,
        bounced: r.bounced,
        optedOut: r.optedOut,
        estSent: estSent.get(m.kind) || 0,
        estResponded: estResponded.get(m.kind) || 0,
      };
    });

    // Retained for the gallery's per-card stats line (labelled estimates).
    const historicalSends = [
      { kind: "confirmation", count: estSent.get("confirmation") || 0, method: "≈ every lead with a valid email (sent on submit)" },
      { kind: "offer", count: estSent.get("offer") || 0, method: "offerSentAt stamp" },
      { kind: "more_info", count: estSent.get("more_info") || 0, method: "moreInfoSentAt stamp" },
      { kind: "winback", count: estSent.get("winback") || 0, method: "winbackSentAt stamp" },
      { kind: "booking_day_of", count: estSent.get("booking_day_of") || 0, method: "dayOfRemindedAt stamp" },
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
