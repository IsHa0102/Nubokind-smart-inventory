-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: Master product ID on every consignment line
-- Run once in the Supabase SQL Editor (after 007). Safe to re-run.
--
-- The amazon-dashboard consignment calendar reads consignments logged here to
-- plan around what was really sent. Lines carry sku_key / variant_key, which
-- are this app's own keys; master_id is the shared product ID (sku_mapping,
-- lib/products.ts) so the dashboard joins on it and never on a name.
-- The app fills it from SHIPMENT_PRODUCTS (masterIdFor() in
-- client/src/lib/shipmentConfig.js). NULL means "not a sellable master"
-- (Potli) — the dashboard flags such a line, never guesses.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE warehouse_planned_shipment_lines ADD COLUMN IF NOT EXISTS master_id TEXT;

-- Same as 007, plus master_id on each line.
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

  INSERT INTO warehouse_planned_shipment_lines (shipment_id, sku_key, variant_key, master_id, quantity, label)
  SELECT cid, l->>'sku_key', NULLIF(l->>'variant_key', ''), NULLIF(l->>'master_id', ''),
         (l->>'quantity')::INTEGER, l->>'label'
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
-- Backfill: the same mapping as SHIPMENT_PRODUCTS, for lines saved before 008.
-- ═════════════════════════════════════════════════════════════════════════════
UPDATE warehouse_planned_shipment_lines l SET master_id = m.master_id
FROM (VALUES
  ('ele', 'sg_ab', 'TE-EL-BL-GR-2'), ('ele', 'bp_ob', 'TE-EL-BE-PI-2'),
  ('ele', 'sg_sg', 'TE-EL-GR-GY-2'), ('ele', 'ab_ob', 'TE-EL-BE-BL-2'),
  ('ele', 'ab_bp', 'TE-EL-BL-PI-2'), ('ele', 'sg_ob', 'TE-EL-BE-GR-2'),
  ('ele', 'sg_bp', 'TE-EL-GR-PI-2'),
  ('kiko', 'sg', 'TE-KI-GR-1'), ('kiko', 'cw', 'TE-KI-WH-1'), ('kiko', 'bl', 'TE-KI-BL-1'),
  ('ball', 'ye', 'TE-BA-YE-1'), ('ball', 'bl', 'TE-BA-BL-1'),
  ('cloth', '', 'BO-HC-3'), ('newborn', '', 'SK-HC-3'), ('mat', '', 'MA-SE-1'),
  ('ganesha', '', 'PL-CG-1'), ('fb-combo', '', 'FK-HC-2')
) AS m(sku_key, variant_key, master_id)
WHERE l.master_id IS NULL
  AND l.sku_key = m.sku_key
  AND COALESCE(l.variant_key, '') = m.variant_key;
