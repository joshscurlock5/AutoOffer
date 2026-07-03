import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getAnalytics } from "@/lib/analyticsData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authed like the other admin routes — returns the per-person profiles +
// dashboard aggregates. Used by the smoke test + any future programmatic access
// (the admin page itself computes server-side for a fast first paint).
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await getAnalytics();
  return NextResponse.json(data);
}
