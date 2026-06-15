import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import {
  getLeads,
  getReferrals,
  updateLead,
  deleteLead,
  updateReferral,
} from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  if (!isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [leads, referrals] = await Promise.all([getLeads(), getReferrals()]);
  return NextResponse.json({ leads, referrals });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed()) {
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
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(req: NextRequest) {
  if (!isAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await deleteLead(id);
  return NextResponse.json({ ok: true });
}
