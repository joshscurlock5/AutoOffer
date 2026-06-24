import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getEstimate } from "@/lib/valuation";
import { withClientIp, clientIpFrom, allowRequest, getEstimateTelemetry } from "@/lib/rateLimit";
import { addLookup } from "@/lib/store";
import type { Lookup } from "@/lib/types";

export const runtime = "nodejs";

/** POST { year, make, model, mileageKm, trim? } -> { ok, estimate, lookupId? } */
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
    const year = body.year;
    const make = String(body.make || "").trim();
    const model = String(body.model || "").trim();
    const mileageKm = Number(body.mileageKm || 0);
    const trim = body.trim ? String(body.trim).trim() : undefined;

    // Capture the cache-vs-live telemetry INSIDE the request scope.
    let tele = { apiCalls: 0, cacheHits: 0 };
    const estimate = await withClientIp(ip, async () => {
      const est = await getEstimate({ year, make, model, mileageKm, trim });
      tele = getEstimateTelemetry();
      return est;
    });

    // Log this lookup for the admin "API Calls" view (best-effort — never blocks
    // or fails the estimate). Only real vehicle lookups; skip empty/junk probes.
    let lookupId: string | undefined;
    if (make && model && year) {
      lookupId = crypto.randomUUID();
      const lookup: Lookup = {
        id: lookupId,
        createdAt: new Date().toISOString(),
        vehicle: { year, make, model, trim: trim || undefined, mileageKm },
        outcome: estimate.unique ? "unique" : "priced",
        estimate: estimate.unique
          ? undefined
          : {
              low: estimate.low,
              high: estimate.high,
              mid: estimate.mid,
              source: estimate.source,
              comps: estimate.comps,
            },
        apiCalls: tele.apiCalls,
        cached: tele.cacheHits > 0,
        converted: false,
      };
      try {
        await addLookup(lookup);
      } catch {
        lookupId = undefined; // logging failed — don't hand the client a dead id
      }
    }

    return NextResponse.json({ ok: true, estimate, lookupId });
  } catch (err) {
    console.error("POST /api/estimate failed", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
