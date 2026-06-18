import { NextRequest, NextResponse } from "next/server";
import { getEstimate } from "@/lib/valuation";
import { withClientIp, clientIpFrom } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** POST { year, make, model, mileageKm } -> { ok, estimate } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const estimate = await withClientIp(clientIpFrom(req), () =>
      getEstimate({
        year: body.year,
        make: String(body.make || ""),
        model: String(body.model || ""),
        mileageKm: Number(body.mileageKm || 0),
        trim: body.trim ? String(body.trim) : undefined,
      }),
    );
    return NextResponse.json({ ok: true, estimate });
  } catch (err) {
    console.error("POST /api/estimate failed", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
