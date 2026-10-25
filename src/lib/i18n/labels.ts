import type { Locale } from "./types";

// Non-dictionary option labels
export const bodyTypeLabels: Record<string, Record<Locale, string>> = {
  SUV: { en: "SUV", km: "ឡានក្បួនធំ", zh: "SUV", vi: "SUV" },
  SEDAN: { en: "Sedan", km: "ឡានសេដាន", zh: "轿车", vi: "Sedan" },
  PICKUP: { en: "Pickup", km: "ឡានផ្ទុក", zh: "皮卡", vi: "Bán tải" },
  HATCHBACK: { en: "Hatchback", km: "ឡានបិទក្បាល", zh: "掀背车", vi: "Hatchback" },
  VAN: { en: "Van / MPV", km: "ឡានវ៉ាន", zh: "厢式车 / MPV", vi: "Van / MPV" },
  COUPE: { en: "Coupe", km: "ឡានគុប", zh: "轿跑车", vi: "Coupe" },
};

export const motorBodyTypeLabels: Record<string, Record<Locale, string>> = {
  SCOOTER: { en: "Scooter (Automatic)", km: "ស្គូទ័រ (អូតូ)", zh: "踏板车", vi: "Xe ga (Tay ga)" },
  CUB: { en: "Cub / Semi-Auto", km: "ម៉ូតូកែប / ស៊ីមីអូតូ", zh: "弯梁车", vi: "Xe số" },
  SPORT: { en: "Sportbike", km: "ម៉ូតូស្ព័រ", zh: "仿赛 / 跑车", vi: "Xe thể thao (Sportbike)" },
  CRUISER: { en: "Cruiser", km: "ម៉ូតូ Cruiser", zh: "巡航车", vi: "Cruiser" },
  DIRT: { en: "Dirt / Dual-Sport", km: "ម៉ូតូដង្កូវ / ជើងព្រៃ", zh: "越野车", vi: "Cào cào / Địa hình" },
  ELECTRIC: { en: "Electric Motorcycle", km: "ម៉ូតូអគ្គិសនី", zh: "电动摩托车", vi: "Xe máy điện" },
  OTHER: { en: "Other Motor", km: "ម៉ូតូផ្សេងៗ", zh: "其他摩托车", vi: "Khác" },
};

export const partCategoryLabels: Record<string, Record<Locale, string>> = {
  TIRES_WHEELS: { en: "Tires & Wheels", km: "សំបកកង់ និងយ៉ាន់", zh: "轮胎与轮毂", vi: "Lốp & Vành xe" },
  BRAKES_SUSPENSION: { en: "Brakes & Suspension", km: "ហ្វ្រាំង និងបូម", zh: "刹车与减震", vi: "Phanh & Giảm xóc" },
  BATTERY_ELECTRICAL: { en: "Battery & Electrical", km: "អាគុយ និងប្រព័ន្ធភ្លើង", zh: "电瓶与电气系统", vi: "Ắc quy & Điện" },
  ENGINE_TRANSMISSION: { en: "Engine & Transmission", km: "ម៉ាស៊ីន និងប្រអប់លេខ", zh: "发动机与变速箱", vi: "Động cơ & Hộp số" },
  LIGHTS_BULBS: { en: "Lights & Bulbs", km: "ចង្កៀង និងអំពូល", zh: "车灯与灯泡", vi: "Đèn & Bóng đèn" },
  BODY_MIRRORS: { en: "Body, Fairing & Mirrors", km: "សម្បកតួ អាវ និងកញ្ចក់", zh: "车壳、包围与后视镜", vi: "Vỏ xe, Dàn áo & Gương" },
  OILS_LUBRICANTS: { en: "Oils & Lubricants", km: "ប្រេងម៉ាស៊ីន និងសារធាតុរអិល", zh: "机油与润滑油", vi: "Dầu nhớt & Phụ gia" },
  ACCESSORIES: { en: "Accessories & Tools", km: "គ្រឿងតុបតែង និងឧបករណ៍", zh: "装饰配件与工具", vi: "Phụ kiện & Đồ chơi" },
};

export const partConditionLabels: Record<string, Record<Locale, string>> = {
  BRAND_NEW: { en: "Brand New (Genuine/OEM)", km: "ថ្មីសុទ្ធ (Original)", zh: "全新正品 / OEM", vi: "Mới 100% (Chính hãng)" },
  USED_GENUINE: { en: "Used Genuine (Original)", km: "មួយទឹកហ្ស៊ីន (មួយទឹក)", zh: "拆车件 / 原厂二手", vi: "Cũ chính hãng (Tháo xe)" },
  AFTERMARKET: { en: "Aftermarket / Upgrade", km: "គ្រឿងកែច្នៃ / ម៉ាកក្រៅ", zh: "副厂 / 改装升级件", vi: "Hàng độ / Phụ tùng ngoài" },
};

export const partTargetLabels: Record<string, Record<Locale, string>> = {
  CAR: { en: "Car Parts", km: "គ្រឿងបន្លាស់ឡាន", zh: "汽车配件", vi: "Phụ tùng ô tô" },
  MOTOR: { en: "Motorcycle Parts", km: "គ្រឿងបន្លាស់ម៉ូតូ", zh: "摩托车配件", vi: "Phụ tùng xe máy" },
  UNIVERSAL: { en: "Universal / All", km: "ទូទៅ / គ្រប់ប្រភេទ", zh: "通用配件", vi: "Đa năng / Chung" },
};

export const fuelLabels: Record<string, Record<Locale, string>> = {
  PETROL: { en: "Petrol", km: "សាំង", zh: "汽油", vi: "Xăng" },
  DIESEL: { en: "Diesel", km: "ម៉ាសុីត", zh: "柴油", vi: "Diesel" },
  HYBRID: { en: "Hybrid", km: "ក្រមាស", zh: "油电混合", vi: "Hybrid" },
  ELECTRIC: { en: "Electric", km: "អគ្គិសនី", zh: "纯电动", vi: "Điện" },
};

export const transmissionLabels: Record<string, Record<Locale, string>> = {
  AUTOMATIC: { en: "Automatic", km: "ស្វ័យប្រវត្តិ", zh: "自动挡", vi: "Tự động" },
  MANUAL: { en: "Manual", km: "ធម្មតា", zh: "手动挡", vi: "Số sàn" },
};

export const drivetrainLabels: Record<string, Record<Locale, string>> = {
  FWD: { en: "FWD", km: "គង់២កង់មុខ", zh: "前轮驱动", vi: "Cầu trước" },
  RWD: { en: "RWD", km: "គង់២កង់ក្រោយ", zh: "后轮驱动", vi: "Cầu sau" },
  AWD: { en: "AWD", km: "គង់គ្រប់កង់", zh: "全轮驱动", vi: "Hai cầu (AWD)" },
  "4WD": { en: "4WD", km: "៤កង់", zh: "四驱", vi: "4WD" },
};
