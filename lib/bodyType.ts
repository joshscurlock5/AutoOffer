// Classify a vehicle into a coarse body type from its make + model, so the
// offer screen can show a matching illustration. Pure and client-safe (no deps,
// no server-only imports) — derived from the curated catalogue in vehicles.ts.

export type BodyType = "truck" | "suv" | "van" | "coupe" | "hatch" | "sedan";

export function classifyBodyType(make: string, model: string): BodyType {
  const mk = (make || "").trim().toLowerCase();
  const md = (model || "").trim().toLowerCase();
  if (!md) return "sedan";

  const has = (...keys: string[]) => keys.some((k) => md.includes(k));

  // --- Pickups -------------------------------------------------------------
  if (
    has(
      "f-150", "f-250", "f-350", "silverado", "sierra", "tacoma", "tundra", "ridgeline",
      "ranger", "maverick", "colorado", "canyon", "gladiator", "frontier", "titan",
      "santa cruz", "cybertruck"
    ) ||
    (mk === "ram" && /^\d{3,4}$/.test(md)) // Ram 1500 / 2500 / 3500
  ) return "truck";

  // --- Vans / minivans -----------------------------------------------------
  if (has("sienna", "odyssey", "caravan", "promaster", "pacifica", "voyager", "carnival", "sedona", "transit", "quest"))
    return "van";

  // --- Coupes / roadsters / sports cars ------------------------------------
  if (
    has(
      "mustang", "camaro", "corvette", "challenger", "supra", "gr86", " 86", "brz", "miata", "mx-5",
      "boxster", "cayman", "911", "f-type", "r8", " tt", "z4", "370z", "350z"
    ) ||
    (mk === "audi" && md === "tt") ||
    (mk === "nissan" && (md === "z" || md === "gt-r")) ||
    (mk === "lexus" && md === "rc")
  ) return "coupe";

  // --- Hatchbacks ----------------------------------------------------------
  if (has("fit", "fiesta", "focus", "spark", "prius", "golf", "gti", "mirage", "veloster", "type r"))
    return "hatch";

  // --- SUVs / crossovers ---------------------------------------------------
  // Brand-systematic naming first (German + luxury lines are predictable).
  if (
    (mk === "bmw" && (/^x\d/.test(md) || md === "ix")) ||
    (mk === "audi" && (/^q\d/.test(md) || md === "e-tron")) ||
    (mk === "mercedes-benz" && (md.startsWith("gl") || md.startsWith("g-") || md === "eqb")) ||
    (mk === "volvo" && md.startsWith("xc")) ||
    (mk === "cadillac" && (md.startsWith("xt") || has("escalade", "lyriq"))) ||
    (mk === "infiniti" && md.startsWith("qx")) ||
    (mk === "lexus" && (md === "ux" || md === "nx" || md === "rx" || md === "gx" || md === "lx" || md === "rz")) ||
    (mk === "genesis" && md.startsWith("gv")) ||
    (mk === "mazda" && md.startsWith("cx")) ||
    (mk === "acura" && (md === "rdx" || md === "mdx")) ||
    (mk === "porsche" && has("macan", "cayenne")) ||
    (mk === "land rover") ||
    (mk === "jaguar" && md.includes("pace")) ||
    (mk === "tesla" && (md === "model y" || md === "model x")) ||
    (mk === "buick" && has("encore", "envision", "enclave")) ||
    (mk === "lincoln" && has("corsair", "nautilus", "aviator", "navigator"))
  ) return "suv";

  // Mainstream SUV / crossover model keywords.
  if (
    has(
      "rav4", "venza", "corolla cross", "4runner", "highlander", "sequoia", "hr-v", "cr-v", "crv", "passport", "pilot",
      "ecosport", "escape", "bronco", "edge", "explorer", "expedition", "trax", "trailblazer", "equinox", "blazer",
      "traverse", "tahoe", "suburban", "terrain", "acadia", "yukon", "renegade", "compass", "cherokee", "wrangler",
      "wagoneer", "durango", "journey", "hornet", "kicks", "qashqai", "rogue", "murano", "pathfinder", "armada",
      "venue", "kona", "tucson", "santa fe", "palisade", "soul", "seltos", "niro", "sportage", "sorento", "telluride", "ev6",
      "crosstrek", "forester", "outback", "ascent", "taos", "tiguan", "atlas", "id.4", "rvr", "eclipse cross", "outlander",
      "range rover", "discovery", "defender"
    )
  ) return "suv";

  // --- Default -------------------------------------------------------------
  return "sedan";
}

export const BODY_TYPE_LABEL: Record<BodyType, string> = {
  truck: "Pickup truck",
  suv: "SUV",
  van: "Van",
  coupe: "Coupe",
  hatch: "Hatchback",
  sedan: "Sedan",
};
