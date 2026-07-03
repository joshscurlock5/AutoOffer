import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getAdInsights, metaAdsConfigured } from "@/lib/metaAds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authed. Returns Meta ad-spend insights per campaign (empty + configured:false
// until the Marketing API token is set). The dashboard fetches this lazily and
// joins it to leads by campaign for cost-per-lead + ROAS.
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const range = new URL(req.url).searchParams.get("range") || "last_30d";
  const insights = await getAdInsights(range);
  return NextResponse.json({ configured: metaAdsConfigured(), insights });
}
