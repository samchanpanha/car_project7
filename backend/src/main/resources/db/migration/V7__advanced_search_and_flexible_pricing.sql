-- KhLan (ឡាន) Database Migration V7
-- Advanced Search Filter Upgrades, Flexible Pricing Engine & Catalog Tables

-- 1. Extend vehicles table with new spec, search, and pricing floor fields
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS doors INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS steering VARCHAR(16) DEFAULT 'LEFT';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS chassis_no VARCHAR(64);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS stock_no VARCHAR(64);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS location_port VARCHAR(64);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS floor_price_usd DOUBLE PRECISION;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS features TEXT;

-- Motor-specific attributes
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS motor_type VARCHAR(64);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS has_abs BOOLEAN DEFAULT FALSE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS start_type VARCHAR(32);

-- Spare parts specific attributes
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS oem_brand VARCHAR(64);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_oem BOOLEAN DEFAULT TRUE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS position VARCHAR(32);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS compatible_year_min INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS compatible_year_max INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS compatible_make VARCHAR(64);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS compatible_model VARCHAR(64);

-- 2. Configurable Price Types Table
CREATE TABLE IF NOT EXISTS price_types (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    label VARCHAR(128) NOT NULL,
    mode VARCHAR(16) NOT NULL DEFAULT 'FIXED', -- FIXED | PERCENT
    badge_color VARCHAR(32) NOT NULL DEFAULT '#EF4444',
    priority INTEGER NOT NULL DEFAULT 0,
    stackable BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_types_code ON price_types (code);
CREATE INDEX IF NOT EXISTS idx_price_types_active_priority ON price_types (active, priority DESC);

-- 3. Item Prices Table (Per-listing scheduled & promotional prices)
CREATE TABLE IF NOT EXISTS item_prices (
    id VARCHAR(64) PRIMARY KEY,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    price_type_id VARCHAR(64) NOT NULL REFERENCES price_types(id) ON DELETE CASCADE,
    value DOUBLE PRECISION NOT NULL,
    currency VARCHAR(16) NOT NULL DEFAULT 'USD',
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_item_prices_vehicle_id ON item_prices (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_item_prices_price_type_id ON item_prices (price_type_id);
CREATE INDEX IF NOT EXISTS idx_item_prices_active_dates ON item_prices (active, start_date, end_date);

-- 4. Vehicle Makes Catalog
CREATE TABLE IF NOT EXISTS vehicle_makes (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'CAR', -- CAR | MOTOR | SPARE_PART
    slug VARCHAR(255) NOT NULL,
    logo_url VARCHAR(255),
    external_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vehicle_make_name_category UNIQUE (name, category)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_makes_category ON vehicle_makes (category);

-- 5. Vehicle Models Catalog (dependent on make)
CREATE TABLE IF NOT EXISTS vehicle_models (
    id VARCHAR(64) PRIMARY KEY,
    make_id VARCHAR(64) NOT NULL REFERENCES vehicle_makes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'CAR',
    body_type VARCHAR(64),
    year_min INTEGER,
    year_max INTEGER,
    external_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vehicle_model_make_name UNIQUE (make_id, name)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_models_make_id ON vehicle_models (make_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_models_category ON vehicle_models (category);

-- 6. Initial Seed for standard price types
INSERT INTO price_types (id, code, label, mode, badge_color, priority, stackable, active, created_at, updated_at)
VALUES
    ('pt-hot-price', 'HOT_PRICE', 'Hot Price', 'FIXED', '#EF4444', 100, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pt-promote-price', 'PROMOTE_PRICE', 'Promote Price', 'PERCENT', '#F59E0B', 80, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pt-discount-price', 'DISCOUNT_PRICE', 'Discount Price', 'PERCENT', '#10B981', 60, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pt-clearance', 'CLEARANCE', 'Clearance', 'FIXED', '#8B5CF6', 90, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pt-flash-sale', 'FLASH_SALE', 'Flash Sale', 'PERCENT', '#EC4899', 110, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pt-wholesale', 'WHOLESALE', 'Wholesale', 'FIXED', '#3B82F6', 50, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pt-member', 'MEMBER', 'Member Special', 'PERCENT', '#06B6D4', 70, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('pt-bundle', 'BUNDLE', 'Bundle Price', 'FIXED', '#6366F1', 40, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (code) DO NOTHING;
