#!/usr/bin/env python3
import sqlite3
import re
import sys
import subprocess

def camel_to_snake(name):
    special = {
        'vinLast6': 'vin_last6',
        'plateNo': 'plate_no',
        'engineCc': 'engine_cc',
        'priceUsd': 'price_usd',
        'mileageKm': 'mileage_km',
        'bioKm': 'bio_km',
        'nameKm': 'name_km',
        'descriptionKm': 'description_km',
        'summaryKm': 'summary_km',
        'summaryEn': 'summary_en',
        'amountUsd': 'amount_usd',
        'trxId': 'trx_id',
        'messageId': 'message_id',
        'chatId': 'chat_id',
        'isDuplicate': 'is_duplicate',
        'qrPayload': 'qr_payload',
        'bakongMd5': 'bakong_md5',
        'bakongHash': 'bakong_hash',
        'evidencePhash': 'evidence_phash',
        'tgMiniAppUrl': 'tg_mini_app_url',
        'tgChannelUrl': 'tg_channel_url',
        'tgGroupUrl': 'tg_group_url',
        'listingCategory': 'listing_category',
        'partNumber': 'part_number',
        'compatibleModels': 'compatible_models',
        'partCategory': 'part_category',
        'partCondition': 'part_condition',
        'partTarget': 'part_target',
        'motorBodyType': 'motor_body_type',
        'engineDisplacementCc': 'engine_displacement_cc',
        'fileName': 'file_name',
        'mimeType': 'mime_type',
        'byteSize': 'byte_size',
        'syncedAt': 'synced_at',
    }
    if name in special:
        return special[name]
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()

# Table order respects foreign key constraints:
# (sqlite_tbl, pg_tbl, conflict_targets, do_update)
TABLE_CONFIG = [
    ('User', 'users', 'id', True),
    ('Tenant', 'tenants', 'id', True),
    ('TenantBranch', 'tenant_branches', 'id', False),
    ('TenantMember', 'tenant_members', 'tenant_id, user_id', True),
    ('SellerProfile', 'seller_profiles', 'user_id', True),
    ('TelegramInviteEvent', 'telegram_invite_events', 'id', False),
    ('Subscription', 'subscriptions', 'tenant_id', True),
    ('Vehicle', 'vehicles', 'id', True),
    ('VehicleImage', 'vehicle_images', 'id', True),
    ('VehicleDocument', 'vehicle_documents', 'id', True),
    ('VehicleHistoryReport', 'vehicle_history_reports', 'id', True),
    ('SavedSearch', 'saved_searches', 'id', False),
    ('Appointment', 'appointments', 'id', False),
    ('SubscriptionPayment', 'subscription_payments', 'id', False),
    ('AbaTransaction', 'aba_transactions', 'trx_id', True),
    ('PurchaseRequest', 'purchase_requests', 'id', False),
    ('PlatformSetting', 'platform_settings', 'key', True),
    ('Favorite', 'favorites', 'user_id, vehicle_id', False),
    ('Conversation', 'conversations', 'id', False),
    ('Message', 'messages', 'id', False),
    ('ReportedContent', 'reported_contents', 'id', False),
    ('AuditLog', 'audit_logs', 'id', False),
    ('FraudAlert', 'fraud_alerts', 'id', False),
    ('PendingStorageSync', 'pending_storage_sync', 'file_name', True)
]

BOOLEAN_COLUMNS = {
    'phone_verified', 'is_blacklisted', 'verified', 'is_main',
    'featured', 'alerts_enabled', 'notified_seller', 'is_duplicate',
    'same_time_collision', 'is_system', 'price_masked'
}

TIMESTAMP_COLUMNS = {
    'created_at', 'updated_at', 'blacklisted_at', 'member_since',
    'started_at', 'current_period_end', 'scheduled_at', 'ocr_paid_at',
    'telegram_sent_at', 'notified_at', 'reviewed_at', 'matched_at',
    'decided_at', 'transaction_date', 'resolved_at', 'synced_at'
}

def format_val(col, v):
    if v is None:
        return 'NULL'
    if col in BOOLEAN_COLUMNS:
        return 'TRUE' if v in (1, '1', True, 'true', 'TRUE') else 'FALSE'
    if col in TIMESTAMP_COLUMNS:
        if isinstance(v, (int, float)):
            if v > 100000000000:
                return f"to_timestamp({v} / 1000.0)"
            elif v > 1000000000:
                return f"to_timestamp({v})"
            elif v == 0:
                return 'CURRENT_TIMESTAMP'
        s = str(v).replace("'", "''")
        return f"'{s}'::timestamptz"
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"

def main():
    db_path = 'db/custom.db'
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    sql_statements = []
    sql_statements.append("BEGIN;")

    total_rows = 0
    for sqlite_tbl, pg_tbl, conflict_target, do_update in TABLE_CONFIG:
        exists = cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (sqlite_tbl,)).fetchone()
        if not exists:
            continue

        cols_info = cur.execute(f"PRAGMA table_info({sqlite_tbl})").fetchall()
        sqlite_cols = [c[1] for c in cols_info]
        pg_cols = [camel_to_snake(c) for c in sqlite_cols]

        rows = cur.execute(f"SELECT * FROM {sqlite_tbl}").fetchall()
        if not rows:
            print(f"[-] {sqlite_tbl} -> {pg_tbl}: 0 rows", file=sys.stderr)
            continue

        print(f"[+] {sqlite_tbl} -> {pg_tbl}: migrating {len(rows)} rows...", file=sys.stderr)
        total_rows += len(rows)

        col_str = ", ".join(f'"{c}"' for c in pg_cols)
        
        # Build conflict resolution
        conflict_cols = [c.strip() for c in conflict_target.split(',')]
        if do_update:
            update_cols = [c for c in pg_cols if c not in conflict_cols]
            if update_cols:
                update_clause = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols)
                conflict_action = f"ON CONFLICT ({conflict_target}) DO UPDATE SET {update_clause}"
            else:
                conflict_action = f"ON CONFLICT ({conflict_target}) DO NOTHING"
        else:
            conflict_action = f"ON CONFLICT ({conflict_target}) DO NOTHING"

        for r in rows:
            val_strs = [format_val(c, v) for c, v in zip(pg_cols, r)]
            vals_joined = ", ".join(val_strs)
            sql_statements.append(f'INSERT INTO {pg_tbl} ({col_str}) VALUES ({vals_joined}) {conflict_action};')

    sql_statements.append("COMMIT;")
    full_sql = "\n".join(sql_statements)

    dump_path = 'db/sqlite_to_pg_dump.sql'
    with open(dump_path, 'w') as f:
        f.write(full_sql)

    print(f"Generated {len(sql_statements)} statements ({total_rows} rows) to {dump_path}.", file=sys.stderr)

if __name__ == '__main__':
    main()
