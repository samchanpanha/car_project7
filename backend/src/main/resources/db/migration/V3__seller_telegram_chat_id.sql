-- KhLan Database Migration V3
-- Add Telegram Chat ID column to seller_profiles for multi-seller shared bot dispatch

ALTER TABLE seller_profiles ADD COLUMN IF NOT EXISTS tg_chat_id VARCHAR(64);
