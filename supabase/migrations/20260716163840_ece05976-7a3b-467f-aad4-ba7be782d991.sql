REVOKE ALL ON FUNCTION public.commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.commit_production_batch(uuid, uuid, numeric, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_production_batch(uuid, uuid, numeric, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_production_batch(uuid, uuid, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_production_batch(uuid, uuid, numeric, jsonb) TO service_role;