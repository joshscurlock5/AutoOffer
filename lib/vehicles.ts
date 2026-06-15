// Vehicle catalogue used by the "value your vehicle" form and the estimator.
// `base` is an approximate average new price in CAD; `retention` is how well
// the brand holds value per year. These feed lib/offer.ts. Tune freely.

export interface MakeData {
  name: string;
  base: number;
  retention: number;
  models: string[];
}

export const MAKES: MakeData[] = [
  {
    name: "Toyota",
    base: 40000,
    retention: 0.89,
    models: ["Corolla", "Corolla Cross", "Camry", "Prius", "RAV4", "Venza", "Highlander", "4Runner", "Tacoma", "Tundra", "Sequoia", "Sienna", "GR86", "Supra"],
  },
  {
    name: "Honda",
    base: 37000,
    retention: 0.88,
    models: ["Civic", "Accord", "Fit", "HR-V", "CR-V", "Passport", "Pilot", "Ridgeline", "Odyssey", "Civic Type R"],
  },
  {
    name: "Ford",
    base: 46000,
    retention: 0.83,
    models: ["Fiesta", "Focus", "Fusion", "Mustang", "EcoSport", "Escape", "Bronco Sport", "Edge", "Bronco", "Explorer", "Expedition", "Ranger", "Maverick", "F-150", "F-250", "F-350"],
  },
  {
    name: "Chevrolet",
    base: 44000,
    retention: 0.82,
    models: ["Spark", "Sonic", "Cruze", "Malibu", "Camaro", "Corvette", "Trax", "Trailblazer", "Equinox", "Blazer", "Traverse", "Tahoe", "Suburban", "Colorado", "Silverado 1500", "Silverado 2500"],
  },
  {
    name: "GMC",
    base: 50000,
    retention: 0.83,
    models: ["Terrain", "Acadia", "Yukon", "Yukon XL", "Canyon", "Sierra 1500", "Sierra 2500"],
  },
  {
    name: "Ram",
    base: 52000,
    retention: 0.84,
    models: ["1500", "2500", "3500", "ProMaster", "ProMaster City"],
  },
  {
    name: "Dodge",
    base: 40000,
    retention: 0.82,
    models: ["Charger", "Challenger", "Durango", "Journey", "Grand Caravan", "Hornet"],
  },
  {
    name: "Jeep",
    base: 45000,
    retention: 0.83,
    models: ["Renegade", "Compass", "Cherokee", "Grand Cherokee", "Wrangler", "Gladiator", "Wagoneer"],
  },
  {
    name: "Nissan",
    base: 35000,
    retention: 0.81,
    models: ["Versa", "Sentra", "Altima", "Maxima", "Kicks", "Qashqai", "Rogue", "Murano", "Pathfinder", "Armada", "Frontier", "Titan", "Z", "GT-R"],
  },
  {
    name: "Hyundai",
    base: 34000,
    retention: 0.83,
    models: ["Accent", "Elantra", "Sonata", "Venue", "Kona", "Tucson", "Santa Fe", "Palisade", "Santa Cruz", "Ioniq 5", "Ioniq 6"],
  },
  {
    name: "Kia",
    base: 33000,
    retention: 0.83,
    models: ["Rio", "Forte", "K5", "Stinger", "Soul", "Seltos", "Niro", "Sportage", "Sorento", "Telluride", "Carnival", "EV6"],
  },
  {
    name: "Mazda",
    base: 33000,
    retention: 0.85,
    models: ["Mazda3", "Mazda6", "MX-5 Miata", "CX-30", "CX-5", "CX-50", "CX-9", "CX-90"],
  },
  {
    name: "Subaru",
    base: 36000,
    retention: 0.86,
    models: ["Impreza", "Legacy", "WRX", "BRZ", "Crosstrek", "Forester", "Outback", "Ascent"],
  },
  {
    name: "Volkswagen",
    base: 36000,
    retention: 0.81,
    models: ["Golf", "GTI", "Jetta", "Passat", "Arteon", "Taos", "Tiguan", "Atlas", "Atlas Cross Sport", "ID.4"],
  },
  {
    name: "Volvo",
    base: 55000,
    retention: 0.78,
    models: ["S60", "S90", "V60", "XC40", "XC60", "XC90"],
  },
  {
    name: "BMW",
    base: 60000,
    retention: 0.79,
    models: ["2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "X1", "X3", "X4", "X5", "X6", "X7", "Z4", "i4", "iX"],
  },
  {
    name: "Mercedes-Benz",
    base: 65000,
    retention: 0.78,
    models: ["A-Class", "C-Class", "E-Class", "S-Class", "CLA", "GLA", "GLB", "GLC", "GLE", "GLS", "G-Class", "EQB", "EQE"],
  },
  {
    name: "Audi",
    base: 58000,
    retention: 0.79,
    models: ["A3", "A4", "A5", "A6", "A7", "Q3", "Q5", "Q7", "Q8", "e-tron", "TT", "R8"],
  },
  {
    name: "Lexus",
    base: 55000,
    retention: 0.86,
    models: ["IS", "ES", "LS", "UX", "NX", "RX", "GX", "LX", "RC", "RZ"],
  },
  {
    name: "Acura",
    base: 47000,
    retention: 0.84,
    models: ["ILX", "TLX", "Integra", "RDX", "MDX"],
  },
  {
    name: "Infiniti",
    base: 50000,
    retention: 0.78,
    models: ["Q50", "Q60", "QX50", "QX55", "QX60", "QX80"],
  },
  {
    name: "Tesla",
    base: 60000,
    retention: 0.82,
    models: ["Model 3", "Model Y", "Model S", "Model X", "Cybertruck"],
  },
  {
    name: "Chrysler",
    base: 42000,
    retention: 0.80,
    models: ["300", "Pacifica", "Voyager"],
  },
  {
    name: "Buick",
    base: 40000,
    retention: 0.81,
    models: ["Encore", "Encore GX", "Envision", "Enclave"],
  },
  {
    name: "Cadillac",
    base: 62000,
    retention: 0.79,
    models: ["CT4", "CT5", "XT4", "XT5", "XT6", "Escalade", "LYRIQ"],
  },
  {
    name: "Lincoln",
    base: 60000,
    retention: 0.80,
    models: ["Corsair", "Nautilus", "Aviator", "Navigator"],
  },
  {
    name: "Mitsubishi",
    base: 30000,
    retention: 0.80,
    models: ["Mirage", "RVR", "Eclipse Cross", "Outlander", "Outlander PHEV"],
  },
  {
    name: "Genesis",
    base: 55000,
    retention: 0.80,
    models: ["G70", "G80", "G90", "GV60", "GV70", "GV80"],
  },
  {
    name: "Porsche",
    base: 95000,
    retention: 0.85,
    models: ["718 Boxster", "718 Cayman", "911", "Panamera", "Macan", "Cayenne", "Taycan"],
  },
  {
    name: "Land Rover",
    base: 78000,
    retention: 0.74,
    models: ["Range Rover", "Range Rover Sport", "Range Rover Velar", "Range Rover Evoque", "Discovery", "Discovery Sport", "Defender"],
  },
  {
    name: "Jaguar",
    base: 65000,
    retention: 0.72,
    models: ["XE", "XF", "F-TYPE", "E-PACE", "F-PACE", "I-PACE"],
  },
  {
    name: "MINI",
    base: 35000,
    retention: 0.80,
    models: ["Cooper", "Clubman", "Countryman"],
  },
  {
    name: "Fiat",
    base: 28000,
    retention: 0.74,
    models: ["500", "500X"],
  },
  {
    name: "Other / Not listed",
    base: 32000,
    retention: 0.80,
    models: ["Other"],
  },
];

export function getMake(name: string): MakeData | undefined {
  return MAKES.find((m) => m.name === name);
}

export function modelsFor(makeName: string): string[] {
  return getMake(makeName)?.models ?? [];
}

// Year dropdown: a year ahead of the current model year down to 1990.
const NEWEST_YEAR = 2027;
const OLDEST_YEAR = 1990;
export const YEARS: number[] = Array.from(
  { length: NEWEST_YEAR - OLDEST_YEAR + 1 },
  (_, i) => NEWEST_YEAR - i,
);
