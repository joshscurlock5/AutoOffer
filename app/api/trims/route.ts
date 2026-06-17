import { NextRequest, NextResponse } from "next/server";
import { getTrims } from "@/lib/valuation";

export const runtime = "nodejs";

/** GET ?make=&model=&year= -> { ok, trims: [{item,count}] } (empty if unavailable). */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const make = String(sp.get("make") || "");
    const model = String(sp.get("model") || "");
    const year = Number(sp.get("year") || 0);
    if (!make || !model || !year) {
      return NextResponse.json({ ok: true, trims: [] });
    }
    const trims = await getTrims({ make, model, year });
    return NextResponse.json({ ok: true, trims });
  } catch (err) {
    console.error("GET /api/trims failed", err);
    return NextResponse.json({ ok: true, trims: [] });
  }
}
