CREATE OR REPLACE FUNCTION public.reverse_production_batch_internal(_batch_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _prod record; _row record; _available numeric;
BEGIN
  SELECT product_id, showroom_id, SUM(qty) AS qty
    INTO _prod
    FROM public.stock_ledger
   WHERE ref_id = _batch_id AND ref_type = 'production'
     AND kind IN ('production', 'production_void')
   GROUP BY product_id, showroom_id;

  IF _prod.product_id IS NULL THEN
    RAISE EXCEPTION 'Batch % not found', _batch_id;
  END IF;

  IF COALESCE(_prod.qty, 0) <= 0 THEN
    RAISE EXCEPTION 'This batch has already been deleted/reversed';
  END IF;

  PERFORM public.assert_location_access(_prod.showroom_id);

  SELECT quantity INTO _available FROM public.product_stock
   WHERE product_id = _prod.product_id
     AND showroom_id IS NOT DISTINCT FROM _prod.showroom_id
   FOR UPDATE;
  IF COALESCE(_available, 0) < _prod.qty THEN
    RAISE EXCEPTION 'Cannot reverse this batch: only % of % produced units are still in stock (the rest was sold, transferred or wasted)',
      COALESCE(_available, 0), _prod.qty;
  END IF;

  FOR _row IN
    SELECT material_id, SUM(qty) AS qty
      FROM public.raw_stock_ledger
     WHERE ref_id = _batch_id AND ref_type = 'production'
       AND kind IN ('production_consume', 'production_reverse')
     GROUP BY material_id
     HAVING SUM(qty) <> 0
  LOOP
    PERFORM public.commit_raw_stock_movement(_row.material_id, _prod.showroom_id, -_row.qty,
      'production_reverse', 'production', _batch_id, COALESCE(_note, 'Batch reversed'));
  END LOOP;

  PERFORM public.commit_stock_movement(_prod.product_id, _prod.showroom_id, -_prod.qty,
    'production_void', 'production', _batch_id, COALESCE(_note, 'Batch reversed'));

  DELETE FROM public.production_overheads WHERE batch_id = _batch_id;
END; $$;

REVOKE ALL ON FUNCTION public.reverse_production_batch_internal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_production_batch_internal(uuid, text) TO service_role;