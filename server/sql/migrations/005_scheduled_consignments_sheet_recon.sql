-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Scheduled consignments, sheet reconciliation, challan aliases
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- 1. Scheduled consignments
--    A consignment logged with a future dispatch date is saved as 'scheduled':
--    lines and the resolved component deductions are stored, no stock moves.
--    On (or after) its date, warehouse_dispatch_due_consignments() dispatches
--    it through the same delta logic as a manual dispatch, so History rows are
--    linked and dated on the dispatch date. If stock is short on the day, the
--    consignment stays 'scheduled' and the reason is kept in dispatch_error.
--    The app calls the function on load; pg_cron can call it too (section 4).
--
-- 2. Sheet reconciliation
--    The warehouse Google Sheet count is stored next to system stock instead of
--    overwriting it. The difference is measured at the count date (system
--    stock then = stock now minus every move logged after the count day), so a
--    consignment dispatched after the count doesn't show up as a false gap.
--    A person accepts (recount to the sheet) or ignores each difference.
--
-- 3. Challan aliases
--    When a delivery-challan line is matched to a SKU by hand, the match is
--    remembered per platform so the next upload maps it automatically.
--
-- Dates are India dates (Asia/Kolkata); the database runs in UTC.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _warehouse_today()
RETURNS DATE LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date
$$;

-- Timestamp for an entry dated p_entry_date (an India calendar day).
-- Today → now(). Another day → that day at the current India time of day.
-- The old version glued the date to the UTC clock and read it as UTC, so
-- anything logged between 00:00 and 05:30 IST landed on the next day.
CREATE OR REPLACE FUNCTION _warehouse_build_ts(p_entry_date text)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN NULLIF(p_entry_date, '') IS NULL OR p_entry_date::date = _warehouse_today() THEN now()
    ELSE (p_entry_date::date + (now() AT TIME ZONE 'Asia/Kolkata')::time) AT TIME ZONE 'Asia/Kolkata'
  END
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Scheduled consignments
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE warehouse_planned_shipments
  ADD COLUMN IF NOT EXISTS planned_deductions JSONB,
  ADD COLUMN IF NOT EXISTS dispatch_error     TEXT,
  ADD COLUMN IF NOT EXISTS source_document    TEXT;

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
  CHECK (status IN ('pending', 'approved', 'rejected', 'scheduled', 'dispatched', 'cancelled'));

CREATE INDEX IF NOT EXISTS warehouse_planned_shipments_due_idx
  ON warehouse_planned_shipments(dispatch_date) WHERE status = 'scheduled';

-- Signature changes (new p_source_document), so drop the 004 version first.
DROP FUNCTION IF EXISTS warehouse_save_consignment(BIGINT,TEXT,TEXT,TEXT,TEXT,INTEGER,JSONB,JSONB,TEXT[]);

-- Create / schedule / dispatch / edit a consignment.
-- p_id NULL                  → new consignment.
-- p_id = plan or scheduled   → header + lines replaced; dispatched if its date
--                              is today or earlier, otherwise (re)scheduled.
-- p_id = dispatched          → header + lines replaced, stock corrected by the
--                              delta. Its date can't move into the future.
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
  p_image_urls        TEXT[] DEFAULT '{}',
  p_source_document   TEXT   DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hdr        RECORD;
  cid        BIGINT;
  was_live   BOOLEAN := false;
  prev_date  DATE;
  v_date     DATE;
  v_future   BOOLEAN;
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
    was_live  := hdr.status = 'dispatched';
    prev_date := hdr.dispatch_date;
  END IF;

  v_date   := COALESCE(NULLIF(p_dispatch_date, '')::date, prev_date, _warehouse_today());
  v_future := v_date > _warehouse_today();

  IF was_live AND v_future THEN
    RAISE EXCEPTION 'Consignment #% has already been dispatched, so its date can''t be in the future.', p_id;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO warehouse_planned_shipments
      (destination, status, notes, dispatch_date, reference, corrugation_boxes, images,
       planned_deductions, source_document, updated_at)
    VALUES
      (p_destination, CASE WHEN v_future THEN 'scheduled' ELSE 'dispatched' END,
       NULLIF(p_notes, ''), v_date, NULLIF(p_reference, ''), p_corrugation_boxes,
       COALESCE(p_image_urls, '{}'), p_deductions, NULLIF(p_source_document, ''), now())
    RETURNING id INTO cid;
  ELSE
    cid := p_id;
    UPDATE warehouse_planned_shipments SET
      destination        = p_destination,
      status             = CASE WHEN v_future THEN 'scheduled' ELSE 'dispatched' END,
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

  IF v_future THEN
    RETURN jsonb_build_object('id', cid, 'status', 'scheduled', 'dispatch_date', v_date,
                              'entries_written', 0, 'edited', p_id IS NOT NULL);
  END IF;

  -- First dispatch is dated on the dispatch date; later corrections are dated
  -- when they were made, so History shows when the change actually happened.
  IF was_live THEN
    ts := now();
    remark := 'Consignment #' || cid || ' edited';
  ELSE
    ts := _warehouse_build_ts(v_date::text);
    remark := 'Consignment #' || cid
              || COALESCE(' · ' || NULLIF(p_reference, ''), '')
              || COALESCE(' · ' || NULLIF(p_notes, ''), '');
  END IF;

  written := _warehouse_apply_consignment_delta(
    cid, p_deductions, p_destination, remark, ts,
    CASE WHEN was_live THEN '{}'::TEXT[] ELSE p_image_urls END);

  RETURN jsonb_build_object('id', cid, 'status', 'dispatched', 'dispatch_date', v_date,
                            'entries_written', written, 'edited', was_live);
END;
$$;

-- Dispatch every scheduled consignment whose date has arrived. Each one runs in
-- its own sub-transaction: a shortage on one leaves it scheduled (with the
-- reason in dispatch_error) and doesn't block the rest. SKIP LOCKED makes two
-- simultaneous callers (two open browsers, or cron + browser) safe.
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
          || COALESCE(' · ' || r.notes, '')
          || ' · auto-dispatched on its date',
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

-- Cancel: dispatched → stock returned, kept as 'cancelled'.
--         scheduled  → no stock moved yet, kept as 'cancelled'.
--         old plan   → deleted (it never touched stock).
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

  IF hdr.status = 'scheduled' THEN
    UPDATE warehouse_planned_shipments
    SET status = 'cancelled', dispatch_error = NULL, updated_at = now()
    WHERE id = p_id;
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

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Sheet reconciliation
-- ═════════════════════════════════════════════════════════════════════════════
-- sheet_status: 'open'     — difference not reviewed yet
--               'accepted' — stock was set to match the sheet
--               'ignored'  — a person kept the system number
-- A new count (different value or date) reopens the row.
ALTER TABLE warehouse_products
  ADD COLUMN IF NOT EXISTS sheet_stock       INTEGER,
  ADD COLUMN IF NOT EXISTS sheet_count_label TEXT,
  ADD COLUMN IF NOT EXISTS sheet_count_date  DATE,
  ADD COLUMN IF NOT EXISTS sheet_synced_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sheet_status      TEXT;

-- p_counts: [{"product_id": 12, "stock": 340, "label": "18 November", "date": "2026-11-18"}, ...]
CREATE OR REPLACE FUNCTION warehouse_record_sheet_counts(p_counts JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changed INTEGER;
BEGIN
  WITH c AS (
    SELECT (x->>'product_id')::BIGINT AS product_id,
           (x->>'stock')::INTEGER     AS stock,
           NULLIF(x->>'label', '')    AS label,
           NULLIF(x->>'date', '')::date AS cdate
    FROM jsonb_array_elements(COALESCE(p_counts, '[]'::jsonb)) x
  ), upd AS (
    UPDATE warehouse_products p SET
      sheet_status      = CASE
                            WHEN p.sheet_stock IS DISTINCT FROM c.stock
                              OR p.sheet_count_date IS DISTINCT FROM c.cdate
                            THEN 'open' ELSE p.sheet_status END,
      sheet_stock       = c.stock,
      sheet_count_label = c.label,
      sheet_count_date  = c.cdate,
      sheet_synced_at   = now()
    FROM c
    WHERE p.id = c.product_id
    RETURNING 1
  )
  SELECT count(*) INTO changed FROM upd;

  RETURN jsonb_build_object('recorded', changed);
END;
$$;

-- Per item: system stock at the end of the count day vs the sheet count.
--   moved_since     = net change logged after the count day, EXCLUDING
--                     • recounts that applied a sheet count (remarks start
--                       "Warehouse sheet count") — they are the reconciliation
--                       itself, so after "Use sheet" the diff drops to 0;
--                     • corrections / cancellations of consignments dispatched
--                       on or before the count day — the count saw the goods
--                       where they physically were.
--   system_at_count = stock - moved_since
--   diff            = sheet_stock - system_at_count  (+ = sheet has more)
--   superseded      = someone recounted the item by hand after the count day
--                     (Stock Entry recount / Admin edit). That newer number
--                     wins, so no diff is reported.
-- Accepting a diff sets stock to stock + diff, i.e. "the sheet count, carried
-- forward by everything logged since".
DROP FUNCTION IF EXISTS warehouse_resolve_sheet_diff(BIGINT, TEXT);
DROP FUNCTION IF EXISTS warehouse_sheet_reconciliation();
CREATE FUNCTION warehouse_sheet_reconciliation()
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
           (e.type = 'adjustment' AND COALESCE(e.remarks, '') LIKE 'Warehouse sheet count%') AS sheet_recount,
           (e.consignment_id IS NOT NULL AND s.dispatch_date <= b.sheet_count_date)          AS precount_consignment
    FROM base b
    JOIN warehouse_entries e ON e.product_id = b.id AND e.created_at >= b.cutoff
    LEFT JOIN warehouse_planned_shipments s ON s.id = e.consignment_id
  ), moves AS (
    SELECT b.id,
           COALESCE(SUM(
             CASE
               WHEN l.sheet_recount OR l.precount_consignment THEN 0
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

-- Accept or ignore one item's difference. Locks the item and re-checks that
-- its difference is still open, so a double click, a second tab or "accept
-- all" over a stale list can't apply it twice.
CREATE FUNCTION warehouse_resolve_sheet_diff(p_product_id BIGINT, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur_status TEXT;
  rec        RECORD;
  target     INTEGER;
BEGIN
  IF p_action NOT IN ('accept', 'ignore') THEN
    RAISE EXCEPTION 'Unknown action %', p_action;
  END IF;

  SELECT sheet_status INTO cur_status FROM warehouse_products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found.'; END IF;
  IF cur_status IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('product_id', p_product_id, 'action', 'none', 'status', cur_status);
  END IF;

  SELECT * INTO rec FROM warehouse_sheet_reconciliation() r WHERE r.product_id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No sheet count recorded for this item.'; END IF;

  IF p_action = 'accept' AND rec.diff <> 0 THEN
    target := rec.stock + rec.diff;
    IF target < 0 THEN
      RAISE EXCEPTION 'Accepting would make stock negative (%). Check the sheet count.', target;
    END IF;
    -- The reconciliation recognises this recount by its "Warehouse sheet count"
    -- prefix. Keep it.
    PERFORM warehouse_set_stock(
      p_product_id, target,
      'Warehouse sheet count (' || COALESCE(rec.sheet_count_label, rec.sheet_count_date::text) || ')'
        || CASE WHEN rec.moved_since <> 0
                THEN ' + ' || rec.moved_since || ' moved since' ELSE '' END);
  END IF;

  UPDATE warehouse_products
  SET sheet_status = CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'ignored' END
  WHERE id = p_product_id;

  RETURN jsonb_build_object('product_id', p_product_id, 'action', p_action,
                            'diff', rec.diff, 'new_stock', COALESCE(target, rec.stock));
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Delivery-challan aliases
-- ═════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS warehouse_challan_aliases (
  id          BIGSERIAL PRIMARY KEY,
  platform    TEXT NOT NULL,
  match_key   TEXT NOT NULL,     -- normalised description or platform item code
  sku_key     TEXT NOT NULL,
  variant_key TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, match_key)
);
ALTER TABLE warehouse_challan_aliases ENABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Grants (+ optional nightly job)
-- ═════════════════════════════════════════════════════════════════════════════
-- The app connects with the service role. The new functions aren't opened to
-- anon (Postgres grants EXECUTE to PUBLIC by default, so revoke that first).
-- warehouse_cancel_consignment keeps 004's grants.
REVOKE EXECUTE ON FUNCTION warehouse_save_consignment(BIGINT,TEXT,TEXT,TEXT,TEXT,INTEGER,JSONB,JSONB,TEXT[],TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION warehouse_dispatch_due_consignments()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION warehouse_record_sheet_counts(JSONB)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION warehouse_sheet_reconciliation()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION warehouse_resolve_sheet_diff(BIGINT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION warehouse_save_consignment(BIGINT,TEXT,TEXT,TEXT,TEXT,INTEGER,JSONB,JSONB,TEXT[],TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_dispatch_due_consignments()    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_cancel_consignment(BIGINT)     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_record_sheet_counts(JSONB)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_sheet_reconciliation()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION warehouse_resolve_sheet_diff(BIGINT,TEXT) TO authenticated, service_role;
GRANT ALL ON warehouse_challan_aliases TO service_role;
GRANT USAGE, SELECT ON SEQUENCE warehouse_challan_aliases_id_seq TO service_role;

-- Optional: dispatch due consignments at 00:05 IST even if nobody opens the app.
-- Enable pg_cron in Supabase (Database → Extensions) first, then run:
--
--   SELECT cron.schedule('dispatch-due-consignments', '35 18 * * *',
--                        $$SELECT warehouse_dispatch_due_consignments()$$);
