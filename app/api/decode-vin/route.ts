import { NextRequest, NextResponse } from "next/server";
import { decodeVin, isValidVinFormat, type VinSpecs } from "@/lib/marketcheck";
import { cacheGet, cachePut, reserveApiCall, recordApiCalls } from "@/lib/marketCache";
import { canonicalMake } from "@/lib/vehicles";
import { getEstimate } from "@/lib/valuation";

export const runtime = "nodejs";

const MISS_DAYS = Number(process.env.MARKETCHECK_MISS_CACHE_DAYS || 0.02);

type CacheEntry = VinSpecs | { miss: true };

/**
 * POST { vin, mileageKm? } -> { ok, vehicle, estimate? }
 * Decodes a VIN (cached by VIN). If mileageKm is provided and the decode yields
 * year/make/model, also returns the estimate in the same call.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const vin = String(body.vin || "").trim().toUpperCase();
    const mileageKm = Number(body.mileageKm || 0);

    if (!isValidVinFormat(vin)) {
      return NextResponse.json({ ok: false, error: "invalid_vin" }, { status: 400 });
    }

    const cacheKey = `vin:${vin}`;
    const cached = await cacheGet<CacheEntry>(cacheKey);
    if (cached && "miss" in cached) {
      return NextResponse.json({ ok: false, error: "decode_failed" }, { status: 422 });
    }

    let specs: VinSpecs | null = cached ?? null;
    if (!specs) {
      if (!(await reserveApiCall())) {
        return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
      }
      const res = await decodeVin(vin);
      if (res.attempts > 1) await recordApiCalls(res.attempts - 1);
      if (res.specs) {
        // Store the catalog spelling so the estimate + the saved lead agree.
        specs = { ...res.specs, make: res.specs.make ? canonicalMake(res.specs.make) : res.specs.make };
        await cachePut(cacheKey, specs, 365);
      } else {
        await cachePut(cacheKey, { miss: true }, MISS_DAYS); // negative-cache transient failures
      }
    }

    if (!specs || (!specs.make && !specs.model)) {
      return NextResponse.json({ ok: false, error: "decode_failed" }, { status: 422 });
    }

    let estimate = null;
    if (specs.year && specs.make && specs.model && mileageKm > 0) {
      estimate = await getEstimate({
        year: specs.year,
        make: specs.make,
        model: specs.model,
        mileageKm,
      });
    }

    return NextResponse.json({ ok: true, vehicle: specs, estimate });
  } catch (err) {
    console.error("POST /api/decode-vin failed", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
