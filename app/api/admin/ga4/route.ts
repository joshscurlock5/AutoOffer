import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getGa4Traffic, ga4Configured } from "@/lib/ga4Data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authed. Returns aggregate GA4 traffic (null + configured:false until the
// service-account env vars are set). The dashboard fetches this lazily.
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const days = Math.max(1, Math.min(365, Number(new URL(req.url).searchParams.get("days")) || 30));
  const traffic = await getGa4Traffic(days);
  return NextResponse.json({ configured: ga4Configured(), traffic });
}
