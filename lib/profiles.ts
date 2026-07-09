import "server-only";
import type {
  Lead,
  Referral,
  ChatConversation,
  LeadStatus,
  Attribution,
  Behavior,
  Profile,
  ProfileEvent,
  DeviceInfo,
  EmailEngagement,
  SmsEngagement,
  SiteEvent,
  Touch,
  Enrichment,
  ScoreFactor,
} from "./types";
import { emailType, phoneRegion, vehicleTier, geoPhoneMismatch, conditionFlags, mileageVsMarket, referrerQuality } from "./enrich";

// ===========================================================================
//  Identity stitching — one Profile per PERSON.
//
//  DriveOffer's per-person data is spread across separate records: a person can
//  appear as an abandoned-cart "partial", a full lead, a repeat lead, a chat
//  conversation, and a referrer — sometimes under an email, sometimes a phone.
//  This module groups all of those into a single Profile by the connected
//  components of shared email/phone (union-find), non-destructively (nothing in
//  the DB is merged — profiles are computed at read time, so it works on all the
//  historical data too). It also computes dashboard aggregates from the same
//  scan. Server-only; used by app/api/admin/analytics.
// ===========================================================================

const normEmail = (e?: string): string => (e || "").trim().toLowerCase();
const normPhone = (p?: string): string => (p || "").replace(/\D/g, "");

const STATUS_RANK: Record<LeadStatus, number> = {
  spam: 0,
  lost: 1,
  partial: 2,
  new: 3,
  contacted: 4,
  scheduled: 5,
  closed: 6,
};

// Profile + ProfileEvent types live in lib/types.ts (shared with the client dashboard).

// ---- union-find over identifier strings ("e:<email>" / "p:<phone>") ----------
class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p !== x) {
      const root = this.find(p);
      this.parent.set(x, root);
      return root;
    }
    return x;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function keysFor(email?: string, phone?: string): string[] {
  const ks: string[] = [];
  const e = normEmail(email);
  if (e) ks.push("e:" + e);
  const p = normPhone(phone);
  if (p.length >= 7) ks.push("p:" + p);
  return ks;
}

type Rec =
  | { kind: "lead"; keys: string[]; lead: Lead }
  | { kind: "referral"; keys: string[]; referral: Referral }
  | { kind: "chat"; keys: string[]; chat: ChatConversation };

/** Build one Profile per person from all leads (+ partials) + referrers + chats.
 * Pass the first-party events scan to interleave each person's on-site activity
 * (matched via lead.behavior.sessionId, or a server-resolved leadId). */
export function buildProfiles(
  leads: Lead[],
  referrals: Referral[] = [],
  chats: ChatConversation[] = [],
  siteEvents: SiteEvent[] = [],
): Profile[] {
  const uf = new UnionFind();
  const recs: Rec[] = [];

  const add = (keys: string[], rec: Rec) => {
    keys.forEach((k) => uf.find(k));
    for (let i = 1; i < keys.length; i += 1) uf.union(keys[0], keys[i]);
    recs.push(rec);
  };

  for (const lead of leads) {
    const keys = keysFor(lead.contact.email, lead.contact.phone);
    if (keys.length) add(keys, { kind: "lead", keys, lead });
  }
  for (const referral of referrals) {
    const keys = keysFor(referral.referrer.email, referral.referrer.phone);
    if (keys.length) add(keys, { kind: "referral", keys, referral });
  }
  for (const chat of chats) {
    const c = (chat.contact || "").trim();
    const keys = c.includes("@") ? keysFor(c, undefined) : keysFor(undefined, c);
    if (keys.length) add(keys, { kind: "chat", keys, chat });
  }

  const groups = new Map<string, Rec[]>();
  for (const rec of recs) {
    const root = uf.find(rec.keys[0]);
    const arr = groups.get(root);
    if (arr) arr.push(rec);
    else groups.set(root, [rec]);
  }

  // Index the event stream once: by sessionId, by durable visitorId, and by
  // server-resolved leadId.
  const eventsBySession = new Map<string, SiteEvent[]>();
  const eventsByVisitorId = new Map<string, SiteEvent[]>();
  const eventsByLeadId = new Map<string, SiteEvent[]>();
  for (const e of siteEvents) {
    const s = eventsBySession.get(e.sessionId);
    if (s) s.push(e);
    else eventsBySession.set(e.sessionId, [e]);
    if (e.vid) {
      const v = eventsByVisitorId.get(e.vid);
      if (v) v.push(e);
      else eventsByVisitorId.set(e.vid, [e]);
    }
    if (e.leadId) {
      const l = eventsByLeadId.get(e.leadId);
      if (l) l.push(e);
      else eventsByLeadId.set(e.leadId, [e]);
    }
  }

  const profiles: Profile[] = [];
  for (const [root, group] of groups)
    profiles.push(buildOne(root, group, eventsBySession, eventsByVisitorId, eventsByLeadId));
  profiles.sort((a, b) => (b.lastActivityAt || "").localeCompare(a.lastActivityAt || ""));
  return profiles;
}

function sourceLabel(a?: Attribution): string {
  if (!a) return "Direct";
  if (a.utmCampaign) return a.utmCampaign;
  if (a.utmSource) return a.utmSource;
  if (a.gclid) return "Google Ads";
  if (a.fbclid) return "Facebook Ad";
  if (a.referrer) {
    try {
      return new URL(a.referrer).hostname.replace(/^www\./, "");
    } catch {
      return a.referrer;
    }
  }
  return "Direct";
}

function aggregateBehavior(recs: Array<{ behavior?: Behavior }>): Behavior | undefined {
  const bs = recs.map((r) => r.behavior).filter((b): b is Behavior => Boolean(b));
  if (!bs.length) return undefined;
  const firstSeenAt = bs.map((b) => b.firstSeenAt).filter(Boolean).sort()[0];
  const lastSeenAt = bs.map((b) => b.lastSeenAt).filter(Boolean).sort().pop();
  const pageviews = Math.max(...bs.map((b) => b.pageviews || 0));
  const maxFunnelStep = Math.max(...bs.map((b) => b.maxFunnelStep || 0));
  const timeOnSiteMs = Math.max(...bs.map((b) => b.timeOnSiteMs || 0)) || undefined;
  return { firstSeenAt, lastSeenAt, pageviews, maxFunnelStep, timeOnSiteMs };
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-CA")}`;
}

/** Compact display form of a clicked URL for timeline labels. */
function shortUrl(u: string): string {
  try {
    const url = new URL(u);
    return (url.pathname === "/" ? url.hostname : url.pathname).slice(0, 40);
  } catch {
    return u.slice(0, 40);
  }
}

/** The transparent 0–100 lead score. NOT machine learning — an explainable
 * prioritization aid: every factor is returned so the dashboard can show
 * exactly why a person scored what they did. Factors from data that hasn't
 * started flowing yet (engagement receipts, funnel events) simply score 0,
 * so the score degrades gracefully and improves as the data fills in. */
function computeScore(
  p: Omit<Profile, "score" | "scoreBreakdown">,
  leads: Lead[],
): { score: number; breakdown: ScoreFactor[] } {
  const b: ScoreFactor[] = [];

  // Recency of ANY activity (0–25) — a week-old lead is worth calling; a
  // three-month-old one usually isn't.
  const last = p.lastActivityAt ? Date.parse(p.lastActivityAt) : NaN;
  const days = Number.isFinite(last) ? (Date.now() - last) / 86_400_000 : Infinity;
  const recency = days <= 1 ? 25 : days <= 3 ? 20 : days <= 7 ? 15 : days <= 14 ? 10 : days <= 30 ? 5 : 0;
  b.push({ label: "Recent activity", points: recency, max: 25 });

  // Engagement (0–25): replies dominate; email opens/clicks + chat add signal.
  const ee = p.emailEngagement;
  const chat = p.timeline.some((e) => e.type === "chat");
  const engagement = Math.min(
    25,
    (p.repliesCount || 0) * 10 + (ee?.clicksCount || 0) * 4 + (ee?.opensCount || 0) * 2 + (chat ? 4 : 0),
  );
  b.push({ label: "Engagement — replies, clicks, opens, chat", points: engagement, max: 25 });

  // Intent depth (0–20): submitted > reached contact > opened booking page.
  let intent = 0;
  if (p.stage !== "partial" && p.stage !== "spam") intent += 10;
  if ((p.behavior?.maxFunnelStep || 0) >= 3) intent += 4;
  if (p.appointmentAt || p.timeline.some((e) => e.label === "Opened the booking page")) intent += 6;
  if ((p.returnVisits || 0) > 1) intent += 3; // came back before committing
  if ((p.behavior?.timeOnSiteMs || 0) >= 3 * 60 * 1000) intent += 3; // real dwell, not a bounce
  b.push({ label: "Intent — submitted, funnel, booking, return visits, dwell", points: Math.min(20, intent), max: 20 });

  // Vehicle value tier (0–15) — from the real offer when present, else make+age.
  const tier = p.enrichment?.vehicleTier;
  const vehicle = tier === "high" ? 15 : tier === "mid" ? 9 : tier === "low" ? 4 : 0;
  b.push({ label: "Vehicle value", points: vehicle, max: 15 });

  // Source quality (0–15): referred-in beats organic beats paid beats unknown.
  const referredIn = leads.some((l) => l.referralCode);
  const referredOthers = p.timeline.some((e) => e.type === "referral");
  const a = p.attribution;
  const paid = Boolean(a?.gclid || a?.fbclid || a?.utmSource);
  const organic = Boolean(a?.referrer && !paid);
  const source = referredIn || referredOthers ? 15 : organic ? 12 : paid ? 10 : 8;
  b.push({ label: "Source quality", points: source, max: 15 });

  // Penalties: dead/complained email is a real barrier to closing.
  let penalty = 0;
  if (p.emailBounced) penalty -= 10;
  if (p.emailOptOut) penalty -= 10;
  if (penalty) b.push({ label: "Email bounced / opted out", points: penalty, max: 0 });

  let score = b.reduce((s, f) => s + f.points, 0);
  if (p.stage === "spam") score = 0;
  if (p.stage === "lost") score = Math.min(score, 25);
  return { score: Math.max(0, Math.min(100, Math.round(score))), breakdown: b };
}

/** Merge every lead's touch history into one deduped, oldest-first journey. */
function mergeTouches(recs: Array<{ touchHistory?: Touch[] }>): Touch[] | undefined {
  const seen = new Map<string, Touch>();
  for (const l of recs) {
    for (const t of l.touchHistory || []) {
      const key = `${t.at || ""}|${t.utmSource || ""}|${t.utmCampaign || ""}|${t.gclid || ""}|${t.fbclid || ""}|${t.referrer || ""}`;
      if (!seen.has(key)) seen.set(key, t);
    }
  }
  if (!seen.size) return undefined;
  return [...seen.values()]
    .sort((a, b) => (a.at || "").localeCompare(b.at || ""))
    .slice(-40);
}

/** Sum the per-lead email receipts (Resend webhook) into one profile view. */
function aggregateEmailEngagement(leads: Lead[]): EmailEngagement | undefined {
  const es = leads.map((l) => l.emailEngagement).filter((e): e is EmailEngagement => Boolean(e));
  if (!es.length) return undefined;
  const latest = (pick: (e: EmailEngagement) => string | undefined) =>
    es.map(pick).filter((t): t is string => Boolean(t)).sort().pop();
  const lastClickedAt = latest((e) => e.lastClickedAt);
  const withUrl = es
    .filter((e) => e.lastClickedAt && e.lastClickedUrl)
    .sort((a, b) => (b.lastClickedAt || "").localeCompare(a.lastClickedAt || ""))[0];
  return {
    deliveredCount: es.reduce((s, e) => s + (e.deliveredCount || 0), 0),
    opensCount: es.reduce((s, e) => s + (e.opensCount || 0), 0),
    clicksCount: es.reduce((s, e) => s + (e.clicksCount || 0), 0),
    lastOpenedAt: latest((e) => e.lastOpenedAt),
    lastClickedAt,
    lastClickedUrl: withUrl?.lastClickedUrl,
    lastDelayedAt: latest((e) => e.lastDelayedAt),
    lastBounceReason: es.map((e) => e.lastBounceReason).filter((r): r is string => Boolean(r)).pop(),
  };
}

/** Timeline labels for site events worth showing on a person's file. Everything
 * not listed (scroll_depth, field_focus, …) stays in the aggregates only. */
const SITE_EVENT_LABELS: Record<string, string> = {
  offer_flow_start: "Opened the offer form",
  step1_submitted: "Entered their vehicle",
  details_submitted: "Entered mileage & condition",
  contact_started: "Reached the contact step",
  contact_engaged: "Started typing contact info",
  estimate_viewed: "Viewed an estimate",
  booking_view: "Opened the booking page",
  phone_click: "Clicked to call",
  chat_opened: "Opened the chat",
  widget_submit: "Used the value widget",
  resume_clicked: "Resumed their form",
  lead_contacted: "You made first contact",
  offer_sent: "Offer sent",
  booking_confirmed: "Inspection booked",
  lead_closed: "Deal closed",
  lead_lost: "Marked lost",
};

/** Condense a person's raw event stream into readable timeline entries:
 * consecutive page_views collapse into one "Viewed N pages", only whitelisted
 * events get labels, capped at the 50 most recent. */
function condenseSiteEvents(evs: SiteEvent[]): ProfileEvent[] {
  const sorted = [...evs].sort((a, b) => a.at.localeCompare(b.at));
  const out: ProfileEvent[] = [];
  let pvRun = 0;
  let pvAt = "";
  const flushPv = () => {
    if (!pvRun) return;
    out.push({ at: pvAt, type: "site", label: pvRun === 1 ? "Viewed a page" : `Viewed ${pvRun} pages` });
    pvRun = 0;
  };
  for (const e of sorted) {
    if (e.n === "page_view") {
      if (!pvRun) pvAt = e.at;
      pvRun += 1;
      continue;
    }
    flushPv();
    const label =
      e.n === "form_error"
        ? `Form error${typeof e.p?.reason === "string" ? ` (${e.p.reason})` : ""}`
        : SITE_EVENT_LABELS[e.n];
    if (label) out.push({ at: e.at, type: "site", label, leadId: e.leadId });
  }
  flushPv();
  return out.slice(-50);
}

/** Sum the per-lead SMS delivery receipts (Twilio callback) into one profile view. */
function aggregateSmsEngagement(leads: Lead[]): SmsEngagement | undefined {
  const es = leads.map((l) => l.smsEngagement).filter((e): e is SmsEngagement => Boolean(e));
  if (!es.length) return undefined;
  return {
    deliveredCount: es.reduce((s, e) => s + (e.deliveredCount || 0), 0),
    failedCount: es.reduce((s, e) => s + (e.failedCount || 0), 0),
    lastStatus: es[es.length - 1]?.lastStatus,
    lastDeliveredAt: es.map((e) => e.lastDeliveredAt).filter((t): t is string => Boolean(t)).sort().pop(),
    segmentsCount: es.reduce((s, e) => s + (e.segmentsCount || 0), 0),
  };
}

/** First email-open latency (delivered → first open) in minutes, if any. */
function emailOpenLatencyMins(leads: Lead[]): number | undefined {
  const evs = leads
    .flatMap((l) => l.commsEvents || [])
    .filter((e) => e.channel === "email")
    .sort((a, b) => a.at.localeCompare(b.at));
  const delivered = evs.find((e) => e.type === "delivered");
  if (!delivered) return undefined;
  const opened = evs.find((e) => e.type === "opened" && e.at >= delivered.at);
  if (!opened) return undefined;
  return Math.max(0, Math.round((Date.parse(opened.at) - Date.parse(delivered.at)) / 60000));
}

/** Parse a user-agent into a coarse device profile (type / OS / browser). */
function deviceFromUA(ua?: string): DeviceInfo | undefined {
  if (!ua) return undefined;
  const s = ua.toLowerCase();
  const type: DeviceInfo["type"] = /ipad|tablet/.test(s)
    ? "tablet"
    : /mobi|iphone|android/.test(s)
      ? "mobile"
      : "desktop";
  const os = /iphone|ipad|ios/.test(s)
    ? "iOS"
    : /android/.test(s)
      ? "Android"
      : /windows/.test(s)
        ? "Windows"
        : /mac os|macintosh/.test(s)
          ? "macOS"
          : /linux/.test(s)
            ? "Linux"
            : undefined;
  const browser = /edg\//.test(s)
    ? "Edge"
    : /chrome|crios/.test(s)
      ? "Chrome"
      : /firefox|fxios/.test(s)
        ? "Firefox"
        : /safari/.test(s)
          ? "Safari"
          : undefined;
  return { type, os, browser };
}

function buildOne(
  root: string,
  group: Rec[],
  eventsBySession: Map<string, SiteEvent[]> = new Map(),
  eventsByVisitorId: Map<string, SiteEvent[]> = new Map(),
  eventsByLeadId: Map<string, SiteEvent[]> = new Map(),
): Profile {
  const leads = group.filter((r): r is Extract<Rec, { kind: "lead" }> => r.kind === "lead").map((r) => r.lead);
  const referrals = group
    .filter((r): r is Extract<Rec, { kind: "referral" }> => r.kind === "referral")
    .map((r) => r.referral);
  const chats = group.filter((r): r is Extract<Rec, { kind: "chat" }> => r.kind === "chat").map((r) => r.chat);

  const emails = new Set<string>();
  const phones = new Set<string>();
  const names = new Set<string>();
  const vehicles = new Set<string>();

  for (const l of leads) {
    if (l.contact.email) emails.add(l.contact.email.trim());
    if (l.contact.phone) phones.add(l.contact.phone.trim());
    if (l.contact.name) names.add(l.contact.name.trim());
    if (l.vehicle) vehicles.add(`${l.vehicle.year} ${l.vehicle.make} ${l.vehicle.model}`.trim());
  }
  for (const rf of referrals) {
    if (rf.referrer.email) emails.add(rf.referrer.email.trim());
    if (rf.referrer.phone) phones.add(rf.referrer.phone.trim());
    if (rf.referrer.name) names.add(rf.referrer.name.trim());
  }
  for (const ch of chats) {
    if (ch.name) names.add(ch.name.trim());
    const c = (ch.contact || "").trim();
    if (c.includes("@")) emails.add(c);
    else if (c) phones.add(c);
  }

  const sortedLeads = [...leads].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const attribution =
    sortedLeads.find((l) => l.attribution)?.attribution ??
    referrals.find((r) => r.attribution)?.attribution ??
    chats.find((c) => c.attribution)?.attribution;
  const behavior = aggregateBehavior([...sortedLeads, ...referrals]);

  // Leads are sorted oldest-first: seed from the earliest lead's status (not a
  // hardcoded "partial") so people whose only leads are lost/spam don't
  // misclassify as partial — those rank below "partial" in STATUS_RANK.
  let stage: LeadStatus = sortedLeads.length ? sortedLeads[0].status : "new";
  for (const l of leads) if (STATUS_RANK[l.status] > STATUS_RANK[stage]) stage = l.status;

  const offer = leads
    .map((l) => l.offer)
    .filter((o): o is NonNullable<Lead["offer"]> => Boolean(o))
    .sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""))[0];

  const appointmentAt = leads
    .map((l) => l.appointmentAt)
    .filter((a): a is string => Boolean(a))
    .sort()
    .pop();

  // Earliest-across-real-leads timestamps for the canonical funnel (audit B4) —
  // real leads only, so an abandoned/spam lead can't backdate these.
  const realLeads = leads.filter((l) => l.status !== "partial" && l.status !== "spam");
  const earliestOf = (pick: (l: Lead) => string | undefined): string | undefined =>
    realLeads.map(pick).filter((t): t is string => Boolean(t)).sort()[0];
  const contactedAt = earliestOf((l) => l.contactedAt);
  const offerSentAt = earliestOf((l) => l.offerSentAt);
  const scheduledAt = earliestOf((l) => l.scheduledAt);

  // Economics, computed over CLOSED leads only: purchasePrice is cost, revenue
  // is real sale (falling back to the expected resale when a deal hasn't been
  // reconciled yet), margin is sale minus cost.
  const closedLeads = leads.filter((l) => l.status === "closed");
  let cashPaidOut: number | undefined;
  let revenue: number | undefined;
  let margin: number | undefined;
  let marginIsEstimate = false;
  let closedAt: string | undefined;
  if (closedLeads.length) {
    cashPaidOut = 0;
    revenue = 0;
    margin = 0;
    for (const l of closedLeads) {
      const cost = l.purchasePrice || 0;
      const sale = l.actualSalePrice ?? l.expectedResale ?? null;
      cashPaidOut += cost;
      revenue += sale || 0;
      if (sale != null) margin += sale - cost;
      if (l.actualSalePrice == null) marginIsEstimate = true;
      if (l.closedAt && (!closedAt || l.closedAt > closedAt)) closedAt = l.closedAt;
    }
  }
  const purchasePrice = cashPaidOut;
  const repliesCount = leads.reduce((s, l) => s + (l.repliesCount || 0), 0);
  const hasRealLead = leads.some((l) => l.status !== "partial" && l.status !== "spam");

  const timeline: ProfileEvent[] = [];
  for (const l of leads) {
    const car = l.vehicle ? ` — ${l.vehicle.year} ${l.vehicle.make} ${l.vehicle.model}` : "";
    timeline.push({
      at: l.createdAt,
      type: l.status === "partial" ? "partial" : "lead",
      label: (l.status === "partial" ? "Started a form (abandoned)" : "Submitted a lead") + car,
      leadId: l.id,
    });
    if (l.offer) timeline.push({ at: l.offer.sentAt, type: "offer", label: `Offer sent ${money(l.offer.low)}–${money(l.offer.high)}`, leadId: l.id });
    if (l.appointmentAt)
      timeline.push({ at: l.appointmentAt, type: "booking", label: "Inspection booked" + (l.appointmentLocation ? ` @ ${l.appointmentLocation}` : ""), leadId: l.id });
    if (l.lastReplyAt) timeline.push({ at: l.lastReplyAt, type: "reply", label: `Replied (${l.lastInboundChannel || "message"})`, leadId: l.id });
    if (l.closedAt) timeline.push({ at: l.closedAt, type: "close", label: l.purchasePrice ? `Closed — ${money(l.purchasePrice)}` : "Closed", leadId: l.id });
    // Comms receipts (Resend/Twilio webhooks). Email "delivered" stays in the
    // counters only — one timeline entry per delivery would drown the story.
    for (const ev of l.commsEvents || []) {
      const label =
        ev.channel === "email"
          ? ev.type === "opened"
            ? "Opened an email"
            : ev.type === "clicked"
              ? `Clicked an email link${ev.url ? ` — ${shortUrl(ev.url)}` : ""}`
              : ev.type === "bounced" || ev.type === "failed"
                ? "Email bounced"
                : ev.type === "complained"
                  ? "Marked email as spam"
                  : ""
          : ev.type === "delivered"
            ? "Text delivered"
            : "Text failed to deliver";
      if (label) timeline.push({ at: ev.at, type: "comms", label, leadId: l.id });
    }
  }
  for (const ch of chats) {
    for (const m of ch.messages) {
      if (m.role === "visitor") timeline.push({ at: m.at, type: "chat", label: `Chat: "${m.text.slice(0, 60)}"` });
    }
  }
  for (const rf of referrals) timeline.push({ at: rf.createdAt, type: "referral", label: `Referred a friend (code ${rf.code})` });

  // On-site activity from the first-party event stream: everything under this
  // person's known session ids, plus events carrying their durable visitor id
  // (stitches a RETURN visit, whose sessionId rotated, back to the same
  // person), plus events server-stitched by leadId (e.g. a booking page opened
  // from an email on another device). Deduped by sort key.
  const siteEvs = new Map<string, SiteEvent>();
  for (const l of leads) {
    const sid = l.behavior?.sessionId;
    for (const e of (sid && eventsBySession.get(sid)) || []) siteEvs.set(`${e.sessionId}#${e.sk}`, e);
    const vid = l.behavior?.visitorId;
    if (vid) for (const e of eventsByVisitorId.get(vid) || []) siteEvs.set(`${e.sessionId}#${e.sk}`, e);
    for (const e of eventsByLeadId.get(l.id) || []) siteEvs.set(`${e.sessionId}#${e.sk}`, e);
  }
  // Chat-carried ids stitch a chat-only person's on-site activity in too.
  for (const ch of chats) {
    const sid = ch.sessionId;
    for (const e of (sid && eventsBySession.get(sid)) || []) siteEvs.set(`${e.sessionId}#${e.sk}`, e);
    const vid = ch.visitorId;
    if (vid) for (const e of eventsByVisitorId.get(vid) || []) siteEvs.set(`${e.sessionId}#${e.sk}`, e);
  }
  timeline.push(...condenseSiteEvents([...siteEvs.values()]));
  timeline.sort((a, b) => (a.at || "").localeCompare(b.at || ""));

  // Distinct stitched sessions = a return-visit signal (undefined/1 = single visit).
  const returnVisits = siteEvs.size ? new Set([...siteEvs.values()].map((e) => e.sessionId)).size : undefined;

  const times = timeline.map((e) => e.at).filter(Boolean);
  const firstSeenAt = [behavior?.firstSeenAt, ...times].filter((t): t is string => Boolean(t)).sort()[0];
  const lastActivityAt = [...times].sort().pop();
  // Deliberation window: first seen on site → first lead submit.
  const firstLeadAt = sortedLeads[0]?.createdAt;
  const timeToConvMs =
    firstLeadAt && firstSeenAt && Date.parse(firstLeadAt) >= Date.parse(firstSeenAt)
      ? Date.parse(firstLeadAt) - Date.parse(firstSeenAt)
      : undefined;

  const recent = [...sortedLeads].reverse();
  const geo = recent.find((l) => l.geo)?.geo ?? chats.find((c) => c.geo)?.geo;
  const device = deviceFromUA(
    recent.find((l) => l.meta?.userAgent)?.meta?.userAgent ?? chats.find((c) => c.userAgent)?.userAgent,
  );
  const make = recent.find((l) => l.vehicle?.make)?.vehicle?.make;
  const offerMid = offer ? Math.round((offer.low + offer.high) / 2) : undefined;
  // Speed-to-lead: firstTouchAt also gets stamped by marking spam/lost and by
  // customer self-booking, so it doesn't reflect owner response speed. Use the
  // earliest real lead that was actually contacted or offered instead — the
  // min of contactedAt/offerSentAt is the owner's first real reply.
  const fl = sortedLeads
    .filter((l) => l.status !== "partial" && l.status !== "spam" && (l.contactedAt || l.offerSentAt))
    .find((l) => l.createdAt);
  const firstResponseMins = fl
    ? Math.max(
        0,
        Math.round(
          (Math.min(
            ...[fl.contactedAt, fl.offerSentAt].filter((t): t is string => Boolean(t)).map((t) => Date.parse(t))
          ) -
            Date.parse(fl.createdAt)) /
            60000
        )
      )
    : undefined;

  // Zero-input enrichment from what we already have (lib/enrich.ts).
  const recentVehicle = recent.find((l) => l.vehicle)?.vehicle;
  const et = emailType([...emails][0]);
  const pr = phoneRegion([...phones][0]);
  const vt = vehicleTier(recentVehicle?.make, recentVehicle?.year, offerMid);
  // IP-derived province vs the phone's area-code province (soft quality flag).
  const mismatch = geoPhoneMismatch(geo?.region, geo?.countryCode, [...phones][0]) === true;
  const cf = conditionFlags(recentVehicle?.condition);
  const mvm = mileageVsMarket(recentVehicle?.year, recentVehicle?.mileageKm);
  const rq = referrerQuality(attribution?.referrer);
  const enrichment: Enrichment | undefined =
    et || pr || vt || mismatch || cf.length || mvm || rq
      ? {
          ...(et ? { emailType: et } : {}),
          ...(pr ? { phoneRegion: pr } : {}),
          ...(vt ? { vehicleTier: vt.tier, ...(vt.age !== undefined ? { vehicleAge: vt.age } : {}) } : {}),
          ...(mismatch ? { regionMismatch: true } : {}),
          ...(cf.length ? { conditionFlags: cf } : {}),
          ...(mvm ? { mileageVsMarket: mvm } : {}),
          ...(rq ? { referrerQuality: rq } : {}),
        }
      : undefined;
  // Referral-derived person signals.
  const referrerIsSeller = referrals.length > 0 && hasRealLead;
  const selfReferral = referrals.some((rf) => {
    const re = normEmail(rf.referrer.email);
    const fe = normEmail(rf.friend.email);
    const rp = normPhone(rf.referrer.phone);
    const fp = normPhone(rf.friend.phone);
    return (!!re && re === fe) || (rp.length >= 7 && rp === fp);
  });
  // Owner-logged negotiation trail (Telegram), merged across the person's leads.
  const negotiation = leads
    .flatMap((l) => l.negotiation || [])
    .sort((a, b) => (a.at || "").localeCompare(b.at || ""));

  // No-lead profiles (chat/referral only) have no sortedLeads[0] to anchor on —
  // fall back to the earliest chat/referral createdAt so date filters don't
  // silently drop them.
  const earliestNonLeadAt = [...chats.map((c) => c.createdAt), ...referrals.map((r) => r.createdAt)]
    .filter(Boolean)
    .sort()[0];

  const base: Omit<Profile, "score" | "scoreBreakdown"> = {
    id: root,
    name: [...names][0],
    emails: [...emails],
    phones: [...phones],
    stage,
    hasRealLead,
    contactMethod: sortedLeads[0]?.contact.contactMethod,
    source: sourceLabel(attribution),
    attribution,
    touchHistory: mergeTouches([...sortedLeads, ...referrals]),
    behavior,
    geo,
    device,
    createdAt: sortedLeads[0]?.createdAt || earliestNonLeadAt,
    firstSeenAt,
    lastActivityAt,
    touchCount: leads.length + chats.length + referrals.length + repliesCount,
    vehicles: [...vehicles],
    make,
    offer: offer || undefined,
    offerMid,
    appointmentAt,
    contactedAt,
    offerSentAt,
    scheduledAt,
    purchasePrice,
    cashPaidOut,
    revenue,
    margin,
    marginIsEstimate: marginIsEstimate || undefined,
    closedAt,
    firstResponseMins,
    repliesCount,
    emailEngagement: aggregateEmailEngagement(sortedLeads),
    smsEngagement: aggregateSmsEngagement(sortedLeads),
    emailOptOut: leads.some((l) => l.emailOptOut) || undefined,
    emailBounced: leads.some((l) => l.emailBounced) || undefined,
    smsOptOut: leads.some((l) => l.smsOptOut) || undefined,
    enrichment,
    bestTime: sortedLeads[0]?.contact.bestTime,
    returnVisits,
    timeToConvMs,
    referrerIsSeller: referrerIsSeller || undefined,
    selfReferral: selfReferral || undefined,
    emailOpenLatencyMins: emailOpenLatencyMins(sortedLeads),
    negotiation: negotiation.length ? negotiation : undefined,
    timeline,
    leadIds: leads.map((l) => l.id),
    referralIds: referrals.map((r) => r.id),
    chatIds: chats.map((c) => c.id),
  };
  const { score, breakdown } = computeScore(base, leads);
  return { ...base, score, scoreBreakdown: breakdown };
}
