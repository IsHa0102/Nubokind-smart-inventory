-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: Consignments deduct even when an item is short
-- Run once in the Supabase SQL Editor (after 006). Safe to re-run.
--
-- Before: one short component blocked the whole consignment, so nothing was
--         deducted (e.g. #8: Banner 0, needs 26).
-- Now:    every component is deducted. A short item goes into minus, which is
--         the exact number missing; its History entry is marked
--         "SHORT by N". Cancel / edit still return exactly what was taken, and
--         a recount (or the sheet) sets the real number later.
--         warehouse_save_consignment also returns 'short': the items that are
--         below zero after saving, so the app can warn.
-- Only consignment deductions may go negative; Stock Entry still can't.
-- ─────────────────────────────────────────────────────────────────────────────

-- Same as 004, minus the "Insufficient stock" error.
CREATE OR REPLACE FUNCTION _warehouse_apply_consignment_delta(
  p_consignment_id BIGINT,
  p_target         JSONB,
  p_destination    TEXT,
  p_remarks        TEXT,
  p_ts             TIMESTAMPTZ,
  p_image_urls     TEXT[]
) RETURNS INTEGER
LANGUAGE plpgsql SET search_path = public AS $$
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
       p_remarks || CASE WHEN r.delta > 0 AND new_stock < 0
                         THEN ' · SHORT by ' || LEAST(-new_stock, r.delta) ELSE '' END,
       CASE WHEN written = 0 THEN COALESCE(p_image_urls, '{}') ELSE '{}' END,
       p_ts, cur_stock, new_stock, p_consignment_id);

    written := written + 1;
  END LOOP;

  RETURN written;
END;
$$;

-- Items of a deduction list that are below zero now: [{product_id, name, stock}]
CREATE OR REPLACE FUNCTION _warehouse_shortages(p_deductions JSONB)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'stock', p.stock)
                            ORDER BY p.name), '[]'::jsonb)
  FROM warehouse_products p
  WHERE p.stock < 0
    AND p.id IN (SELECT (d->>'product_id')::BIGINT
                 FROM jsonb_array_elements(COALESCE(p_deductions, '[]'::jsonb)) d)
$$;

-- Same as 006, plus 'short' in the result.
CREATE OR REPLACE FUNCTION warehouse_save_consignment(
  p_id                BIGINT,
  p_destination       TEXT,
  p_dispatch_date     TEXT,
  p_reference         TEXT,
  p_notes             TEXT,
  p_corrugation_boxes INTEGER,
  p_lines             JSONB,
  p_deductions        JSONB,
  p_image_urls        TEXT[] DEFAULT '{}',
  p_source_document   TEXT   DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hdr        RECORD;
  cid        BIGINT;
  was_live   BOOLEAN := false;   -- already holds stock (scheduled / dispatched)
  was_sent   BOOLEAN := false;   -- already dispatched
  prev_date  DATE;
  v_date     DATE;
  v_future   BOOLEAN;
  v_status   TEXT;
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

  IF p_id IS NOT NULL THEN
    SELECT * INTO hdr FROM warehouse_planned_shipments WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Consignment #% not found.', p_id; END IF;
    IF hdr.status = 'cancelled' THEN
      RAISE EXCEPTION 'Consignment #% is cancelled and cannot be changed.', p_id;
    END IF;
    was_sent  := hdr.status = 'dispatched';
    was_live  := hdr.status IN ('dispatched', 'scheduled')
                 OR EXISTS (SELECT 1 FROM warehouse_entries WHERE consignment_id = p_id);
    prev_date := hdr.dispatch_date;
  END IF;

  v_date   := COALESCE(NULLIF(p_dispatch_date, '')::date, prev_date, _warehouse_today());
  v_future := v_date > _warehouse_today();
  v_status := CASE WHEN v_future THEN 'scheduled' ELSE 'dispatched' END;

  IF was_sent AND v_future THEN
    RAISE EXCEPTION 'Consignment #% has already been dispatched, so its date can''t be in the future.', p_id;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO warehouse_planned_shipments
      (destination, status, notes, dispatch_date, reference, corrugation_boxes, images,
       planned_deductions, source_document, updated_at)
    VALUES
      (p_destination, v_status, NULLIF(p_notes, ''), v_date, NULLIF(p_reference, ''),
       p_corrugation_boxes, COALESCE(p_image_urls, '{}'), p_deductions,
       NULLIF(p_source_document, ''), now())
    RETURNING id INTO cid;
  ELSE
    cid := p_id;
    UPDATE warehouse_planned_shipments SET
      destination        = p_destination,
      status             = v_status,
      notes              = NULLIF(p_notes, ''),
      dispatch_date      = v_date,
      reference          = NULLIF(p_reference, ''),
      corrugation_boxes  = p_corrugation_boxes,
      images             = CASE WHEN cardinality(COALESCE(p_image_urls, '{}')) > 0
                                THEN images || p_image_urls ELSE images END,
      planned_deductions = p_deductions,
      dispatch_error     = NULL,
      source_document    = COALESCE(NULLIF(p_source_document, ''), source_document),
      updated_at         = now()
    WHERE id = cid;

    DELETE FROM warehouse_planned_shipment_lines WHERE shipment_id = cid;
  END IF;

  INSERT INTO warehouse_planned_shipment_lines (shipment_id, sku_key, variant_key, quantity, label)
  SELECT cid, l->>'sku_key', NULLIF(l->>'variant_key', ''), (l->>'quantity')::INTEGER, l->>'label'
  FROM jsonb_array_elements(p_lines) l;

  -- First deduction: dated on the dispatch date if that is past, else now.
  -- Corrections: dated when they were made.
  IF was_live THEN
    ts := now();
    remark := 'Consignment #' || cid || ' edited';
  ELSE
    ts := _warehouse_build_ts(LEAST(v_date, _warehouse_today())::text);
    remark := 'Consignment #' || cid
              || CASE WHEN v_future THEN ' · ships ' || to_char(v_date, 'FMDD Mon') ELSE '' END
              || COALESCE(' · ' || NULLIF(p_reference, ''), '')
              || COALESCE(' · ' || NULLIF(p_notes, ''), '');
  END IF;

  written := _warehouse_apply_consignment_delta(
    cid, p_deductions, p_destination, remark, ts,
    CASE WHEN was_live THEN '{}'::TEXT[] ELSE p_image_urls END);

  RETURN jsonb_build_object('id', cid, 'status', v_status, 'dispatch_date', v_date,
                            'entries_written', written, 'edited', was_live,
                            'short', _warehouse_shortages(p_deductions));
END;
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- Backfill: consignments still holding no stock because of a shortage under
-- 006 (scheduled, component list stored, no entries) — deduct them now.
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT s.* FROM warehouse_planned_shipments s
    WHERE s.status IN ('scheduled', 'dispatched') AND s.planned_deductions IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM warehouse_entries e WHERE e.consignment_id = s.id)
    ORDER BY s.id
  LOOP
    PERFORM _warehouse_apply_consignment_delta(
      r.id, r.planned_deductions, r.destination,
      'Consignment #' || r.id
        || CASE WHEN r.dispatch_date > _warehouse_today()
                THEN ' · ships ' || to_char(r.dispatch_date, 'FMDD Mon') ELSE '' END
        || COALESCE(' · ' || r.reference, '') || COALESCE(' · ' || r.notes, ''),
      now(), r.images);
    UPDATE warehouse_planned_shipments SET dispatch_error = NULL WHERE id = r.id;
  END LOOP;
END $$;
