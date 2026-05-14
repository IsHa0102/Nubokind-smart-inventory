-- Migration: add 'shipment' to inventory_entries.type CHECK constraint
-- Run this once against your Supabase/PostgreSQL database.
--
-- The constraint name 'inventory_entries_type_check' is the PostgreSQL default
-- for an unnamed CHECK on that table+column. If it differs in your DB, run:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'inventory_entries'::regclass AND contype = 'c';
-- and replace below accordingly.

ALTER TABLE warehouse_entries
  DROP CONSTRAINT IF EXISTS warehouse_entries_type_check;

ALTER TABLE warehouse_entries
  ADD CONSTRAINT warehouse_entries_type_check
  CHECK (type IN ('add', 'remove', 'adjustment', 'shipment'));
