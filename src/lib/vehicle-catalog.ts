export type VehicleCatalogCategory = "CAR" | "MOTOR";
export type PartTarget = VehicleCatalogCategory | "UNIVERSAL";

const VEHICLE_CATALOG: Record<VehicleCatalogCategory, Record<string, string[]>> = {
  CAR: {
    Toyota: [
      "Alphard", "Avanza", "Camry", "Corolla", "Corolla Cross", "C-HR", "Fortuner",
      "Hiace", "Hilux", "Land Cruiser", "Land Cruiser Prado", "Prius", "Raize", "RAV4",
      "Rush", "Sienna", "Vellfire", "Vios", "Yaris", "Yaris Cross",
    ],
    Honda: [
      "Accord", "BR-V", "City", "Civic", "CR-V", "Fit", "HR-V", "Jazz", "Odyssey",
    ],
    Lexus: ["ES", "GX", "IS", "LM", "LS", "LX", "NX", "RX", "UX"],
    Hyundai: ["Accent", "Creta", "Elantra", "Ioniq 5", "Kona", "Santa Fe", "Staria", "Tucson"],
    Kia: ["Carnival", "EV6", "K3", "K5", "Seltos", "Sorento", "Sportage"],
    Nissan: ["Almera", "Kicks", "Navara", "Patrol", "Terra", "X-Trail"],
    Mitsubishi: ["Attrage", "Outlander", "Pajero Sport", "Triton", "Xpander"],
    Ford: ["Everest", "Explorer", "Ranger", "Territory"],
    Mazda: ["Mazda2", "Mazda3", "BT-50", "CX-3", "CX-30", "CX-5", "CX-8", "CX-9"],
    Isuzu: ["D-Max", "MU-X"],
    Suzuki: ["Ertiga", "Jimny", "Swift", "Vitara", "XL7"],
    Subaru: ["Crosstrek", "Forester", "Outback", "WRX"],
    "Mercedes-Benz": ["C-Class", "E-Class", "G-Class", "GLC", "GLE", "GLS", "S-Class"],
    BMW: ["3 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X7"],
    Audi: ["A3", "A4", "A6", "Q3", "Q5", "Q7", "Q8"],
    "Land Rover": ["Defender", "Discovery", "Range Rover", "Range Rover Sport", "Range Rover Velar"],
    Porsche: ["Cayenne", "Macan", "Panamera", "Taycan"],
    BYD: ["Atto 3", "Dolphin", "Seal", "Song Plus"],
    Tesla: ["Model 3", "Model S", "Model X", "Model Y"],
    MG: ["MG 4", "MG 5", "ZS", "HS"],
    Chevrolet: ["Colorado", "Captiva", "Trailblazer"],
    Volvo: ["EX30", "XC40", "XC60", "XC90"],
  },
  MOTOR: {
    Honda: ["Air Blade", "ADV 160", "CBR150R", "CBR250RR", "Click 125", "Click 160", "Dream 125", "PCX 160", "Scoopy", "Wave 110", "Winner X"],
    Yamaha: ["Aerox", "Exciter 155", "Fino", "Mio", "MT-15", "NMAX", "R15", "XMAX"],
    Suzuki: ["Burgman", "GSX-R150", "Nex", "Raider R150", "Smash"],
    Kawasaki: ["KLX 150", "Ninja 250", "Ninja 400", "Ninja 650", "W175", "Z650"],
    Vespa: ["GTS 300", "Primavera", "Sprint"],
    GPX: ["Demon 150GR", "Legend 150"],
    BMW: ["G 310 GS", "R 1250 GS", "S 1000 RR"],
    Ducati: ["Monster", "Multistrada V4", "Panigale V4", "Scrambler"],
    KTM: ["Duke 200", "Duke 390", "RC 390"],
    "Royal Enfield": ["Classic 350", "Continental GT 650", "Himalayan", "Hunter 350"],
    SYM: ["Cruisym 300", "Jet X", "Orbit"],
    "Harley-Davidson": ["Iron 883", "Nightster", "Street Glide"],
    "Triumph": ["Bonneville T100", "Scrambler 400 X", "Tiger 900"],
  },
};

const PART_MANUFACTURERS = [
  "Brembo", "Bosch", "Denso", "D.I.D Japan", "Genuine Parts", "NGK", "Panasonic",
  "Philips", "Michelin", "Motul", "Pirelli", "Shell", "Yokohama",
];

const PART_MODELS = [
  "Air Filter", "Battery", "Brake Pads", "Brake Disc", "Chain and Sprocket Set",
  "Engine Oil", "Headlight Bulb", "Oil Filter", "Shock Absorber", "Spark Plug",
  "Tire", "Wheel Bearing",
];

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.localeCompare(b));
}

function findMake(category: VehicleCatalogCategory, make: string): string | undefined {
  const normalizedMake = make.trim().toLocaleLowerCase();
  return Object.keys(VEHICLE_CATALOG[category]).find(
    (catalogMake) => catalogMake.toLocaleLowerCase() === normalizedMake,
  );
}

export function getVehicleMakes(
  category: VehicleCatalogCategory,
  additionalMakes: string[] = [],
): string[] {
  return unique([...Object.keys(VEHICLE_CATALOG[category]), ...additionalMakes]);
}

export function getVehicleModels(category: VehicleCatalogCategory, make: string): string[] {
  const catalogMake = findMake(category, make);
  return catalogMake ? VEHICLE_CATALOG[category][catalogMake] : [];
}

export function getPartManufacturers(additionalMakes: string[] = []): string[] {
  return unique([
    ...PART_MANUFACTURERS,
    ...getVehicleMakes("CAR"),
    ...getVehicleMakes("MOTOR"),
    ...additionalMakes,
  ]);
}

export function getPartModels(): string[] {
  return PART_MODELS;
}

export function getCompatibleVehicleModels(target: string): string[] {
  const categories: VehicleCatalogCategory[] =
    target === "UNIVERSAL"
      ? ["CAR", "MOTOR"]
      : target === "CAR" || target === "MOTOR"
        ? [target]
        : [];

  return unique(categories.flatMap((category) =>
    Object.entries(VEHICLE_CATALOG[category]).flatMap(([make, models]) =>
      models.map((model) => `${make} ${model}`),
    ),
  ));
}
