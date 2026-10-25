-- KhLan (ឡាន) PostgreSQL Database Schema Migration V1
-- Converted from Prisma schema with PostgreSQL data types and constraints

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    phone VARCHAR(32) NOT NULL UNIQUE,
    email VARCHAR(128),
    name VARCHAR(128) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'BUYER',
    locale VARCHAR(8) NOT NULL DEFAULT 'km',
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url TEXT,
    password_hash TEXT,
    telegram_id VARCHAR(64) UNIQUE,
    telegram_username VARCHAR(128),
    is_blacklisted BOOLEAN NOT NULL DEFAULT FALSE,
    blacklist_reason TEXT,
    blacklisted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tenants (Dealership Organizations)
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) NOT NULL UNIQUE,
    logo_url TEXT,
    bio TEXT,
    bio_km TEXT,
    city VARCHAR(64) NOT NULL DEFAULT 'Phnom Penh',
    address TEXT,
    phone VARCHAR(32),
    telegram VARCHAR(64),
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tenant Members
CREATE TABLE IF NOT EXISTS tenant_members (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'SALES_STAFF',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_user UNIQUE (tenant_id, user_id)
);

-- 4. Tenant Branches
CREATE TABLE IF NOT EXISTS tenant_branches (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    name_km VARCHAR(128),
    city VARCHAR(64) NOT NULL DEFAULT 'Phnom Penh',
    district VARCHAR(64),
    address TEXT NOT NULL,
    phone VARCHAR(32),
    telegram VARCHAR(64),
    is_main BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    opening_hours TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_branch_tenant ON tenant_branches (tenant_id);

-- 5. Seller Profiles
CREATE TABLE IF NOT EXISTS seller_profiles (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL DEFAULT 'PRIVATE',
    shop_name VARCHAR(128),
    bio TEXT,
    bio_km TEXT,
    city VARCHAR(64) NOT NULL DEFAULT 'Phnom Penh',
    address TEXT,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
    response_rate INT NOT NULL DEFAULT 0,
    rating_avg DOUBLE PRECISION NOT NULL DEFAULT 0,
    rating_count INT NOT NULL DEFAULT 0,
    member_since TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logo_url TEXT,
    phone VARCHAR(32),
    telegram VARCHAR(64),
    tg_mini_app_url TEXT,
    tg_channel_url TEXT,
    tg_group_url TEXT,
    invite_code VARCHAR(64) UNIQUE,
    tenant_id VARCHAR(64) REFERENCES tenants (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Telegram Invite Events
CREATE TABLE IF NOT EXISTS telegram_invite_events (
    id VARCHAR(64) PRIMARY KEY,
    profile_id VARCHAR(64) NOT NULL REFERENCES seller_profiles (id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    dest VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tg_event_profile_date ON telegram_invite_events (profile_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tg_event_code ON telegram_invite_events (code);

-- 7. Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL UNIQUE REFERENCES tenants (id) ON DELETE CASCADE,
    plan VARCHAR(32) NOT NULL DEFAULT 'FREE',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    billing_cycle VARCHAR(32) NOT NULL DEFAULT 'MONTHLY',
    price_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
    listings_limit INT NOT NULL DEFAULT 3,
    featured_limit INT NOT NULL DEFAULT 0,
    seats INT NOT NULL DEFAULT 1,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    id VARCHAR(64) PRIMARY KEY,
    seller_id VARCHAR(64) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_by_id VARCHAR(64),
    make VARCHAR(64) NOT NULL,
    model VARCHAR(64) NOT NULL,
    variant VARCHAR(64),
    year INT NOT NULL,
    price_usd DOUBLE PRECISION NOT NULL,
    mileage_km INT NOT NULL,
    transmission VARCHAR(32) NOT NULL,
    fuel VARCHAR(32) NOT NULL,
    engine_cc INT,
    drivetrain VARCHAR(32),
    body_type VARCHAR(32) NOT NULL,
    exterior_color VARCHAR(32),
    condition VARCHAR(32) NOT NULL DEFAULT 'USED',
    city VARCHAR(64) NOT NULL DEFAULT 'Phnom Penh',
    district VARCHAR(64),
    description TEXT,
    description_km TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    views INT NOT NULL DEFAULT 0,
    vin_last6 VARCHAR(16),
    plate_no VARCHAR(32),
    ownership_count INT,
    accident_declared VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN',
    import_origin VARCHAR(32),
    tenant_id VARCHAR(64) REFERENCES tenants (id) ON DELETE SET NULL,
    branch_id VARCHAR(64) REFERENCES tenant_branches (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_seller ON vehicles (seller_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_status ON vehicles (status);

CREATE INDEX IF NOT EXISTS idx_vehicle_make_model ON vehicles (make, model);

CREATE INDEX IF NOT EXISTS idx_vehicle_tenant ON vehicles (tenant_id);

-- 9. Vehicle Images
CREATE TABLE IF NOT EXISTS vehicle_images (
    id VARCHAR(64) PRIMARY KEY,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt TEXT,
    sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_vehicle_images_vehicle ON vehicle_images (vehicle_id);

-- 10. Vehicle Documents
CREATE TABLE IF NOT EXISTS vehicle_documents (
    id VARCHAR(64) PRIMARY KEY,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PROVIDED',
    notes TEXT,
    file_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle ON vehicle_documents (vehicle_id);

-- 11. Vehicle History Reports (AI vehicle analysis)
CREATE TABLE IF NOT EXISTS vehicle_history_reports (
    id VARCHAR(64) PRIMARY KEY,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    checks_json TEXT NOT NULL,
    overall_confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
    summary_en TEXT,
    summary_km TEXT,
    limitations_json TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETE',
    requested_by VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vehicle_history_vehicle ON vehicle_history_reports (vehicle_id);

-- 12. Saved Searches
CREATE TABLE IF NOT EXISTS saved_searches (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    query_json TEXT NOT NULL,
    alerts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id);

-- 13. Appointments
CREATE TABLE IF NOT EXISTS appointments (
    id VARCHAR(64) PRIMARY KEY,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    buyer_id VARCHAR(64) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) REFERENCES tenants (id) ON DELETE SET NULL,
    seller_id VARCHAR(64) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appointment_vehicle ON appointments (vehicle_id);

CREATE INDEX IF NOT EXISTS idx_appointment_buyer ON appointments (buyer_id);

-- 14. Subscription Payments (Bakong KHQR / Manual)
CREATE TABLE IF NOT EXISTS subscription_payments (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    plan VARCHAR(32) NOT NULL,
    billing_cycle VARCHAR(32) NOT NULL,
    amount_usd DOUBLE PRECISION NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
    amount_expected DOUBLE PRECISION,
    exchange_rate DOUBLE PRECISION,
    months INT NOT NULL,
    method VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    reference VARCHAR(64) NOT NULL UNIQUE,
    bakong_md5 VARCHAR(64),
    bakong_hash VARCHAR(128),
    qr_payload TEXT,
    manual_ref VARCHAR(128),
    manual_ref_key VARCHAR(128) UNIQUE,
    manual_ref_kind VARCHAR(32),
    idempotency_key VARCHAR(128) UNIQUE,
    evidence_hash VARCHAR(128),
    evidence_phash VARCHAR(64),
    evidence_url TEXT,
    evidence_image TEXT,
    ocr_status VARCHAR(32),
    ocr_confidence DOUBLE PRECISION,
    ocr_ref VARCHAR(128),
    ocr_amount DOUBLE PRECISION,
    ocr_currency VARCHAR(8),
    ocr_paid_at TIMESTAMPTZ,
    ocr_raw_text TEXT,
    ocr_json TEXT,
    risk_flags_json TEXT,
    verified_source VARCHAR(32),
    telegram_sent_at TIMESTAMPTZ,
    telegram_error TEXT,
    telegram_message_id INT,
    telegram_group_id VARCHAR(64),
    verified_by_name VARCHAR(128),
    notified_seller BOOLEAN NOT NULL DEFAULT FALSE,
    notified_at TIMESTAMPTZ,
    note TEXT,
    rejection_reason TEXT,
    reviewed_by_id VARCHAR(64),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sub_payment_tenant ON subscription_payments (tenant_id);

CREATE INDEX IF NOT EXISTS idx_sub_payment_status ON subscription_payments (status);

CREATE INDEX IF NOT EXISTS idx_sub_payment_ev_hash ON subscription_payments (evidence_hash);

CREATE INDEX IF NOT EXISTS idx_sub_payment_ev_phash ON subscription_payments (evidence_phash);

-- 15. ABA Transactions (Telegram / Group notifications sync)
CREATE TABLE IF NOT EXISTS aba_transactions (
    id VARCHAR(64) PRIMARY KEY,
    raw_message TEXT NOT NULL,
    message_id INT,
    chat_id VARCHAR(64),
    source VARCHAR(32) NOT NULL DEFAULT 'ABA_PAYWAY',
    trx_id VARCHAR(64) NOT NULL UNIQUE,
    apv VARCHAR(32),
    amount DOUBLE PRECISION NOT NULL,
    currency VARCHAR(8) NOT NULL,
    amount_usd DOUBLE PRECISION NOT NULL,
    payer_name VARCHAR(128),
    payer_account VARCHAR(32),
    bank_code VARCHAR(32),
    merchant_name VARCHAR(128),
    transaction_date_raw VARCHAR(64),
    transaction_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'UNMATCHED',
    subscription_payment_id VARCHAR(64) REFERENCES subscription_payments (id) ON DELETE SET NULL,
    matched_at TIMESTAMPTZ,
    matched_by VARCHAR(64),
    is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    duplicate_count INT NOT NULL DEFAULT 0,
    same_time_collision BOOLEAN NOT NULL DEFAULT FALSE,
    collision_trx_ids TEXT,
    verification_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_aba_trx_status ON aba_transactions (status);

CREATE INDEX IF NOT EXISTS idx_aba_trx_date ON aba_transactions (transaction_date);

-- 16. Purchase Requests
CREATE TABLE IF NOT EXISTS purchase_requests (
    id VARCHAR(64) PRIMARY KEY,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    buyer_id VARCHAR(64) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) REFERENCES tenants (id) ON DELETE SET NULL,
    seller_user_id VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    message TEXT,
    price_usd DOUBLE PRECISION NOT NULL,
    decided_by_id VARCHAR(64),
    decided_at TIMESTAMPTZ,
    decision_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_req_vehicle ON purchase_requests (vehicle_id);

CREATE INDEX IF NOT EXISTS idx_purchase_req_buyer ON purchase_requests (buyer_id);

CREATE INDEX IF NOT EXISTS idx_purchase_req_tenant ON purchase_requests (tenant_id);

-- 17. Platform Settings
CREATE TABLE IF NOT EXISTS platform_settings (
    key VARCHAR(128) PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 18. Favorites
CREATE TABLE IF NOT EXISTS favorites (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_vehicle_fav UNIQUE (user_id, vehicle_id)
);

-- 19. Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(64) PRIMARY KEY,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    buyer_id VARCHAR(64) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 20. Messages
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    conversation_id VARCHAR(64) NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    sender_id VARCHAR(64) REFERENCES users (id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id);

-- 21. Reported Content
CREATE TABLE IF NOT EXISTS reported_contents (
    id VARCHAR(64) PRIMARY KEY,
    vehicle_id VARCHAR(64) NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
    reason VARCHAR(64) NOT NULL,
    details TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 22. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    actor_id VARCHAR(64),
    action VARCHAR(64) NOT NULL,
    entity VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64),
    meta_json TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 23. Fraud Alerts
CREATE TABLE IF NOT EXISTS fraud_alerts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    detected_payee VARCHAR(128),
    expected_payee VARCHAR(128),
    amount DOUBLE PRECISION,
    currency VARCHAR(8),
    slip_ref VARCHAR(128),
    slip_date_raw VARCHAR(64),
    evidence_image TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    telegram_msg_id INT,
    telegram_chat_id VARCHAR(64),
    resolved_by VARCHAR(64),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fraud_user ON fraud_alerts (user_id);

CREATE INDEX IF NOT EXISTS idx_fraud_tenant ON fraud_alerts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_fraud_status ON fraud_alerts (status);