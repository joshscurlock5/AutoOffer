import { getMake } from "./vehicles";
import type { OfferEstimate, VehicleInfo } from "./types";

// ---------------------------------------------------------------------------
//  Estimated-offer model.
//  This produces a believable price RANGE. The firm offer is always made by a
//  human after seeing photos + info — this just sets customer expectations.
//  Tune the constants below.
// ---------------------------------------------------------------------------

const CURRENT_YEAR = 2026;
const KM_PER_YEAR = 18000; // typical Canadian annual mileage
const COST_PER_KM = 0.07; // value lost per km above/below expected
const FLOOR = 900; // we still buy older cars
const SPREAD = 0.05; // +/- range around the midpoint

// Model-name keyword multipliers (trucks/SUVs hold more value than the brand
// average; economy cars less).
const MULTIPLIERS: { test: RegExp; factor: number }[] = [
  { test: /(f-?[235]50|silverado|sierra|\bram\b|1500|2500|3500|tundra|titan|gladiator)/i, factor: 1.45 },
  { test: /(tacoma|frontier|ranger|colorado|canyon|maverick|ridgeline|santa cruz)/i, factor: 1.3 },
  { test: /(tahoe|suburban|yukon|expedition|sequoia|navigator|escalade|wagoneer|armada|qx80|lx\b|gx\b)/i, factor: 1.4 },
  { test: /(4runner|wrangler|bronco\b|defender|land cruiser|g-class)/i, factor: 1.35 },
  { test: /(rav4|cr-v|cx-5|cx-50|cx-90|rogue|tucson|santa fe|equinox|escape|forester|outback|highlander|pilot|telluride|palisade|grand cherokee|explorer)/i, factor: 1.18 },
  { test: /(corvette|911|gt-r|type r|\bwrx\b|supra|m[2-8]\b|amg|rs\b|f-type)/i, factor: 1.3 },
  { test: /(mirage|spark|sonic|rio|accent|versa|fit|fiesta|500\b)/i, factor: 0.72 },
];

function modelMultiplier(model: string): number {
  for (const m of MULTIPLIERS) if (m.test.test(model)) return m.factor;
  return 1;
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/**
 * Returns an estimate, or an estimate flagged `unique: true` when we can't
 * confidently price the vehicle (unknown make → human callback flow).
 */
export function estimateOffer(v: {
  year: number | string;
  make: string;
  model: string;
  mileageKm: number;
}): OfferEstimate {
  const make = getMake(v.make);
  const year = Number(v.year);
  const mileage = Number(v.mileageKm);

  const unsure =
    !make ||
    v.make.startsWith("Other") ||
    v.model === "Other" ||
    !year ||
    isNaN(year) ||
    isNaN(mileage);

  if (unsure || !make) {
    return { low: 0, high: 0, mid: 0, currency: "CAD", unique: true };
  }

  const age = Math.max(0, CURRENT_YEAR - year);
  let value = make.base * Math.pow(make.retention, age);
  value *= modelMultiplier(v.model);

  // Mileage adjustment relative to what's expected for the age.
  const expectedKm = age * KM_PER_YEAR;
  value -= (mileage - expectedKm) * COST_PER_KM;

  // A nearly-new car can't be offered more than ~just under its base price.
  value = Math.min(value, make.base * modelMultiplier(v.model) * 1.02);
  value = Math.max(value, FLOOR);

  const mid = roundTo(value, 50);
  const low = roundTo(mid * (1 - SPREAD), 50);
  const high = roundTo(mid * (1 + SPREAD), 50);

  return { low, high, mid, currency: "CAD" };
}

export function estimateForVehicle(v: VehicleInfo): OfferEstimate {
  return estimateOffer({
    year: v.year,
    make: v.make,
    model: v.model,
    mileageKm: v.mileageKm,
  });
}
