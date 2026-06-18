-- Purchase Orders table
-- Tracks orders placed with manufacturers.
-- When status is set to "received", the app updates warehouse_products.stock directly.

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                     BIGSERIAL PRIMARY KEY,
  product_id             BIGINT NOT NULL REFERENCES warehouse_products(id) ON DELETE RESTRICT,
  supplier_id            BIGINT REFERENCES warehouse_manufacturers(id) ON DELETE SET NULL,
  quantity_ordered       INTEGER NOT NULL CHECK (quantity_ordered > 0),
  order_date             DATE,
  expected_delivery_date DATE,
  status                 TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'in_transit', 'received')),
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_orders_product_id_idx  ON purchase_orders(product_id);
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx      ON purchase_orders(status);
