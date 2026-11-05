/**
 * Canonical listing/filter option constants.
 *
 * Single source of truth for enum-ish UI options. These must stay in sync with
 * the Prisma schema values (e.g. `Vehicle.partCategory` in
 * prisma/schema.prisma) so that what sellers submit is exactly what the search
 * filters can match. Previously each screen declared its own copy, which
 * drifted (seller part categories like `BRAKES_SUSPENSION` never matched the
 * browse filter list), making spare-part listings undiscoverable.
 */

export const BODY_TYPES = ["SUV", "SEDAN", "PICKUP", "VAN", "HATCHBACK", "COUPE"];
export const MOTOR_BODY_TYPES = ["SCOOTER", "CUB", "SPORT", "CRUISER", "DIRT", "ELECTRIC", "OTHER"];

/** Canonical spare-part categories (matches Vehicle.partCategory + i18n labels). */
export const PART_CATEGORIES = [
  "TIRES_WHEELS",
  "BRAKES_SUSPENSION",
  "BATTERY_ELECTRICAL",
  "ENGINE_TRANSMISSION",
  "LIGHTS_BULBS",
  "BODY_MIRRORS",
  "OILS_LUBRICANTS",
  "ACCESSORIES",
];

export const PART_TARGETS = ["CAR", "MOTOR", "UNIVERSAL"];
export const PART_CONDITIONS = ["BRAND_NEW", "USED_GENUINE", "AFTERMARKET"];

export const FUELS = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"];
export const TRANSMISSIONS = ["AUTOMATIC", "MANUAL"];
export const DRIVETRAINS = ["FWD", "RWD", "AWD", "4WD"];
export const CONDITIONS = ["LIKE_NEW", "USED"];
export const IMPORTS = ["USA", "KOREA", "JAPAN", "THAILAND", "DUBAI", "LOCAL"];
export const ACCIDENTS = ["NONE_DECLARED", "MINOR_DECLARED", "MAJOR_DECLARED", "UNKNOWN"];
