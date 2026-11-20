-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: Deduct consignment stock when it is logged
-- Run once in the Supabase SQL Editor (after 005). Safe to re-run.
--
-- Before: a future-dated consignment was 'scheduled' and moved no stock until
--         its date, when warehouse_dispatch_due_consignments() deducted it.
-- Now:    every consignment deducts its components the moment it is saved,
--         whatever its date. Stock = what is still free to send.
--         'scheduled' only means "dispatch date not reached yet"; on that day
--         the status flips to 'dispatched' (no stock moves then).
--         Cancelling a scheduled or dispatched consignment returns its stock.
--
-- History timestamps: a deduction is dated when it entered the system
-- (today, or the dispatch date if that is in the past), never in the future.
--
-- Sheet reconciliation: the warehouse counts what is physically there, and
-- goods of a scheduled consignment are still on the shelf until its dispatch
-- date. So consignment entries are compared by the consignment's dispatch
-- date, not by when they were logged:
--   dispatch date after the count day  → counted as "moved since the count"
--   dispatch date on/before count day  → the count already saw them gone
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Save: always deduct (delta against what the consignment already holds)
-- ═════════════════════════════════════════════════════════════════════════════
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
                            'entries_written', written, 'edited', was_live);
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Due dispatches: flip status. Stock was already taken when it was logged.
--    The delta call is kept for consignments scheduled under 005 that hold no
--    stock yet (delta = full list); for everything else it writes nothing.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION warehouse_dispatch_due_consignments()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r          RECORD;
  written    INTEGER;
  dispatched JSONB := '[]'::jsonb;
  failed     JSONB := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT * FROM warehouse_planned_shipments
    WHERE status = 'scheduled' AND dispatch_date <= _warehouse_today()
    ORDER BY dispatch_date, id
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      IF r.planned_deductions IS NULL THEN
        RAISE EXCEPTION 'No component list stored. Open and save the consignment again.';
      END IF;

      written := _warehouse_apply_consignment_delta(
        r.id, r.planned_deductions, r.destination,
        'Consignment #' || r.id
          || COALESCE(' · ' || r.reference, '')
          || COALESCE(' · ' || r.notes, ''),
        _warehouse_build_ts(r.dispatch_date::text), r.images);

      UPDATE warehouse_planned_shipments
      SET status = 'dispatched', dispatch_error = NULL, updated_at = now()
      WHERE id = r.id;

      dispatched := dispatched || jsonb_build_object('id', r.id, 'entries_written', written);
    EXCEPTION WHEN OTHERS THEN
      UPDATE warehouse_planned_shipments
      SET dispatch_error = SQLERRM, updated_at = now()
      WHERE id = r.id;
      failed := failed || jsonb_build_object('id', r.id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('dispatched', dispatched, 'failed', failed);
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Cancel: scheduled and dispatched both return whatever they hold.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION warehouse_cancel_consignment(p_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hdr     RECORD;
  written INTEGER;
BEGIN
  SELECT * INTO hdr FROM warehouse_planned_shipments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consignment #% not found.', p_id; END IF;

  IF hdr.status = 'cancelled' THEN
    RETURN jsonb_build_object('id', p_id, 'status', 'cancelled', 'entries_written', 0);
  END IF;

  IF hdr.status NOT IN ('dispatched', 'scheduled') THEN
    DELETE FROM warehouse_planned_shipments WHERE id = p_id;   -- lines cascade
    RETURN jsonb_build_object('id', p_id, 'status', 'deleted', 'entries_written', 0);
  END IF;

  written := _warehouse_apply_consignment_delta(
    p_id, '[]'::jsonb, hdr.destination,
    'Consignment #' || p_id || ' cancelled — stock returned', now(), '{}');

  UPDATE warehouse_planned_shipments
  SET status = 'cancelled', dispatch_error = NULL, updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'cancelled', 'entries_written', written);
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Sheet reconciliation: consignment entries count by dispatch date.
--    Same output as 005. Non-consignment entries are unchanged (by created_at).
--    A consignment entry is "moved since the count" when its consignment's
--    dispatch date is after the count day — whenever it was logged. Cancelled
--    consignments net to zero across their entries, so they never show.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION warehouse_sheet_reconciliation()
RETURNS TABLE (
  product_id        BIGINT,
  stock             INTEGER,
  sheet_stock       INTEGER,
  sheet_count_label TEXT,
  sheet_count_date  DATE,
  sheet_synced_at   TIMESTAMPTZ,
  sheet_status      TEXT,
  moved_since       INTEGER,
  system_at_count   INTEGER,
  diff              INTEGER,
  superseded        BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT p.*,
           ((p.sheet_count_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') AS cutoff
    FROM warehouse_products p
    WHERE p.sheet_stock IS NOT NULL
  ), later AS (
    SELECT b.id AS pid, e.type, e.quantity, e.stock_before, e.stock_after,
           (e.type = 'adjustment' AND COALESCE(e.remarks, '') LIKE 'Warehouse sheet count%') AS sheet_recount
    FROM base b
    JOIN warehouse_entries e ON e.product_id = b.id
    LEFT JOIN warehouse_planned_shipments s ON s.id = e.consignment_id
    WHERE (e.consignment_id IS NULL AND e.created_at >= b.cutoff)
       OR (e.consignment_id IS NOT NULL AND s.dispatch_date > b.sheet_count_date)
  ), moves AS (
    SELECT b.id,
           COALESCE(SUM(
             CASE
               WHEN l.sheet_recount THEN 0
               WHEN l.stock_before IS NOT NULL AND l.stock_after IS NOT NULL
                 THEN l.stock_after - l.stock_before
               WHEN l.type = 'add'    THEN  l.quantity
               WHEN l.type = 'remove' THEN -l.quantity
               ELSE 0
             END), 0)::INTEGER AS moved,
           COALESCE(bool_or(l.type = 'adjustment' AND NOT l.sheet_recount), false) AS superseded
    FROM base b
    LEFT JOIN later l ON l.pid = b.id
    GROUP BY b.id
  )
  SELECT b.id, b.stock, b.sheet_stock, b.sheet_count_label, b.sheet_count_date,
         b.sheet_synced_at, b.sheet_status,
         m.moved,
         b.stock - m.moved,
         CASE WHEN m.superseded THEN 0 ELSE b.sheet_stock - (b.stock - m.moved) END,
         m.superseded
  FROM base b JOIN moves m ON m.id = b.id
$$;

REVOKE EXECUTE ON FUNCTION warehouse_save_consignment(BIGINT,TEXT,TEXT,TEXT,TEXT,INTEGER,JSONB,JSONB,TEXT[],TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION warehouse_dispatch_due_consignments() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION warehouse_sheet_reconciliation() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION warehouse_save_consignment(BIGINT,TEXT,TEXT,TEXT,TEXT,INTEGER,JSONB,JSONB,TEXT[],TEXT) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION warehouse_dispatch_due_consignments() TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION warehouse_sheet_reconciliation() TO authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Backfill: consignments scheduled under 005 hold no stock yet — deduct now.
--    One sub-transaction each; a shortage is recorded in dispatch_error.
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT s.* FROM warehouse_planned_shipments s
    WHERE s.status = 'scheduled' AND s.planned_deductions IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM warehouse_entries e WHERE e.consignment_id = s.id)
    ORDER BY s.id
  LOOP
    BEGIN
      PERFORM _warehouse_apply_consignment_delta(
        r.id, r.planned_deductions, r.destination,
        'Consignment #' || r.id || ' · ships ' || to_char(r.dispatch_date, 'FMDD Mon')
          || COALESCE(' · ' || r.reference, '') || COALESCE(' · ' || r.notes, ''),
        now(), r.images);
    EXCEPTION WHEN OTHERS THEN
      UPDATE warehouse_planned_shipments SET dispatch_error = SQLERRM WHERE id = r.id;
    END;
  END LOOP;
END $$;
