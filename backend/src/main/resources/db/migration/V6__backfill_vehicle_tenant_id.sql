-- V6: Backfill tenant_id for seller_profiles and vehicles, and ensure every tenant has a subscription row

-- 1. Link seller_profiles to existing tenant memberships if tenant_id is currently NULL
UPDATE seller_profiles sp
SET tenant_id = tm.tenant_id
FROM tenant_members tm
WHERE sp.user_id = tm.user_id
  AND sp.tenant_id IS NULL;

-- 2. For any seller_profiles that still have NULL tenant_id, auto-provision a tenant & membership
DO $$
DECLARE
    rec RECORD;
    new_tenant_id VARCHAR(64);
    new_slug VARCHAR(128);
    seller_name VARCHAR(128);
BEGIN
    FOR rec IN 
        SELECT sp.id AS profile_id, sp.user_id, u.name, u.phone, sp.shop_name, sp.type
        FROM seller_profiles sp
        JOIN users u ON sp.user_id = u.id
        WHERE sp.tenant_id IS NULL
    LOOP
        new_tenant_id := 'ten_' || substr(md5(random()::text || clock_timestamp()::text || rec.profile_id), 1, 16);
        seller_name := COALESCE(NULLIF(TRIM(rec.shop_name), ''), NULLIF(TRIM(rec.name), ''), 'Seller');
        new_slug := lower(regexp_replace(seller_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 5);

        INSERT INTO tenants (id, name, slug, phone, status, created_at, updated_at)
        VALUES (new_tenant_id, seller_name, new_slug, rec.phone, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

        INSERT INTO tenant_members (id, tenant_id, user_id, role, status, created_at)
        VALUES ('tm_' || substr(md5(random()::text || clock_timestamp()::text || rec.user_id), 1, 16), new_tenant_id, rec.user_id, 'OWNER', 'ACTIVE', CURRENT_TIMESTAMP)
        ON CONFLICT (tenant_id, user_id) DO NOTHING;

        UPDATE seller_profiles
        SET tenant_id = new_tenant_id
        WHERE id = rec.profile_id;

        INSERT INTO subscriptions (id, tenant_id, plan, status, billing_cycle, price_usd, listings_limit, featured_limit, seats, started_at, current_period_end)
        VALUES ('sub_' || substr(md5(random()::text || clock_timestamp()::text || new_tenant_id), 1, 16), new_tenant_id, 'FREE', 'ACTIVE', 'MONTHLY', 0.0, 3, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')
        ON CONFLICT (tenant_id) DO NOTHING;
    END LOOP;
END $$;

-- 3. Backfill vehicles.tenant_id from seller_profiles where vehicles.tenant_id is NULL
UPDATE vehicles v
SET tenant_id = sp.tenant_id
FROM seller_profiles sp
WHERE v.seller_id = sp.user_id
  AND sp.tenant_id IS NOT NULL
  AND v.tenant_id IS NULL;

-- 4. For any existing tenant without a subscription row, insert default FREE subscription
INSERT INTO subscriptions (id, tenant_id, plan, status, billing_cycle, price_usd, listings_limit, featured_limit, seats, started_at, current_period_end)
SELECT 
    'sub_' || substr(md5(random()::text || clock_timestamp()::text || t.id), 1, 16),
    t.id,
    'FREE',
    'ACTIVE',
    'MONTHLY',
    0.0,
    3,
    0,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '30 days'
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.tenant_id = t.id
);

