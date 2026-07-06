import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import {
  getLeads,
  getReferrals,
  updateLead,
  deleteLead,
  updateReferral,
  claimPurchaseSync,
  releasePurchaseSync,
} from "@/lib/store";
import { cancelScheduledEmails } from "@/lib/email";
import { sendCapiPurchase, splitName } from "@/lib/metaCapi";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [leads, referrals] = await Promise.all([getLeads(), getReferrals()]);
  return NextResponse.json({ leads, referrals });
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
  if (type !== "referral" && patch.status) {
    const lead = item as Lead;
    const nowISO = new Date().toISOString();
    const ts: Partial<Lead> = {};
    if (patch.status !== "new" && patch.status !== "partial" && !lead.firstTouchAt) ts.firstTouchAt = nowISO;
    if (patch.status === "contacted" && !lead.contactedAt) ts.contactedAt = nowISO;
    if (patch.status === "scheduled" && !lead.scheduledAt) ts.scheduledAt = nowISO;
    if (patch.status === "closed" && !lead.closedAt) ts.closedAt = nowISO;
    if (Object.keys(ts).length) await updateLead(id, ts);
  }

  // Offline-conversion loop: when a deal actually closes (status "closed" with a
  // real purchase price), tell Meta via a server-side "Purchase" event with the
  // expected deal margin, matched to the originating ad click by the fbc/fbp/hashed
  // email captured on the lead at creation. This lets Meta optimize for real
  // sellers, not just form-fills. Fired once (purchaseSyncedAt guards re-sends;
  // a stable eventId also lets Meta dedupe). Best-effort — never fails the PATCH.
  if (type !== "referral") {
    const lead = item as Lead;
    const isSale =
      lead.status === "closed" && typeof lead.purchasePrice === "number" && lead.purchasePrice > 0;
    // Cheap pre-check skips the common already-synced case; claimPurchaseSync is
    // the authoritative atomic guard (conditional write) that prevents two
    // concurrent edits from both firing — last-writer-wins on updateLead can't be
    // trusted for a once-only side effect. consentDenied (submit-time opt-out)
    // also skips — and must NOT claim the once-only sync, so a later legitimate
    // change to this lead can't ever trigger the send retroactively.
    if (isSale && !lead.purchaseSyncedAt && !lead.consentDenied && (await claimPurchaseSync(lead.id))) {
      // value = expected deal margin so Meta value optimization learns profit,
      // not cost; fallback env META_PURCHASE_MARGIN_FALLBACK.
      const margin =
        typeof lead.expectedResale === "number" && typeof lead.purchasePrice === "number"
          ? Math.max(0, lead.expectedResale - lead.purchasePrice)
          : Number(process.env.META_PURCHASE_MARGIN_FALLBACK || 1000);
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
