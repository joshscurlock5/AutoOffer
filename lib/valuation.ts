import "server-only";
import { estimateOffer } from "./offer";
import { getMake } from "./vehicles";
import {
  getMarketPriceStats,
  getModelTrims,
  marketCheckEnabled,
  COUNTRY,
  STATES,
  type MarketPriceStats,
  type TrimOption,
} from "./marketcheck";
import { cacheGet, cachePut, reserveApiCall, recordApiCalls } from "./marketCache";
import { noteApiCall, noteCacheHit } from "./rateLimit";
import type { OfferEstimate } from "./types";

// ---------------------------------------------------------------------------
//  Valuation orchestrator.
//  Tries REAL Canadian market data (MarketCheck) first, then falls back to the
//  local estimate model in lib/offer.ts (only when no API key is configured).
//  The displayed range is DriveOffer's BUY range: a percentage of the dealer
//  asking anchor (default 72%–78% of it ≈ 22–28% under), nudged for mileage.
//  When a trim is supplied, pricing is scoped to that trim (with a fall back to
//  all-trims for the model when the trim has too few comps).
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();
const KM_PER_YEAR = 18000;
const COST_PER_KM = Number(process.env.MARKETCHECK_COST_PER_KM || 0.07);
const FLOOR = 900;

const MIN_COMPS = Number(process.env.MARKETCHECK_MIN_COMPS || 10);
// BUY range as a percentage of the dealer-asking anchor (asking is retail/marked
// up, so a real buy price sits well below it). 0.78 = 22% under, 0.72 = 28% under.
const OFFER_HIGH_PCT = Number(process.env.MARKETCHECK_OFFER_HIGH_PCT || 0.78);
const OFFER_LOW_PCT = Number(process.env.MARKETCHECK_OFFER_LOW_PCT || 0.72);
const MIN_RETAIL = Number(process.env.MARKETCHECK_MIN_RETAIL || 3000);
const CACHE_DAYS = Number(process.env.MARKETCHECK_CACHE_DAYS || 14);
const TRIM_CACHE_DAYS = Number(process.env.MARKETCHECK_TRIM_CACHE_DAYS || 30);
// Short negative-cache so a MarketCheck outage doesn't re-charge the budget on
// every identical request (~30 min by default).
const MISS_CACHE_DAYS = Number(process.env.MARKETCHECK_MISS_CACHE_DAYS || 0.02);
// The median already prices in typical mileage, so cap how far a low-mileage
// bump can push "retail" above the market median (prevents over-offers).
const RETAIL_CAP_MULT = Number(process.env.MARKETCHECK_RETAIL_CAP_MULT || 1.05);

const UNIQUE: OfferEstimate = { low: 0, high: 0, mid: 0, currency: "CAD", unique: true };

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export async function getEstimate(v: {
  year: number | string;
  make: string;
  model: string;
  mileageKm: number;
  trim?: string;
}): Promise<OfferEstimate> {
  const make = getMake(v.make);
  const year = Number(v.year);
  const mileage = Number(v.mileageKm);

  const unsure =
    !make ||
    v.make.trim().toLowerCase().startsWith("other") ||
    v.model === "Other" ||
    !year ||
    !Number.isFinite(year) ||
    !Number.isFinite(mileage) ||
    mileage < 0;

  // Unknown/odd vehicle → human-priced "unique" flow (same as the heuristic).
  if (unsure) return { ...UNIQUE };

  // No exact trim ("Not sure") → human custom-offer flow. We don't price across
  // all trims (would be inaccurate) and we don't spend a MarketCheck call on it.
  if (!v.trim || !String(v.trim).trim()) return { ...UNIQUE };

  if (marketCheckEnabled()) {
    let market: OfferEstimate | null = null;
    try {
      market = await marketOffer(v.make, v.model, year, mileage, v.trim);
    } catch {
      market = null;
    }
    if (market) return market;
    // MarketCheck is on but we couldn't confidently price this vehicle (too few
    // Canadian comps, or a transient error). Don't show a guessed number —
    // route to the human "custom offer" flow and collect contact info instead.
    return { ...UNIQUE };
  }

  // No MarketCheck key configured (local/dev) → fall back to the local model.
  return estimateOffer(v);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Cached + budget-guarded price stats for a make/model/year (optionally a trim). */
async function fetchStats(
  make: string,
  model: string,
  year: number,
  trim?: string,
): Promise<MarketPriceStats | null> {
  const tkey = trim && trim.trim() ? `:${norm(trim)}` : "";
  const cacheKey = `mc:${COUNTRY}:${norm(STATES)}:${norm(make)}:${norm(model)}:${year}${tkey}`;

  const cached = await cacheGet<any>(cacheKey);
  if (cached) {
    noteCacheHit();
    return cached.miss ? null : (cached as MarketPriceStats);
  }

  if (!(await reserveApiCall())) return null;
  noteApiCall();
  const res = await getMarketPriceStats({
    make,
    model,
    year,
    trim: trim && trim.trim() ? trim.trim() : undefined,
  });
  if (res.attempts > 1) {
    noteApiCall(res.attempts - 1);
    await recordApiCalls(res.attempts - 1);
  }
  if (res.stats) await cachePut(cacheKey, res.stats, CACHE_DAYS);
  else await cachePut(cacheKey, { miss: true }, MISS_CACHE_DAYS);
  return res.stats;
}

async function marketOffer(
  make: string,
  model: string,
  year: number,
  mileage: number,
  trim?: string,
): Promise<OfferEstimate | null> {
  // Try trim-specific comps first; if too thin, fall back to all trims.
  let stats = await fetchStats(make, model, year, trim);
  if ((!stats || stats.count < MIN_COMPS) && trim && trim.trim()) {
    stats = await fetchStats(make, model, year, undefined);
  }

  if (!stats || stats.count < MIN_COMPS || !stats.p50) return null;

  // "Retail" anchor = median asking, nudged for this car's mileage vs expected.
  const age = Math.max(0, CURRENT_YEAR - year);
  const expectedKm = age * KM_PER_YEAR;
  let retail = stats.p50 - (mileage - expectedKm) * COST_PER_KM;
  // The median already reflects typical mileage; don't let a low-mileage bump
  // push our BUY range above the market median (would over-offer cherry cars).
  retail = Math.min(retail, stats.p50 * RETAIL_CAP_MULT);

  // Very cheap cars → human custom-offer flow (percentages get noisy down low).
  if (retail < MIN_RETAIL) return null;

  // BUY range = a percentage of the asking anchor — scales correctly across price
  // tiers (unlike a flat dollar cut). Round BEFORE the inversion guard.
  const low = roundTo(Math.max(retail * OFFER_LOW_PCT, FLOOR), 50);
  let high = roundTo(retail * OFFER_HIGH_PCT, 50);
  if (high <= low) high = low + 500;

  return {
    low,
    high,
    mid: roundTo((low + high) / 2, 50),
    currency: "CAD",
    source: "market",
    comps: stats.count,
  };
}

/** Distinct trims (with live Canadian listing counts) for a year/make/model. */
export async function getTrims(opts: {
  make: string;
  model: string;
  year: number;
}): Promise<TrimOption[]> {
  if (!marketCheckEnabled()) return [];
  const { make, model, year } = opts;
  if (!getMake(make) || !model || !year || !Number.isFinite(year)) return [];

  const cacheKey = `trims:${COUNTRY}:${norm(STATES)}:${norm(make)}:${norm(model)}:${year}`;
  const cached = await cacheGet<any>(cacheKey);
  if (cached && Array.isArray(cached.trims)) return cached.trims as TrimOption[];
  if (cached && cached.miss) return [];

  if (!(await reserveApiCall())) return [];
  const res = await getModelTrims({ make, model, year });
  if (res.attempts > 1) await recordApiCalls(res.attempts - 1);
  const trims = res.trims || [];
  if (trims.length) await cachePut(cacheKey, { trims }, TRIM_CACHE_DAYS);
  else await cachePut(cacheKey, { miss: true }, MISS_CACHE_DAYS);
  return trims;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
