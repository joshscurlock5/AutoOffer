import "server-only";
import { estimateOffer } from "./offer";
import { getMake } from "./vehicles";
import {
  getMarketPriceStats,
  marketCheckEnabled,
  COUNTRY,
  type MarketPriceStats,
} from "./marketcheck";
import { cacheGet, cachePut, reserveApiCall, recordApiCalls } from "./marketCache";
import type { OfferEstimate } from "./types";

// ---------------------------------------------------------------------------
//  Valuation orchestrator.
//  Tries REAL Canadian market data (MarketCheck) first, then falls back to the
//  local estimate model in lib/offer.ts (only when no API key is configured).
//  The displayed range is Auto Offer's BUY range: retail asking minus tunable
//  offsets (default $4,500 low / $2,000 high under retail), nudged for mileage.
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();
const KM_PER_YEAR = 18000;
const COST_PER_KM = Number(process.env.MARKETCHECK_COST_PER_KM || 0.07);
const FLOOR = 900;

const MIN_COMPS = Number(process.env.MARKETCHECK_MIN_COMPS || 10);
const LOW_OFFSET = Number(process.env.MARKETCHECK_OFFER_LOW_OFFSET || 4500);
const HIGH_OFFSET = Number(process.env.MARKETCHECK_OFFER_HIGH_OFFSET || 2000);
const CACHE_DAYS = Number(process.env.MARKETCHECK_CACHE_DAYS || 14);
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

export async function getEstimate(v: {
  year: number | string;
  make: string;
  model: string;
  mileageKm: number;
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

  if (marketCheckEnabled()) {
    let market: OfferEstimate | null = null;
    try {
      market = await marketOffer(v.make, v.model, year, mileage);
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
async function marketOffer(
  make: string,
  model: string,
  year: number,
  mileage: number,
): Promise<OfferEstimate | null> {
  const cacheKey = `mc:${COUNTRY}:${make.trim().toLowerCase()}:${model.trim().toLowerCase()}:${year}`;

  const cached = await cacheGet<any>(cacheKey);
  if (cached && cached.miss) return null; // recent failure cached → skip API, go unique
  let stats: MarketPriceStats | null = cached && !cached.miss ? (cached as MarketPriceStats) : null;

  if (!stats) {
    // Cache miss — reserve a call atomically (fails closed if over budget).
    if (!(await reserveApiCall())) return null;
    const res = await getMarketPriceStats({ make, model, year });
    if (res.attempts > 1) await recordApiCalls(res.attempts - 1); // count 429 retry's 2nd call
    stats = res.stats;
    if (stats) await cachePut(cacheKey, stats, CACHE_DAYS);
    else await cachePut(cacheKey, { miss: true }, MISS_CACHE_DAYS); // negative-cache the failure
  }

  if (!stats || stats.count < MIN_COMPS || !stats.p50) return null;

  // "Retail" anchor = median asking, nudged for this car's mileage vs expected.
  const age = Math.max(0, CURRENT_YEAR - year);
  const expectedKm = age * KM_PER_YEAR;
  let retail = stats.p50 - (mileage - expectedKm) * COST_PER_KM;
  // The median already reflects typical mileage; don't let a low-mileage bump
  // push our BUY range above the market median (would over-offer cherry cars).
  retail = Math.min(retail, stats.p50 * RETAIL_CAP_MULT);

  // Flat dollar offsets don't make sense below ~$3k — let the local model handle
  // very cheap cars instead.
  if (retail < FLOOR + HIGH_OFFSET) return null;

  // Round BEFORE the inversion guard so a thin band can't collapse to $X–$X.
  const low = roundTo(Math.max(retail - LOW_OFFSET, FLOOR), 50);
  let high = roundTo(retail - HIGH_OFFSET, 50);
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
/* eslint-enable @typescript-eslint/no-explicit-any */
