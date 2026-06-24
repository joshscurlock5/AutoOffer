import { NextRequest, NextResponse } from "next/server";
import { getEstimate } from "@/lib/valuation";
import { withClientIp, clientIpFrom, allowRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** POST { year, make, model, mileageKm } -> { ok, estimate } */
export async function POST(req: NextRequest) {
  try {
    // Anti-spam: cap estimate requests per visitor (15/hr — generous vs real use,
    // where someone checks a handful of cars, but well below abuse). Fails open on
    // an unknown IP or a DB hiccup, so it never blocks a real customer by accident.
    const ip = clientIpFrom(req);
    if (!(await allowRequest(ip, "estimate", 15, 3600))) {
      return NextResponse.json({ error: "Too many requests. Please try again in a bit." }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const estimate = await withClientIp(ip, () =>
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
