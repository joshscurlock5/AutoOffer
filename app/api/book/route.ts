import { NextRequest, NextResponse } from "next/server";
import { getLeadByBookingToken, updateLead } from "@/lib/store";
import { availableDays, isValidSlot } from "@/lib/availability";
import { smsBookingConfirmation } from "@/lib/sms";
import { notifyOwner, leadLine } from "@/lib/notify";
import { clientIpFrom, allowRequest } from "@/lib/rateLimit";
import { formatEdmonton } from "@/lib/time";
import { emitBookingConfirmed } from "@/lib/leadStages";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// GET /api/book?token=... — vehicle/offer summary + the bookable days/slots.
export async function GET(req: NextRequest) {
  const token = str(new URL(req.url).searchParams.get("token"));
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });
  const lead = await getLeadByBookingToken(token);
  if (!lead) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const v = lead.vehicle;
  return NextResponse.json({
    ok: true,
    vehicle: v ? { year: v.year, make: v.make, model: v.model } : null,
    offer: lead.offer ? { low: lead.offer.low, high: lead.offer.high } : null,
    booked: lead.status === "scheduled" && lead.appointmentAt ? lead.appointmentAt : null,
    days: availableDays(Date.now()),
  });
}

// POST /api/book { token, startISO, location } — create/replace the booking.
export async function POST(req: NextRequest) {
  const ip = clientIpFrom(req);
  if (!(await allowRequest(ip, "book", 12, 3600))) {
    return NextResponse.json({ ok: false, error: "rate" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const token = str(body.token);
  const startISO = str(body.startISO);
  const location = str(body.location).slice(0, 300);
  if (!token || !startISO || !location) {
    return NextResponse.json({ ok: false, error: "missing" }, { status: 400 });
  }
  const lead = await getLeadByBookingToken(token);
  if (!lead) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!isValidSlot(startISO, Date.now())) {
    return NextResponse.json({ ok: false, error: "slot" }, { status: 400 });
  }

  const nowISO = new Date().toISOString();
  const wasNewlyScheduled = !lead.scheduledAt;
  const updated = await updateLead(lead.id, {
    appointmentAt: startISO,
    appointmentLocation: location,
    bookedByCustomer: true,
    status: "scheduled",
    scheduledAt: lead.scheduledAt || nowISO,
    firstTouchAt: lead.firstTouchAt || nowISO,
    apptRemindedAt: undefined,
    dayOfRemindedAt: undefined,
    appointmentConfirmedAt: undefined,
  });
  const finalLead: Lead = updated || { ...lead, appointmentAt: startISO, appointmentLocation: location, status: "scheduled" };

  // Best-effort owner alert (never fail the booking).
  await smsBookingConfirmation(finalLead);
  const when = formatEdmonton(startISO, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  await notifyOwner(`📅 Customer booked an inspection\n${leadLine(finalLead)}\n${when}\n📍 ${location}`, "bookings");
  // Meta/GA4/first-party close-loop event — only on the FIRST time this lead
  // gets scheduled (wasNewlyScheduled computed from the pre-update lead).
  if (wasNewlyScheduled) await emitBookingConfirmed(finalLead, "website");
  return NextResponse.json({ ok: true });
}
