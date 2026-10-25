-- KhLan (ឡាន) Database Migration V2
-- Multi-category vehicle columns (motorcycles & spare parts) and storage failover sync

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS listing_category VARCHAR(32) NOT NULL DEFAULT 'CAR';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS part_number VARCHAR(64);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS compatible_models TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS part_category VARCHAR(64);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS part_condition VARCHAR(32);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS part_target VARCHAR(32);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS motor_body_type VARCHAR(64);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine_displacement_cc INTEGER;

CREATE TABLE IF NOT EXISTS pending_storage_sync (
    id VARCHAR(64) PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL UNIQUE,
    mime_type VARCHAR(128) NOT NULL,
    byte_size INTEGER NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'LOCAL_RESERVED',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pending_storage_sync_status ON pending_storage_sync (status);
