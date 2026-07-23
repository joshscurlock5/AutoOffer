import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getLeads } from "@/lib/store";
import { EMAIL_KINDS } from "@/lib/email";

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

// Shared by GET (all leads) and POST (scoped to a lead-id allow-list). `allow`
// null = every lead; a Set = only those ids (the dashboard's dimension filters,
// resolved upstream to lead ids — see POST).
async function buildStats(req: NextRequest, allow: Set<string> | null) {
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
    // every other dashboard endpoint. When an allow-list is present (filtered
    // POST), scope to just those ids so every number below reflects the active
    // province / source / ad-set / device filters. The matching itself is done
    // upstream (the same profile filter every other tab uses); here we only
    // intersect by the resulting lead ids.
    let leads = (await getLeads()).filter((l) => !l.archived);
    if (allow) leads = leads.filter((l) => allow.has(l.id));

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

    // -- Per-type funnel: TRACKED RECEIPTS ONLY, deduped per recipient -------
    // Real, self-consistent numbers we can stand behind. A lead counts toward a
    // kind's "sent" only if we actually logged a kind-tagged send of it, and it
    // counts toward a later stage (delivered/opened/clicked/replied) only if it
    // ALSO has that receipt for the SAME kind. Consequences, all intentional:
    //   • opened/clicked/replied can NEVER exceed sent (they're subsets of the
    //     same set of recipients),
    //   • repeat opens by one person count once (a Set per kind dedupes types),
    //   • emails from before send-logging (no "sent" receipt) are simply not
    //     shown here — excluded, never estimated. Opens are still capped by the
    //     pixel being blockable (an undercount), which the UI captions.
    type KindRow = { sent: number; delivered: number; opened: number; clicked: number; responded: number; bounced: number; optedOut: number };
    const zero = (): KindRow => ({ sent: 0, delivered: 0, opened: 0, clicked: 0, responded: 0, bounced: 0, optedOut: 0 });
    const perKindMap = new Map<string, KindRow>();
    let trackingSince: string | null = null;

    for (const l of leads) {
      // Per kind, the set of receipt TYPES this lead has (email channel only).
      const seen = new Map<string, Set<string>>();
      for (const e of l.commsEvents || []) {
        if (e.channel !== "email") continue;
        // trackingSince: when kind-bearing send-logging actually began.
        if (e.kind && e.type === "sent" && (!trackingSince || e.at < trackingSince)) trackingSince = e.at;
        // Window chips (all email events, kind or not).
        if (inWindow(e.at) && e.type in inRange) inRange[e.type as keyof typeof inRange] += 1;
        if (!e.kind) continue;
        let types = seen.get(e.kind);
        if (!types) { types = new Set(); seen.set(e.kind, types); }
        types.add(e.type);
      }
      // Fold this lead into the funnel ONLY for kinds we logged a send of.
      for (const [kind, types] of seen) {
        if (!types.has("sent")) continue; // no logged send → not a trustable data point
        let row = perKindMap.get(kind);
        if (!row) { row = zero(); perKindMap.set(kind, row); }
        row.sent += 1;
        if (types.has("delivered")) row.delivered += 1;
        if (types.has("opened")) row.opened += 1;
        if (types.has("clicked")) row.clicked += 1;
        if (types.has("replied")) row.responded += 1;
        if (types.has("bounced") || types.has("failed")) row.bounced += 1;
        if (types.has("unsubscribed") || types.has("complained")) row.optedOut += 1;
      }
    }

    // -- All-time SEND estimates from lifecycle stamps — used ONLY for the
    // gallery's per-card "historical sends" line (clearly labelled as an
    // estimate), NEVER for the funnel table above.
    const estSent = new Map<string, number>([
      ["confirmation", allTime.emailableLeads],
      ["offer", leads.filter((l) => l.offerSentAt || l.offer?.sentAt).length],
      ["more_info", leads.filter((l) => l.moreInfoSentAt).length],
      ["winback", leads.filter((l) => l.winbackSentAt).length],
      ["booking_day_of", leads.filter((l) => l.dayOfRemindedAt).length],
    ]);

    // -- Assemble one row per KNOWN email type, in journey order ------------
    // Every "reason for sending" appears — even those with no tracked sends yet
    // (all zeros) — so the table is the complete list, never a sparse subset.
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

    return NextResponse.json({ since, until, filtered: !!allow, matched: leads.length, allTime, inRange, perKind, trackingSince, historicalSends });
  } catch (e) {
    // Soft-fail 200 (same convention as the other admin analytics routes): the
    // tab renders an empty state instead of a hard error page.
    console.error("[email-stats] failed:", e);
    return NextResponse.json({
      since,
      until,
      filtered: !!allow,
      matched: 0,
      allTime: { leads: 0, emailableLeads: 0, reached: 0, opened: 0, clicked: 0, responded: 0, bounced: 0, optedOut: 0 },
      inRange: { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, complained: 0, unsubscribed: 0 },
      perKind: [],
      trackingSince: null,
      historicalSends: [],
      error: "Failed to read leads",
    });
  }
}

// No filter → all leads (unchanged behaviour).
export async function GET(req: NextRequest) {
  return buildStats(req, null);
}

// Filtered view: body carries { leadIds: string[] } — the lead ids of the
// profiles the dashboard's dimension filters (province / source / ad set /
// device / …) currently match. An empty array legitimately means "nothing
// matches" and yields all-zero stats.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const raw = (body as { leadIds?: unknown }).leadIds;
  const ids = Array.isArray(raw) ? new Set(raw.filter((x): x is string => typeof x === "string")) : null;
  return buildStats(req, ids);
}
