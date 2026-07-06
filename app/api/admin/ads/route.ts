import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth";
import { getAdInsights, getAdLevelInsights, metaAdsConfigured } from "@/lib/metaAds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authed. Returns Meta ad-spend insights (empty + configured:false until the
// Marketing API token is set). The dashboard fetches this lazily and joins it
// to leads by campaign for cost-per-lead + ROAS. `?level=ad` returns
// creative-level rows instead (back-compat default is `campaign`).
export async function GET(req: NextRequest) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  const range = params.get("range") || "last_30d";
  const level = params.get("level") || "campaign";
  if (level === "ad") {
    const ads = await getAdLevelInsights(range);
    return NextResponse.json({ configured: metaAdsConfigured(), ads });
  }
  const insights = await getAdInsights(range);
  return NextResponse.json({ configured: metaAdsConfigured(), insights });
}
