-- Migration: add components for Sensory Adventure Mat (MA-SA-1) and Chanting Baby Ganesha (PL-CG-1)
-- Run this once against your Supabase/PostgreSQL database.
-- Names must match shipmentConfig.js exactly — shipments deduct stock by name.

INSERT INTO warehouse_products (name, item_code, item_type, stock, low_stock_threshold)
SELECT v.name, v.item_code, v.item_type, 0, 10
FROM (VALUES
  ('Sensory Mat',                'MA-SA-MAT', 'Product'),
  ('Sensory Mat Thank You Card', 'MA-SA-TYC', 'Packaging'),
  ('Sensory Mat Box',            'MA-SA-BOX', 'Packaging'),
  ('Ganesha Plushie',            'PL-CG-PLU', 'Product'),
  ('Ganesha Thank You Card',     'PL-CG-TYC', 'Packaging'),
  ('Ganesha Box',                'PL-CG-BOX', 'Packaging')
) AS v(name, item_code, item_type)
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_products p WHERE LOWER(p.name) = LOWER(v.name)
);
