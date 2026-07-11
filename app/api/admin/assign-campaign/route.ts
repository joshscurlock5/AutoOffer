import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { updateLead } from "@/lib/store";

export const runtime = "nodejs";

// Set (or clear) a MANUAL campaign attribution on one or more leads — the admin
// "assign to campaign" cleanup. This writes ONLY assignedCampaign; unlike the
// general leads PATCH it fires no status / Meta / GA4 side effects, so
// re-attributing a closed deal can never accidentally re-send an offline Purchase.
// assignedCampaign is kept separate from the tracked attribution.utmCampaign, so
// the correction shows only in the "my data" (corrected) view, never the Meta view.
export async function POST(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { leadIds, campaign } = await req.json().catch(() => ({}));
  if (!Array.isArray(leadIds) || !leadIds.length) {
    return NextResponse.json({ error: "leadIds required" }, { status: 400 });
  }
  // A blank/absent campaign CLEARS the assignment (un-assign).
  const value = typeof campaign === "string" && campaign.trim() ? campaign.trim().slice(0, 200) : undefined;
  const ids = leadIds.filter((id): id is string => typeof id === "string").slice(0, 5000);
  const results = await Promise.all(ids.map((id) => updateLead(id, { assignedCampaign: value }).catch(() => null)));
  return NextResponse.json({ ok: true, updated: results.filter(Boolean).length });
}
