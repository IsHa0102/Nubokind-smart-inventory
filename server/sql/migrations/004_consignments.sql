-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Consignments + logged stock edits
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- A consignment is a row in warehouse_planned_shipments with status
-- 'dispatched'. Planned orders (pending / approved / rejected) touch no stock;
-- dispatching one — or logging a consignment directly from Stock Entry —
-- deducts its components and links every resulting warehouse_entries row to it
-- through consignment_id.
--
-- Editing a dispatched consignment never deletes history: it writes only the
-- difference (extra 'remove' rows for more units, 'add' rows for fewer).
-- Cancelling writes 'add' rows that return everything. So for any consignment,
--   SUM(remove) - SUM(add) over its linked entries = what it currently holds.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Consignment fields on the planned-shipment header ────────────────────────
ALTER TABLE warehouse_planned_shipments
  ADD COLUMN IF NOT EXISTS planned_date      DATE,
  ADD COLUMN IF NOT EXISTS dispatch_date     DATE,
  ADD COLUMN IF NOT EXISTS reference         TEXT,
  ADD COLUMN IF NOT EXISTS corrugation_boxes INTEGER,
  ADD COLUMN IF NOT EXISTS images            TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ;

-- Replace whatever CHECK currently limits status, then allow the two new states.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'warehouse_planned_shipments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE warehouse_planned_shipments DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE warehouse_planned_shipments
  ADD CONSTRAINT warehouse_planned_shipments_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'dispatched', 'cancelled'));

-- 2. Link stock entries to the consignment that caused them ───────────────────
ALTER TABLE warehouse_entries
  ADD COLUMN IF NOT EXISTS consignment_id BIGINT
    REFERENCES warehouse_planned_shipments(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS warehouse_entries_consignment_idx
  ON warehouse_entries(consignment_id) WHERE consignment_id IS NOT NULL;

-- A Recount / admin edit may legitimately set stock to 0, which the old
-- "quantity > 0" rule rejected. Relax it to >= 0.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'warehouse_entries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%quantity%'
  LOOP
    EXECUTE format('ALTER TABLE warehouse_entries DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE warehouse_entries
  ADD CONSTRAINT warehouse_entries_quantity_check CHECK (quantity >= 0);

-- 3. Entries that belong to a consignment can't be deleted one by one ─────────
-- Deleting one would silently change the consignment's stock effect. The
-- History page hides the button; this guards every other path.
CREATE OR REPLACE FUNCTION _warehouse_block_consignment_entry_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.consignment_id IS NOT NULL THEN
    RAISE EXCEPTION 'This entry belongs to Consignment #%. Edit or cancel the consignment instead.',
      OLD.consignment_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS warehouse_entries_block_consignment_delete ON warehouse_entries;
CREATE TRIGGER warehouse_entries_block_consignment_delete
  BEFORE DELETE ON warehouse_entries
  FOR EACH ROW EXECUTE FUNCTION _warehouse_block_consignment_entry_delete();

-- 4. Apply a consignment's target deductions as a delta ───────────────────────
-- Internal helper. p_target: [{"product_id": 12, "quantity": 40}, ...]
-- Compares the target with what the consignment's entries already hold and
-- writes only the difference. All-or-nothing: any shortage raises and the
-- caller's transaction rolls back.
CREATE OR REPLACE FUNCTION _warehouse_apply_consignment_delta(
  p_consignment_id BIGINT,
  p_target         JSONB,
  p_destination    TEXT,
  p_remarks        TEXT,
  p_ts             TIMESTAMPTZ,
  p_image_urls     TEXT[]
) RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  r          RECORD;
  cur_stock  INTEGER;
  new_stock  INTEGER;
  written    INTEGER := 0;
BEGIN
  FOR r IN
    WITH target AS (
      SELECT (t->>'product_id')::BIGINT AS product_id, SUM((t->>'quantity')::INTEGER) AS qty
      FROM jsonb_array_elements(COALESCE(p_target, '[]'::jsonb)) t
      GROUP BY 1
    ),
    held AS (
      SELECT product_id,
             SUM(CASE type WHEN 'remove' THEN quantity WHEN 'add' THEN -quantity ELSE 0 END) AS qty
      FROM warehouse_entries
      WHERE consignment_id = p_consignment_id
      GROUP BY 1
    )
    SELECT COALESCE(t.product_id, h.product_id) AS product_id,
           COALESCE(t.qty, 0) - COALESCE(h.qty, 0) AS delta
    FROM target t FULL JOIN held h ON h.product_id = t.product_id
    ORDER BY 1                                   -- fixed lock order, no deadlocks
  LOOP
    CONTINUE WHEN r.delta = 0;

    SELECT stock INTO cur_stock FROM warehouse_products WHERE id = r.product_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item id % not found in inventory.', r.product_id;
    END IF;

    new_stock := cur_stock - r.delta;
    IF new_stock < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for %. Have: %, Need: %',
        (SELECT name FROM warehouse_products WHERE id = r.product_id), cur_stock, r.delta;
    END IF;

    UPDATE warehouse_products SET stock = new_stock WHERE id = r.product_id;

    INSERT INTO warehouse_entries
      (product_id, type, quantity, source, destination, remarks, images,
       created_at, stock_before, stock_after, consignment_id)
    VALUES
      (r.product_id,
       CASE WHEN r.delta > 0 THEN 'remove' ELSE 'add' END,
       ABS(r.delta),
       CASE WHEN r.delta < 0 THEN 'Consignment #' || p_consignment_id END,
       CASE WHEN r.delta > 0 THEN p_destination END,
       p_remarks,
       CASE WHEN written = 0 THEN COALESCE(p_image_urls, '{}') ELSE '{}' END,
       p_ts, cur_stock, new_stock, p_consignment_id);

    written := written + 1;
  END LOOP;

  RETURN written;
END;
$$;

-- 5. Create / dispatch / edit a consignment ───────────────────────────────────
-- p_id NULL            → new consignment, dispatched now.
-- p_id = planned order → header + lines updated, then dispatched.
-- p_id = dispatched    → header + lines updated, stock corrected by the delta.
-- p_lines:      [{"sku_key","variant_key","quantity","label"}, ...]
-- p_deductions: [{"product_id","quantity"}, ...]  (components incl. corrugation)
CREATE OR REPLACE FUNCTION warehouse_save_consignment(
  p_id                BIGINT,
  p_destination       TEXT,
  p_dispatch_date     TEXT,
  p_reference         TEXT,
  p_notes             TEXT,
  p_corrugation_boxes INTEGER,
  p_lines             JSONB,
  p_deductions        JSONB,
  p_image_urls        TEXT[] DEFAULT '{}'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  hdr        RECORD;
  cid        BIGINT;
  was_live   BOOLEAN := false;
  ts         TIMESTAMPTZ;
  remark     TEXT;
  written    INTEGER;
BEGIN
  IF p_destination IS NULL OR btrim(p_destination) = '' THEN
    RAISE EXCEPTION 'Destination is required.';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'A consignment needs at least one SKU line.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO warehouse_planned_shipments
      (destination, status, notes, dispatch_date, reference, corrugation_boxes, images, updated_at)
    VALUES
      (p_destination, 'dispatched', NULLIF(p_notes, ''),
       COALESCE(NULLIF(p_dispatch_date, '')::date, CURRENT_DATE), NULLIF(p_reference, ''),
       p_corrugation_boxes, COALESCE(p_image_urls, '{}'), now())
    RETURNING id INTO cid;
  ELSE
    SELECT * INTO hdr FROM warehouse_planned_shipments WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Consignment #% not found.', p_id; END IF;
    IF hdr.status = 'cancelled' THEN
      RAISE EXCEPTION 'Consignment #% is cancelled and cannot be changed.', p_id;
    END IF;
    cid := p_id;
    was_live := hdr.status = 'dispatched';

    UPDATE warehouse_planned_shipments SET
      destination       = p_destination,
      status            = 'dispatched',
      notes             = NULLIF(p_notes, ''),
      dispatch_date     = COALESCE(NULLIF(p_dispatch_date, '')::date, hdr.dispatch_date, CURRENT_DATE),
      reference         = NULLIF(p_reference, ''),
      corrugation_boxes = p_corrugation_boxes,
      images            = CASE WHEN cardinality(COALESCE(p_image_urls, '{}')) > 0
                               THEN images || p_image_urls ELSE images END,
      updated_at        = now()
    WHERE id = cid;

    DELETE FROM warehouse_planned_shipment_lines WHERE shipment_id = cid;
  END IF;

  INSERT INTO warehouse_planned_shipment_lines (shipment_id, sku_key, variant_key, quantity, label)
  SELECT cid, l->>'sku_key', NULLIF(l->>'variant_key', ''), (l->>'quantity')::INTEGER, l->>'label'
  FROM jsonb_array_elements(p_lines) l;

  -- First dispatch is dated on the dispatch date; later corrections are dated
  -- when they were made, so History shows when the change actually happened.
  IF was_live THEN
    ts := now();
    remark := 'Consignment #' || cid || ' edited';
  ELSE
    ts := _warehouse_build_ts(COALESCE(NULLIF(p_dispatch_date, ''), CURRENT_DATE::text));
    remark := 'Consignment #' || cid
              || COALESCE(' · ' || NULLIF(p_reference, ''), '')
              || COALESCE(' · ' || NULLIF(p_notes, ''), '');
  END IF;

  written := _warehouse_apply_consignment_delta(
    cid, p_deductions, p_destination, remark, ts,
    CASE WHEN was_live THEN '{}'::TEXT[] ELSE p_image_urls END);

  RETURN jsonb_build_object('id', cid, 'entries_written', written, 'edited', was_live);
END;
$$;

-- 6. Cancel a consignment ─────────────────────────────────────────────────────
-- Dispatched → returns every unit to stock (logged as 'add' rows) and keeps the
-- record as 'cancelled'. A plan that never shipped is simply deleted.
CREATE OR REPLACE FUNCTION warehouse_cancel_consignment(p_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  hdr     RECORD;
  written INTEGER;
BEGIN
  SELECT * INTO hdr FROM warehouse_planned_shipments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consignment #% not found.', p_id; END IF;

  IF hdr.status = 'cancelled' THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'cancelled', 'entries_written', 0);
  END IF;

  IF hdr.status <> 'dispatched' THEN
    DELETE FROM warehouse_planned_shipments WHERE id = p_id;   -- lines cascade
    RETURN jsonb_build_object('id', p_id, 'status', 'deleted', 'entries_written', 0);
  END IF;

  written := _warehouse_apply_consignment_delta(
    p_id, '[]'::jsonb, hdr.destination,
    'Consignment #' || p_id || ' cancelled — stock returned', now(), '{}');

  UPDATE warehouse_planned_shipments
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'cancelled', 'entries_written', written);
END;
$$;

-- 7. Set stock to an exact number, with a History row ─────────────────────────
-- Used by Admin → Products edit. Logged as a Recount ('adjustment') whose
-- quantity is the new stock, matching the Stock Entry Recount convention.
CREATE OR REPLACE FUNCTION warehouse_set_stock(
  p_product_id BIGINT,
  p_new_stock  INTEGER,
  p_remarks    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cur_stock INTEGER;
  entry     RECORD;
BEGIN
  IF p_new_stock IS NULL OR p_new_stock < 0 THEN
    RAISE EXCEPTION 'Stock must be 0 or more.';
  END IF;

  SELECT stock INTO cur_stock FROM warehouse_products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found.'; END IF;

  IF cur_stock = p_new_stock THEN
    RETURN jsonb_build_object('changed', false);
  END IF;

  UPDATE warehouse_products SET stock = p_new_stock WHERE id = p_product_id;

  INSERT INTO warehouse_entries
    (product_id, type, quantity, remarks, images, created_at, stock_before, stock_after)
  VALUES
    (p_product_id, 'adjustment', p_new_stock,
     COALESCE(NULLIF(p_remarks, ''), 'Admin stock edit'),
     '{}', now(), cur_stock, p_new_stock)
  RETURNING * INTO entry;

  RETURN jsonb_build_object('changed', true, 'entry', to_jsonb(entry));
END;
$$;

GRANT EXECUTE ON FUNCTION warehouse_save_consignment(BIGINT,TEXT,TEXT,TEXT,TEXT,INTEGER,JSONB,JSONB,TEXT[])
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_cancel_consignment(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_set_stock(BIGINT,INTEGER,TEXT)  TO anon, authenticated, service_role;
