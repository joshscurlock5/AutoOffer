import "server-only";

// ---------------------------------------------------------------------------
//  MarketCheck API client (server-only).
//  - decodeVin(): turns a 17-char VIN into year/make/model/trim.
//  - getMarketPriceStats(): real Canadian asking-price percentiles for a
//    make/model over a year window (exact-year queries are too thin in CA).
//  Both no-op (return null) unless MARKETCHECK_API_KEY is set, so the site
//  runs fine without it (falls back to the local estimate model).
//  Each function also reports `attempts` = the number of real HTTP requests
//  issued, so callers can bill the monthly budget accurately (a 429 retry is 2).
// ---------------------------------------------------------------------------

const BASE = "https://api.marketcheck.com/v2";
const API_KEY = process.env.MARKETCHECK_API_KEY || "";
export const COUNTRY = process.env.MARKETCHECK_COUNTRY || "ca";
const TIMEOUT_MS = Number(process.env.MARKETCHECK_TIMEOUT_MS || 4500);
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_WINDOW = Number(process.env.MARKETCHECK_YEAR_WINDOW || 2);

export function marketCheckEnabled(): boolean {
  return Boolean(API_KEY);
}

/** Basic 17-char VIN format (excludes I, O, Q). */
export function isValidVinFormat(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin.trim().toUpperCase());
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface FetchResult {
  data: any | null;
  /** Number of real HTTP requests actually issued (for budget accounting). */
  attempts: number;
}

async function mcFetch(path: string): Promise<FetchResult> {
  if (!API_KEY) return { data: null, attempts: 0 };
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}api_key=${encodeURIComponent(API_KEY)}`;
  let attempts = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    attempts += 1; // a real request is about to leave the server
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status === 429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 700)); // one backoff on rate limit
        continue;
      }
      if (!res.ok) return { data: null, attempts };
      return { data: await res.json(), attempts };
    } catch {
      clearTimeout(timer);
      return { data: null, attempts };
    }
  }
  return { data: null, attempts };
}

export interface VinSpecs {
  /** True when the VIN check digit validates. Specs may still be present if false. */
  valid: boolean;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  bodyType?: string;
  drivetrain?: string;
  transmission?: string;
  fuelType?: string;
}

export async function decodeVin(vin: string): Promise<{ specs: VinSpecs | null; attempts: number }> {
  const clean = vin.trim().toUpperCase();
  if (!isValidVinFormat(clean)) return { specs: null, attempts: 0 };
  const { data, attempts } = await mcFetch(`/decode/car/${encodeURIComponent(clean)}/specs`);
  if (!data || (!data.make && !data.model && !data.year)) return { specs: null, attempts };
  return {
    attempts,
    specs: {
      valid: Boolean(data.is_valid),
      year: data.year ? Number(data.year) : undefined,
      make: data.make || undefined,
      model: data.model || undefined,
      trim: data.trim || undefined,
      bodyType: data.body_type || undefined,
      drivetrain: data.drivetrain || undefined,
      transmission: data.transmission || undefined,
      fuelType: data.fuel_type || undefined,
    },
  };
}

export interface MarketPriceStats {
  count: number;
  median: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  mean: number | null;
}

function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function yearList(year: number): string {
  const ys: number[] = [];
  for (let y = year - YEAR_WINDOW; y <= year + YEAR_WINDOW; y++) {
    if (y >= 1990 && y <= CURRENT_YEAR + 1) ys.push(y);
  }
  return ys.join(",");
}

/** Canadian used-listing asking-price stats for a make/model over a year window. */
export async function getMarketPriceStats(opts: {
  make: string;
  model: string;
  year: number;
}): Promise<{ stats: MarketPriceStats | null; attempts: number }> {
  const { make, model, year } = opts;
  if (!make || !model || !year) return { stats: null, attempts: 0 };
  const params = new URLSearchParams({
    country: COUNTRY,
    car_type: "used",
    make: make.trim().toLowerCase(),
    model: model.trim().toLowerCase(),
    year: yearList(year),
    rows: "0",
    stats: "price",
  });
  const { data, attempts } = await mcFetch(`/search/car/active?${params.toString()}`);
  if (!data || !data.stats || !data.stats.price) return { stats: null, attempts };
  const p = data.stats.price;
  const pct = p.percentiles || {};
  return {
    attempts,
    stats: {
      count: Number(data.num_found ?? p.count ?? 0),
      median: numOrNull(p.median),
      p25: numOrNull(pct["25.0"]),
      p50: numOrNull(pct["50.0"] ?? p.median),
      p75: numOrNull(pct["75.0"]),
      mean: numOrNull(p.mean),
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
