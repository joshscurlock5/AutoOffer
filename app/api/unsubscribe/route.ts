import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubToken } from "@/lib/unsubscribe";
import { getLeadByShortId, updateLead } from "@/lib/store";
import { notifyOwner, leadLine } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-click email unsubscribe. The "Unsubscribe" link in our emails carries a
// signed token (lib/unsubscribe.ts) that authorises opting out exactly one lead.
// Opting out sets emailOptOut, which stops marketing/nurture email only — the
// customer still gets transactional mail they're waiting on (offer, booking).
//
// GET  = the visible link a human clicks (returns a friendly confirmation page).
// POST = RFC 8058 one-click target, if we later add a List-Unsubscribe header.
// Both are idempotent and never leak whether the token matched a real lead.

async function optOut(token: string): Promise<void> {
  const leadId = verifyUnsubToken(token);
  if (!leadId) return;
  // getLeadByShortId matches on the full id too — use it to read current state
  // so a repeat click doesn't re-notify the owner.
  const { lead } = await getLeadByShortId(leadId);
  if (!lead || lead.emailOptOut) return;
  await updateLead(lead.id, { emailOptOut: true });
  await notifyOwner(`🚫 Unsubscribed from emails\n${leadLine(lead)}`, "updates");
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head><body style="font-family:-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;background:#f4f6f8;margin:0;display:grid;place-items:center;min-height:100vh;"><div style="background:#fff;border-radius:16px;padding:36px 28px;max-width:440px;margin:16px;text-align:center;box-shadow:0 6px 30px rgba(0,0,0,.08);"><div style="font-size:44px;line-height:1;">&#9993;</div><h1 style="color:#0e1c2b;margin:14px 0 8px;font-size:23px;">You're unsubscribed</h1><p style="color:#5b6b63;font-size:16px;line-height:1.55;margin:0;">You won't get any more marketing emails from DriveOffer. If you're mid-deal, we'll still send the essentials — like your offer or a booking confirmation. Changed your mind? Just call or text <a href="tel:+17809524504" style="color:#1A7F54;text-decoration:none;font-weight:600;">(780)&nbsp;952-4504</a>.</p></div></body></html>`;

export async function GET(req: NextRequest) {
  await optOut((new URL(req.url).searchParams.get("token") || "").trim());
  return new NextResponse(PAGE, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(req: NextRequest) {
  await optOut((new URL(req.url).searchParams.get("token") || "").trim());
  return new NextResponse(null, { status: 200 });
}
