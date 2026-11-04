-- V8: Add stock_quantity column to vehicles table for multi-unit inventory tracking
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 1;

