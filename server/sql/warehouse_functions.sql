-- ──────────────────────────────────────────────────────────────────────────────
-- Warehouse RPC functions — run this once in Supabase SQL Editor
-- These replace the Express server for all stock-write operations.
-- ──────────────────────────────────────────────────────────────────────────────

-- Helper: build timestamptz from optional date string (keeps current time)
CREATE OR REPLACE FUNCTION _warehouse_build_ts(p_entry_date text)
RETURNS timestamptz LANGUAGE sql AS $$
  SELECT CASE
    WHEN p_entry_date IS NOT NULL
    THEN (p_entry_date || ' ' || to_char(NOW(), 'HH24:MI:SS'))::timestamptz
    ELSE now()
  END
$$;

-- ── Bulk Add ──────────────────────────────────────────────────────────────────
-- p_additions: [{"name": "Sage Green Teether", "quantity": 100}, ...]
CREATE OR REPLACE FUNCTION warehouse_bulk_add(
  p_additions   jsonb,
  p_source      text,
  p_remarks     text    DEFAULT NULL,
  p_entry_date  text    DEFAULT NULL,
  p_image_urls  text[]  DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  i        int := 0;
  item     jsonb;
  prod     RECORD;
  entry    RECORD;
  ts       timestamptz := _warehouse_build_ts(p_entry_date);
  results  jsonb := '[]'::jsonb;
BEGIN
  FOR i IN 0 .. jsonb_array_length(p_additions) - 1
  LOOP
    item := p_additions -> i;

    SELECT id, stock INTO prod
    FROM warehouse_products
    WHERE LOWER(name) = LOWER(item->>'name')
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found: %', item->>'name';
    END IF;

    UPDATE warehouse_products
    SET stock = stock + (item->>'quantity')::int
    WHERE id = prod.id;

    INSERT INTO warehouse_entries(product_id, type, quantity, source, remarks, images, created_at)
    VALUES (prod.id, 'add', (item->>'quantity')::int, p_source, p_remarks,
            CASE WHEN i = 0 THEN p_image_urls ELSE '{}' END, ts)
    RETURNING * INTO entry;

    results := results || to_jsonb(entry);
  END LOOP;

  RETURN jsonb_build_object('entries', results);
END;
$$;

-- ── Bulk Remove ───────────────────────────────────────────────────────────────
-- p_deductions: [{"name": "Sage Green Teether", "quantity": 50}, ...]
-- Auto-deducts Corrugation Box, Blue Box (cloth/newborn), Ribbon (newborn).
CREATE OR REPLACE FUNCTION warehouse_bulk_remove(
  p_deductions  jsonb,
  p_destination text,
  p_remarks     text    DEFAULT NULL,
  p_entry_date  text    DEFAULT NULL,
  p_image_urls  text[]  DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  i                  int := 0;
  item               jsonb;
  prod               RECORD;
  entry              RECORD;
  ts                 timestamptz := _warehouse_build_ts(p_entry_date);
  results            jsonb := '[]'::jsonb;
  all_names          text[];
  product_key        text := NULL;
  ref_qty            int;
  corrugation_needed int := 0;
  needs_blue_box     bool := false;
  needs_ribbon       bool := false;

  CORRUGATION_ELE     constant int := 200;
  CORRUGATION_KIKO    constant int := 115;
  CORRUGATION_CLOTH   constant int := 28;
  CORRUGATION_NEWBORN constant int := 28;
BEGIN
  -- Collect lowercased item names
  SELECT array_agg(LOWER(p_deductions->j->>'name'))
  INTO all_names
  FROM generate_series(0, jsonb_array_length(p_deductions) - 1) AS j;

  -- Detect product family
  IF all_names && ARRAY['sage green teether','aqua blue teether','baby pink teether',
                         'oat beige teether','slate grey teether','ele box','ele thank you card'] THEN
    product_key := 'ele';
  ELSIF all_names && ARRAY['sage green kiko teether','cloud white kiko teether','kiko box'] THEN
    product_key := 'kiko';
  ELSIF all_names && ARRAY['my first patterns book','my first faces book','my first puzzles book','book kit sleeve'] THEN
    product_key := 'cloth';
  ELSIF all_names && ARRAY['flashcards','gift kit sleeve','gift kit thank you card'] THEN
    product_key := 'newborn';
  END IF;

  -- Reference quantity (min excluding flashcards)
  SELECT MIN((p_deductions->j->>'quantity')::int)
  INTO ref_qty
  FROM generate_series(0, jsonb_array_length(p_deductions) - 1) AS j
  WHERE LOWER(p_deductions->j->>'name') <> 'flashcards';

  IF ref_qty IS NULL THEN
    SELECT MIN((p_deductions->j->>'quantity')::int)
    INTO ref_qty
    FROM generate_series(0, jsonb_array_length(p_deductions) - 1) AS j;
  END IF;

  -- Calculate auto-deduction amounts
  corrugation_needed := CASE product_key
    WHEN 'ele'     THEN CEIL(ref_qty::numeric / CORRUGATION_ELE)::int
    WHEN 'kiko'    THEN CEIL(ref_qty::numeric / CORRUGATION_KIKO)::int
    WHEN 'cloth'   THEN CEIL(ref_qty::numeric / CORRUGATION_CLOTH)::int
    WHEN 'newborn' THEN CEIL(ref_qty::numeric / CORRUGATION_NEWBORN)::int
    ELSE 0
  END;
  needs_blue_box := product_key IN ('cloth', 'newborn');
  needs_ribbon   := product_key = 'newborn';

  -- ── Pre-validate auto-deducted items before touching anything ────────────
  IF corrugation_needed > 0 THEN
    SELECT id, stock INTO prod FROM warehouse_products WHERE LOWER(name) = 'corrugation box';
    IF NOT FOUND THEN RAISE EXCEPTION '"Corrugation Box" not found in inventory.'; END IF;
    IF prod.stock < corrugation_needed THEN
      RAISE EXCEPTION 'Insufficient Corrugation Box. Have: %, Need: %', prod.stock, corrugation_needed;
    END IF;
  END IF;

  IF needs_blue_box THEN
    SELECT id, stock INTO prod FROM warehouse_products WHERE LOWER(name) = 'blue box';
    IF NOT FOUND THEN RAISE EXCEPTION '"Blue Box" not found in inventory.'; END IF;
    IF prod.stock < ref_qty THEN
      RAISE EXCEPTION 'Insufficient Blue Box. Have: %, Need: %', prod.stock, ref_qty;
    END IF;
  END IF;

  IF needs_ribbon THEN
    SELECT id, stock INTO prod FROM warehouse_products WHERE LOWER(name) = 'ribbon';
    IF NOT FOUND THEN RAISE EXCEPTION '"Ribbon" not found in inventory.'; END IF;
    IF prod.stock < ref_qty THEN
      RAISE EXCEPTION 'Insufficient Ribbon. Have: %, Need: %', prod.stock, ref_qty;
    END IF;
  END IF;

  -- ── Deduct main items ────────────────────────────────────────────────────
  FOR i IN 0 .. jsonb_array_length(p_deductions) - 1
  LOOP
    item := p_deductions -> i;

    SELECT id, stock INTO prod
    FROM warehouse_products
    WHERE LOWER(name) = LOWER(item->>'name')
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Item not found: %', item->>'name'; END IF;

    IF prod.stock < (item->>'quantity')::int THEN
      RAISE EXCEPTION 'Insufficient stock for %. Have: %, Need: %',
        item->>'name', prod.stock, (item->>'quantity')::int;
    END IF;

    UPDATE warehouse_products SET stock = stock - (item->>'quantity')::int WHERE id = prod.id;

    INSERT INTO warehouse_entries(product_id, type, quantity, destination, remarks, images, created_at)
    VALUES (prod.id, 'remove', (item->>'quantity')::int, p_destination, p_remarks,
            CASE WHEN i = 0 THEN p_image_urls ELSE '{}' END, ts)
    RETURNING * INTO entry;

    results := results || to_jsonb(entry);
  END LOOP;

  -- ── Auto-deduct Corrugation Box ──────────────────────────────────────────
  IF corrugation_needed > 0 THEN
    SELECT id, stock INTO prod FROM warehouse_products WHERE LOWER(name) = 'corrugation box' FOR UPDATE;
    UPDATE warehouse_products SET stock = stock - corrugation_needed WHERE id = prod.id;
    INSERT INTO warehouse_entries(product_id, type, quantity, destination, remarks, images, created_at)
    VALUES (prod.id, 'remove', corrugation_needed, p_destination,
            'Auto: corrugation for ' || COALESCE(product_key,''), '{}', ts)
    RETURNING * INTO entry;
    results := results || to_jsonb(entry);
  END IF;

  -- ── Auto-deduct Blue Box ─────────────────────────────────────────────────
  IF needs_blue_box THEN
    SELECT id, stock INTO prod FROM warehouse_products WHERE LOWER(name) = 'blue box' FOR UPDATE;
    UPDATE warehouse_products SET stock = stock - ref_qty WHERE id = prod.id;
    INSERT INTO warehouse_entries(product_id, type, quantity, destination, remarks, images, created_at)
    VALUES (prod.id, 'remove', ref_qty, p_destination,
            'Auto: blue box for ' || COALESCE(product_key,''), '{}', ts)
    RETURNING * INTO entry;
    results := results || to_jsonb(entry);
  END IF;

  -- ── Auto-deduct Ribbon ───────────────────────────────────────────────────
  IF needs_ribbon THEN
    SELECT id, stock INTO prod FROM warehouse_products WHERE LOWER(name) = 'ribbon' FOR UPDATE;
    UPDATE warehouse_products SET stock = stock - ref_qty WHERE id = prod.id;
    INSERT INTO warehouse_entries(product_id, type, quantity, destination, remarks, images, created_at)
    VALUES (prod.id, 'remove', ref_qty, p_destination,
            'Auto: ' || ref_qty || 'm ribbon for newborn', '{}', ts)
    RETURNING * INTO entry;
    results := results || to_jsonb(entry);
  END IF;

  RETURN jsonb_build_object('entries', results);
END;
$$;

-- ── Single Entry (add / remove / adjustment) ──────────────────────────────────
CREATE OR REPLACE FUNCTION warehouse_single_entry(
  p_product_id  int,
  p_type        text,
  p_quantity    int,
  p_source      text    DEFAULT NULL,
  p_destination text    DEFAULT NULL,
  p_remarks     text    DEFAULT NULL,
  p_entry_date  text    DEFAULT NULL,
  p_image_urls  text[]  DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  prod       RECORD;
  entry      RECORD;
  next_stock int;
  ts         timestamptz := _warehouse_build_ts(p_entry_date);
BEGIN
  SELECT id, stock INTO prod FROM warehouse_products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found.'; END IF;

  next_stock := prod.stock;
  IF p_type = 'add'        THEN next_stock := next_stock + p_quantity;
  ELSIF p_type = 'remove'  THEN next_stock := next_stock - p_quantity;
  ELSIF p_type = 'adjustment' THEN next_stock := p_quantity;
  END IF;

  IF next_stock < 0 THEN
    RAISE EXCEPTION 'Insufficient stock. Have: %, Need: %', prod.stock, p_quantity;
  END IF;

  UPDATE warehouse_products SET stock = next_stock WHERE id = prod.id;

  INSERT INTO warehouse_entries(product_id, type, quantity, source, destination, remarks, images, created_at)
  VALUES (prod.id, p_type, p_quantity, p_source, p_destination, p_remarks, p_image_urls, ts)
  RETURNING * INTO entry;

  RETURN to_jsonb(entry);
END;
$$;

-- ── Delete Entry (reverses stock) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION warehouse_delete_entry(p_entry_id int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  entry RECORD;
BEGIN
  SELECT * INTO entry FROM warehouse_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found.'; END IF;

  IF entry.type = 'add' THEN
    UPDATE warehouse_products SET stock = GREATEST(0, stock - entry.quantity) WHERE id = entry.product_id;
  ELSIF entry.type = 'remove' THEN
    UPDATE warehouse_products SET stock = stock + entry.quantity WHERE id = entry.product_id;
  -- adjustment: cannot reliably reverse, leave stock unchanged
  END IF;

  DELETE FROM warehouse_entries WHERE id = p_entry_id;
END;
$$;

-- ── Report Stats ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION warehouse_report_stats(
  p_from      text  DEFAULT NULL,
  p_to        text  DEFAULT NULL,
  p_item_type text  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  from_date  date := COALESCE(p_from::date, CURRENT_DATE - 30);
  to_date    date := COALESCE(p_to::date, CURRENT_DATE);
  days_count int  := GREATEST(1, (to_date - from_date)::int);
  summary    RECORD;
  trend      jsonb;
  top_items  jsonb;
BEGIN
  -- Summary cards
  SELECT
    COALESCE(SUM(stock), 0)                                                    AS total_stock,
    COUNT(*) FILTER (WHERE stock = 0)                                          AS out_of_stock,
    COUNT(*) FILTER (WHERE stock > 0 AND stock <= low_stock_threshold)         AS low_stock
  INTO summary
  FROM warehouse_products
  WHERE (p_item_type IS NULL OR item_type = p_item_type);

  -- Daily trend
  SELECT jsonb_agg(
    jsonb_build_object('date', t.day, 'added', t.added, 'removed', t.removed)
    ORDER BY t.day
  ) INTO trend
  FROM (
    SELECT
      DATE(ie.created_at)                                                             AS day,
      SUM(CASE WHEN ie.type = 'add'    THEN ie.quantity ELSE 0 END)                  AS added,
      SUM(CASE WHEN ie.type = 'remove' THEN ie.quantity ELSE 0 END)                  AS removed
    FROM warehouse_entries ie
    JOIN warehouse_products p ON p.id = ie.product_id
    WHERE DATE(ie.created_at) BETWEEN from_date AND to_date
      AND (p_item_type IS NULL OR p.item_type = p_item_type)
    GROUP BY DATE(ie.created_at)
  ) t;

  -- Top items with days-remaining forecast
  SELECT jsonb_agg(
    jsonb_build_object(
      'name',            t.name,
      'item_type',       t.item_type,
      'current_stock',   t.current_stock,
      'total_added',     t.total_added,
      'total_removed',   t.total_removed,
      'avg_daily_usage', ROUND(t.total_removed::numeric / days_count, 2),
      'days_remaining',  CASE WHEN t.total_removed > 0
                           THEN FLOOR(t.current_stock::numeric * days_count / t.total_removed)::int
                           ELSE NULL END
    )
    ORDER BY t.total_removed DESC NULLS LAST
  ) INTO top_items
  FROM (
    SELECT
      p.name, p.item_type, p.stock AS current_stock,
      COALESCE(SUM(CASE WHEN ie.type = 'add'    THEN ie.quantity ELSE 0 END), 0) AS total_added,
      COALESCE(SUM(CASE WHEN ie.type = 'remove' THEN ie.quantity ELSE 0 END), 0) AS total_removed
    FROM warehouse_products p
    LEFT JOIN warehouse_entries ie ON ie.product_id = p.id
      AND DATE(ie.created_at) BETWEEN from_date AND to_date
      AND (p_item_type IS NULL OR p.item_type = p_item_type)
    WHERE (p_item_type IS NULL OR p.item_type = p_item_type)
    GROUP BY p.id, p.name, p.item_type, p.stock
  ) t;

  RETURN jsonb_build_object(
    'summary',  jsonb_build_object(
                  'total_stock',  summary.total_stock,
                  'out_of_stock', summary.out_of_stock,
                  'low_stock',    summary.low_stock),
    'trend',    COALESCE(trend, '[]'::jsonb),
    'topItems', COALESCE(top_items, '[]'::jsonb),
    'period',   jsonb_build_object('from', from_date, 'to', to_date, 'days', days_count)
  );
END;
$$;

-- Grant execute to all roles (functions use SECURITY DEFINER so they run as owner)
GRANT EXECUTE ON FUNCTION _warehouse_build_ts(text)           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_bulk_add(jsonb,text,text,text,text[])     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_bulk_remove(jsonb,text,text,text,text[])  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_single_entry(int,text,int,text,text,text,text,text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_delete_entry(int)         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_report_stats(text,text,text) TO anon, authenticated, service_role;
