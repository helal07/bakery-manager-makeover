-- Patch 38 — Server-side pagination for Batch History (idempotent).
-- Run once in the VPS SQL editor after 36 and 37.
-- Returns one page of batches plus range totals, so the browser never downloads
-- the whole production history. SECURITY INVOKER: normal access rules apply.
CREATE OR REPLACE FUNCTION public.batch_history_page(
  _from timestamptz, _to timestamptz, _product uuid DEFAULT NULL, _q text DEFAULT NULL,
  _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
WITH led AS (
  SELECT coalesce(ref_id, id) AS bid, product_id, qty, kind, created_at
  FROM stock_ledger
  WHERE showroom_id IS NULL AND kind IN ('production', 'production_void')
    AND created_at >= _from AND created_at <= _to
), agg AS (
  SELECT bid, sum(qty) AS net FROM led GROUP BY bid HAVING sum(qty) > 1e-9
), latest AS (
  SELECT DISTINCT ON (bid) bid, product_id, created_at FROM led
  WHERE kind = 'production' ORDER BY bid, created_at DESC
), b AS (
  SELECT a.bid, a.net, lt.product_id, lt.created_at, p.name, coalesce(p.price, 0) AS price,
         coalesce(p.transfer_price, 0) AS transfer_price
  FROM agg a JOIN latest lt ON lt.bid = a.bid LEFT JOIN products p ON p.id = lt.product_id
), mats AS (
  SELECT r.ref_id AS bid, r.material_id, m.name, m.unit, coalesce(m.cost, 0) AS cost, abs(sum(r.qty)) AS qty
  FROM raw_stock_ledger r LEFT JOIN raw_materials m ON m.id = r.material_id
  WHERE r.showroom_id IS NULL AND r.kind IN ('production_consume', 'production_reverse')
    AND r.ref_id IN (SELECT bid FROM b)
  GROUP BY r.ref_id, r.material_id, m.name, m.unit, m.cost
  HAVING abs(sum(r.qty)) > 1e-9
), mc AS (
  SELECT bid, sum(qty * cost) AS cost FROM mats GROUP BY bid
), oh AS (
  SELECT batch_id AS bid, sum(amount) AS amt FROM production_overheads
  WHERE batch_id IN (SELECT bid FROM b) GROUP BY batch_id
), allb AS (
  SELECT b.*, coalesce(oh.amt, 0) AS overhead, coalesce(mc.cost, 0) AS material_cost
  FROM b LEFT JOIN oh ON oh.bid = b.bid LEFT JOIN mc ON mc.bid = b.bid
), filt AS (
  SELECT * FROM allb f
  WHERE (_product IS NULL OR f.product_id = _product)
    AND (coalesce(_q, '') = ''
      OR upper(left(replace(f.bid::text, '-', ''), 6)) LIKE '%' || upper(_q) || '%'
      OR f.name ILIKE '%' || _q || '%'
      OR EXISTS (SELECT 1 FROM mats x WHERE x.bid = f.bid AND x.name ILIKE '%' || _q || '%'))
), pg AS (
  SELECT * FROM filt ORDER BY created_at DESC LIMIT greatest(_limit, 1) OFFSET greatest(_offset, 0)
)
SELECT jsonb_build_object(
  'total', (SELECT count(*) FROM filt),
  'totals', (SELECT jsonb_build_object(
      'qty', coalesce(sum(net), 0), 'cost', coalesce(sum(material_cost), 0),
      'overhead', coalesce(sum(overhead), 0), 'value', coalesce(sum(net * price), 0)) FROM filt),
  'products', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', product_id, 'name', name) ORDER BY name), '[]'::jsonb)
               FROM (SELECT DISTINCT product_id, name FROM allb) d),
  'rows', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'bid', pg.bid, 'net', pg.net, 'product_id', pg.product_id, 'created_at', pg.created_at,
      'name', pg.name, 'price', pg.price, 'transfer_price', pg.transfer_price,
      'overhead', pg.overhead, 'material_cost', pg.material_cost,
      'materials', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'name', coalesce(x.name, '—'), 'unit', coalesce(x.unit, ''), 'qty', x.qty, 'cost', x.qty * x.cost)
          ORDER BY x.name) FROM mats x WHERE x.bid = pg.bid), '[]'::jsonb)
    ) ORDER BY pg.created_at DESC), '[]'::jsonb) FROM pg)
);
$$;

REVOKE ALL ON FUNCTION public.batch_history_page(timestamptz, timestamptz, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_history_page(timestamptz, timestamptz, uuid, text, integer, integer) TO authenticated, service_role;
