-- Migration: add Plastic Packaging (shared by Sensory Adventure Mat and Chanting Baby Ganesha)
-- Run this once against your Supabase/PostgreSQL database.

INSERT INTO warehouse_products (name, item_code, item_type, stock, low_stock_threshold)
SELECT 'Plastic Packaging', 'PK-PLA', 'Packaging', 0, 10
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_products WHERE LOWER(name) = 'plastic packaging'
);
