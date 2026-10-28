-- KhLan Database Migration V4
-- Improve marketplace filtering and text-search performance

CREATE INDEX IF NOT EXISTS idx_vehicles_status_created ON vehicles (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model ON vehicles (make, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_body_type ON vehicles (body_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_city ON vehicles (city);
CREATE INDEX IF NOT EXISTS idx_vehicles_price ON vehicles (price_usd);
CREATE INDEX IF NOT EXISTS idx_vehicles_year ON vehicles (year);
CREATE INDEX IF NOT EXISTS idx_vehicles_listing_category ON vehicles (listing_category);
CREATE INDEX IF NOT EXISTS idx_saved_searches_alerts ON saved_searches (alerts_enabled);
CREATE INDEX IF NOT EXISTS idx_conversations_vehicle ON conversations (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_created ON appointments (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_tenant_created ON purchase_requests (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity_entityid ON audit_logs (entity, entity_id);