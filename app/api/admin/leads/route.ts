import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { isAuthed } from "@/lib/auth";
import {
  getLeads,
  getReferrals,
  addLead,
  updateLead,
  deleteLead,
  updateReferral,
  claimPurchaseSync,
  releasePurchaseSync,
} from "@/lib/store";
import { cancelScheduledEmails } from "@/lib/email";
import { sendCapiPurchase, splitName } from "@/lib/metaCapi";
import { emitLeadContacted, emitBookingConfirmed, emitLeadClosed, emitLeadLost } from "@/lib/leadStages";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/lib/types";

/** Clamp an owner-entered lost-reason to a sane length (mirrors other free-text fields). */
function sanitizeLostReason(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, 300);
  return t || undefined;
}

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [leads, referrals] = await Promise.all([getLeads(), getReferrals()]);
  return NextResponse.json({ leads, referrals });
}

const CONTACT_METHODS = new Set(["call", "text", "email"]);
const SOURCE_VALUES = new Set(["phone", "walk-in", "referral", "other"]);

function s(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function posMoney(v: unknown): number | undefined {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Create a lead by hand — an off-platform deal (phone call, walk-in, referral you
// took verbally) the owner wants in the dataset. Tagged source "manual" with a
// synthetic first-touch so it surfaces as its own source in analytics (never joins
// a Meta ad campaign). A closed manual deal can optionally fire the offline Meta
// "Purchase" (matched on hashed email/phone — Meta credits it only if this person
// ever clicked an ad).
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const b = await req.json().catch(() => ({}));

  const email = s(b.email, 200).toLowerCase();
  const phone = s(b.phone, 40);
  if (!email && !phone) {
    return NextResponse.json({ error: "A phone number or email is required." }, { status: 400 });
  }
  const name = s(b.name, 120);
  const cmRaw = s(b.contactMethod, 10);
  const contactMethod = (CONTACT_METHODS.has(cmRaw) ? cmRaw : "call") as "call" | "text" | "email";

  const statusRaw = s(b.status, 20) as LeadStatus;
  const status: LeadStatus =
    LEAD_STATUSES.includes(statusRaw) && statusRaw !== "partial" ? statusRaw : "new";
  const srcRaw = s(b.source, 20);
  const srcLabel = SOURCE_VALUES.has(srcRaw) ? srcRaw : "other";

  const year = s(b.year, 10);
  const make = s(b.make, 60);
  const model = s(b.model, 60);
  const trim = s(b.trim, 60);
  const mileageKm = Number(s(b.mileageKm, 12)) || 0;
  const conditionNote = s(b.conditionNote, 500);
  const vehicle =
    year || make || model
      ? {
          year,
          make,
          model,
          trim: trim || undefined,
          mileageKm,
          ...(conditionNote ? { condition: { tags: [], note: conditionNote } } : {}),
        }
      : undefined;

  const purchasePrice = posMoney(b.purchasePrice);
  const expectedResale = posMoney(b.expectedResale);
  const actualSalePrice = posMoney(b.actualSalePrice);
  const notes = s(b.notes, 1000) || undefined;
  const reportToMeta = b.reportToMeta === true || b.reportToMeta === "true";

  const id = crypto.randomUUID();
  const nowISO = new Date().toISOString();
  const attribution = {
    utmSource: srcLabel,
    utmMedium: "manual",
    landingPath: "(manual entry)",
    landingAt: nowISO,
  };
  const isClosedSale = status === "closed" && !!purchasePrice;

  const lead: Lead = {
    id,
    kind: "vehicle",
    createdAt: nowISO,
    status,
    contact: { name, email, phone, contactMethod },
    vehicle,
    photos: [],
    source: "manual",
    attribution,
    ...(notes ? { notes } : {}),
    ...(purchasePrice != null ? { purchasePrice } : {}),
    ...(expectedResale != null ? { expectedResale } : {}),
    ...(actualSalePrice != null ? { actualSalePrice, soldAt: nowISO } : {}),
    // Entered after the fact, so lifecycle stamps all read "now" — keeps the
    // funnel + back-half metrics consistent with the chosen status.
    ...(status !== "new" ? { firstTouchAt: nowISO } : {}),
    ...(status === "contacted" || status === "scheduled" || status === "closed"
      ? { contactedAt: nowISO }
      : {}),
    ...(status === "scheduled" ? { scheduledAt: nowISO } : {}),
    ...(status === "closed" ? { closedAt: nowISO } : {}),
    ...(status === "lost" ? { lostAt: nowISO } : {}),
    // If the owner opted OUT of Meta reporting for a closed sale, pre-stamp the
    // once-only guard so a later admin edit can never fire the Purchase either.
    ...(isClosedSale && !reportToMeta ? { purchaseSyncedAt: nowISO } : {}),
  };
  await addLead(lead);

  if (isClosedSale) {
    const margin =
      typeof expectedResale === "number"
        ? Math.max(0, expectedResale - (purchasePrice as number))
        : Number(process.env.META_PURCHASE_MARGIN_FALLBACK) || 1000;
    // Offline Meta Purchase — only when opted in and we have a match key. Once-only
    // via claimPurchaseSync; roll back on a failed send so a later edit retries.
    if (reportToMeta && (email || phone) && (await claimPurchaseSync(id))) {
      const ok = await sendCapiPurchase({
        eventId: `purchase-${id}`,
        value: margin,
        user: { email, phone, ...splitName(name), externalId: id, country: "ca" },
        customData: vehicle ? { content_name: `${vehicle.year} ${vehicle.make} ${vehicle.model}` } : undefined,
      });
      if (!ok) await releasePurchaseSync(id);
    }
    // GA4 close_convert_lead + first-party "Deal closed" timeline entry. GA4
    // no-ops without a client id (a call-in has no GA session); the timeline
    // entry still lands. Never throws.
    await emitLeadClosed(lead, margin);
  }

  return NextResponse.json({ ok: true, lead });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { type, id, patch } = await req.json().catch(() => ({}));
  if (!id || typeof patch !== "object") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const item =
    type === "referral"
      ? await updateReferral(id, patch)
      : await updateLead(id, patch);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Once a vehicle lead leaves "new" (owner reached them / deal resolved), cancel
  // its scheduled reminder-drip emails so we don't keep nudging. Best-effort.
  if (type !== "referral" && patch.status && patch.status !== "new") {
    const ids = (item as Lead).dripEmailIds;
    if (ids && ids.length) {
      await cancelScheduledEmails(ids);
      await updateLead(id, { dripEmailIds: [] });
    }
  }

  // Soft delete (archive): also cancel any scheduled nurture so a deleted lead
  // stops receiving drip emails. Stamp archivedAt on the way in.
  if (type !== "referral" && patch.archived === true) {
    const ids = (item as Lead).dripEmailIds;
    if (ids && ids.length) {
      await cancelScheduledEmails(ids);
      await updateLead(id, { dripEmailIds: [] });
    }
    if (!(item as Lead).archivedAt) await updateLead(id, { archivedAt: new Date().toISOString() });
  }

  // Stamp lifecycle timestamps on status transitions — these drive the cron
  // cadence (post-offer follow-ups, win-back, digest) and the back-half metrics.
  // Each is set once. The cron gates customer nurture on status directly, so it
  // keeps working after a lead leaves "new" (only closed/spam get nothing; "lost"
  // still gets the single Day-21 win-back).
  // Also computes the "wasNewlyX" booleans (from the PRE-update lead) that gate
  // the Meta/GA4/first-party emissions below, so a repeat PATCH to the same
  // status can never double-fire an event.
  let wasNewlyContacted = false;
  let wasNewlyScheduled = false;
  let wasNewlyClosed = false;
  let wasNewlyLost = false;
  let leadForEmit: Lead | null = null;
  if (type !== "referral" && patch.status) {
    const lead = item as Lead;
    const nowISO = new Date().toISOString();
    const ts: Partial<Lead> = {};
    if (patch.status !== "new" && patch.status !== "partial" && !lead.firstTouchAt) ts.firstTouchAt = nowISO;
    if (patch.status === "contacted" && !lead.contactedAt) {
      ts.contactedAt = nowISO;
      wasNewlyContacted = true;
    }
    if (patch.status === "scheduled" && !lead.scheduledAt) {
      ts.scheduledAt = nowISO;
      wasNewlyScheduled = true;
    }
    if (patch.status === "closed" && !lead.closedAt) {
      ts.closedAt = nowISO;
      wasNewlyClosed = true;
    }
    if (patch.status === "lost" && !lead.lostAt) {
      ts.lostAt = nowISO;
      wasNewlyLost = true;
      const lostReason = sanitizeLostReason((patch as { lostReason?: unknown }).lostReason);
      if (lostReason) ts.lostReason = lostReason;
    }
    if (patch.status === "spam" && !lead.spamAt) ts.spamAt = nowISO;
    if (Object.keys(ts).length) leadForEmit = await updateLead(id, ts);
  }
  const emitLead = leadForEmit || (item as Lead);
  if (type !== "referral" && wasNewlyContacted) await emitLeadContacted(emitLead);
  if (type !== "referral" && wasNewlyScheduled) await emitBookingConfirmed(emitLead, "system_generated");
  if (type !== "referral" && wasNewlyLost) await emitLeadLost(emitLead, emitLead.lostReason);

  // Offline-conversion loop: when a deal actually closes (status "closed" with a
  // real purchase price), tell Meta via a server-side "Purchase" event with the
  // expected deal margin, matched to the originating ad click by the fbc/fbp/hashed
  // email captured on the lead at creation. This lets Meta optimize for real
  // sellers, not just form-fills. Fired once (purchaseSyncedAt guards re-sends;
  // a stable eventId also lets Meta dedupe). Best-effort — never fails the PATCH.
  if (type !== "referral") {
    const lead = emitLead;
    const isSale =
      lead.status === "closed" && typeof lead.purchasePrice === "number" && lead.purchasePrice > 0;
    // value = expected deal margin so Meta value optimization learns profit, not
    // cost; fallback env META_PURCHASE_MARGIN_FALLBACK. Hoisted so the GA4
    // close_convert_lead event below reuses the SAME computation even when the
    // Purchase CAPI itself is skipped (missing purchasePrice, already synced, etc).
    const margin =
      typeof lead.expectedResale === "number" && typeof lead.purchasePrice === "number"
        ? Math.max(0, lead.expectedResale - lead.purchasePrice)
        : Number(process.env.META_PURCHASE_MARGIN_FALLBACK) || 1000;
    // Cheap pre-check skips the common already-synced case; claimPurchaseSync is
    // the authoritative atomic guard (conditional write) that prevents two
    // concurrent edits from both firing — last-writer-wins on updateLead can't be
    // trusted for a once-only side effect. consentDenied (submit-time opt-out)
    // also skips — and must NOT claim the once-only sync, so a later legitimate
    // change to this lead can't ever trigger the send retroactively.
    if (isSale && !lead.purchaseSyncedAt && !lead.consentDenied && (await claimPurchaseSync(lead.id))) {
      const ok = await sendCapiPurchase({
        eventId: `purchase-${lead.id}`,
        value: margin,
        user: {
          email: lead.contact.email,
          phone: lead.contact.phone,
          ...splitName(lead.contact.name),
          externalId: lead.id,
          country: "ca",
          fbc: lead.meta?.fbc,
          fbp: lead.meta?.fbp,
          clientIp: lead.meta?.clientIp,
          userAgent: lead.meta?.userAgent,
        },
        customData: lead.vehicle
          ? { content_name: `${lead.vehicle.year} ${lead.vehicle.make} ${lead.vehicle.model}` }
          : undefined,
      });
      // Roll back the claim if the send failed so a later edit retries it (the
      // stable eventId also lets Meta dedupe should a retry overlap).
      if (!ok) await releasePurchaseSync(lead.id);
    }
    // GA4 close_convert_lead — separate from (and in addition to) the Meta
    // Purchase above; fires once on the same first-time "closed" transition,
    // reusing the same margin value regardless of whether the Purchase CAPI
    // itself sent (e.g. missing purchasePrice uses the fallback margin).
    if (wasNewlyClosed) await emitLeadClosed(lead, margin);
  }
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await deleteLead(id);
  return NextResponse.json({ ok: true });
}
