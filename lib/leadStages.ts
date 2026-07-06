import "server-only";
import type { Lead, SiteEvent } from "@/lib/types";
import { addEvents } from "@/lib/store";
import { sendGa4Event } from "@/lib/ga4Mp";
import { sendCapiStage, splitName } from "@/lib/metaCapi";

// ===========================================================================
//  Meta/GA4/first-party closed-loop layer. Post-submit lead-lifecycle
//  transitions (contacted, offer sent, booked, closed, lost) fan out here to
//  all three destinations in one place, instead of each call site hand-rolling
//  its own sends. Every function is a no-op on consentDenied (covers the
//  first-party stream too) and never throws — these run after the database
//  write that actually matters.
// ===========================================================================

/** Build one first-party SiteEvent row for a lead-lifecycle transition. */
function fpEvent(lead: Lead, name: string, params?: Record<string, string | number | boolean>): SiteEvent {
  const now = new Date().toISOString();
  return {
    sessionId: lead.behavior?.sessionId || "lead:" + lead.id,
    sk: `${now}#${Math.random().toString(36).slice(2, 6)}`,
    n: name,
    ...(params ? { p: params } : {}),
    path: "server",
    at: now,
    leadId: lead.id,
    ttl: Math.floor(Date.now() / 1000) + 365 * 86400,
  };
}

/** Meta CapiUser match keys shared by every stage event (meta + contact). */
function stageUser(lead: Lead) {
  return {
    email: lead.contact.email,
    phone: lead.contact.phone,
    ...splitName(lead.contact.name),
    externalId: lead.id,
    country: "ca",
    fbc: lead.meta?.fbc,
    fbp: lead.meta?.fbp,
    clientIp: lead.meta?.clientIp,
    userAgent: lead.meta?.userAgent,
  };
}

export async function emitLeadContacted(lead: Lead): Promise<void> {
  if (lead.consentDenied) return;
  try {
    await Promise.allSettled([
      sendGa4Event({ name: "working_lead", clientId: lead.gaClientId, sessionId: lead.gaSessionId }),
      addEvents([fpEvent(lead, "lead_contacted")]),
    ]);
  } catch {
    /* best-effort */
  }
}

export async function emitOfferSent(lead: Lead): Promise<void> {
  if (lead.consentDenied) return;
  try {
    await Promise.allSettled([
      sendCapiStage({
        eventName: "OfferSent",
        eventId: "offer-" + lead.id,
        actionSource: "system_generated",
        user: stageUser(lead),
      }),
      addEvents([fpEvent(lead, "offer_sent")]),
    ]);
  } catch {
    /* best-effort */
  }
}

export async function emitBookingConfirmed(
  lead: Lead,
  actionSource: "website" | "system_generated",
): Promise<void> {
  if (lead.consentDenied) return;
  try {
    await Promise.allSettled([
      sendCapiStage({
        eventName: "Schedule",
        eventId: "schedule-" + lead.id,
        actionSource,
        user: stageUser(lead),
      }),
      sendGa4Event({ name: "appointment_booked", clientId: lead.gaClientId, sessionId: lead.gaSessionId }),
      addEvents([fpEvent(lead, "booking_confirmed")]),
    ]);
  } catch {
    /* best-effort */
  }
}

export async function emitLeadClosed(lead: Lead, margin: number): Promise<void> {
  if (lead.consentDenied) return;
  try {
    await Promise.allSettled([
      sendGa4Event({
        name: "close_convert_lead",
        clientId: lead.gaClientId,
        sessionId: lead.gaSessionId,
        params: { currency: "CAD", value: margin },
      }),
      addEvents([fpEvent(lead, "lead_closed")]),
    ]);
  } catch {
    /* best-effort */
  }
}

export async function emitLeadLost(lead: Lead, reason?: string): Promise<void> {
  if (lead.consentDenied) return;
  try {
    await Promise.allSettled([
      sendGa4Event({
        name: "close_unconvert_lead",
        clientId: lead.gaClientId,
        sessionId: lead.gaSessionId,
        params: reason ? { unconvert_reason: reason } : {},
      }),
      addEvents([fpEvent(lead, "lead_lost")]),
    ]);
  } catch {
    /* best-effort */
  }
}
