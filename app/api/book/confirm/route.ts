import { NextRequest, NextResponse } from "next/server";
import { getLeadByBookingToken, updateLead } from "@/lib/store";
import { notifyOwner, leadLine } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/book/confirm?token=... — the "Confirm I'll be there" link from the
// day-of reminder. Marks the appointment confirmed, pings the owner, and shows a
// simple confirmation page. Always returns a friendly page (never leaks state).
export async function GET(req: NextRequest) {
  const token = (new URL(req.url).searchParams.get("token") || "").trim();
  const lead = token ? await getLeadByBookingToken(token) : null;
  if (lead && lead.status === "scheduled" && !lead.appointmentConfirmedAt) {
    await updateLead(lead.id, { appointmentConfirmedAt: new Date().toISOString() });
    await notifyOwner(`✅ Customer confirmed their inspection\n${leadLine(lead)}`);
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmed</title></head><body style="font-family:-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;background:#f4f6f8;margin:0;display:grid;place-items:center;min-height:100vh;"><div style="background:#fff;border-radius:16px;padding:36px 28px;max-width:420px;margin:16px;text-align:center;box-shadow:0 6px 30px rgba(0,0,0,.08);"><div style="font-size:46px;line-height:1;">&#9989;</div><h1 style="color:#0e1c2b;margin:14px 0 8px;font-size:24px;">You're confirmed!</h1><p style="color:#5b6b63;font-size:16px;line-height:1.55;margin:0;">Thanks — we'll see you at your scheduled time. Need to change anything? Just call or text us.</p></div></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
