-- 07 sales shipping
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shipping numeric NOT NULL DEFAULT 0;

-- 08 employees extended
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.app_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS national_id text,
  ADD COLUMN IF NOT EXISTS joining_date date,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS emergency_contact text,
  ADD COLUMN IF NOT EXISTS emergency_phone text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 09 showroom settings
ALTER TABLE public.showrooms ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_effective_invoice_settings(_showroom_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE((SELECT settings->'invoice' FROM public.company_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1),'{}'::jsonb)
    ||
    COALESCE((SELECT settings->'invoice' FROM public.showrooms WHERE id = _showroom_id),'{}'::jsonb);
$$;
GRANT EXECUTE ON FUNCTION public.get_effective_invoice_settings(uuid) TO authenticated, anon;

-- 10 raw_materials.min_stock (already ensured in step 1; no-op safety)
ALTER TABLE public.raw_materials ADD COLUMN IF NOT EXISTS min_stock numeric NOT NULL DEFAULT 0;

-- 11 transfers kind (already covered in step 1; safety)
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS kind text;

-- 12 invoice bundle RPC
CREATE OR REPLACE FUNCTION public.get_invoice_bundle(_sale_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sale sales%ROWTYPE;
  _items jsonb; _pays jsonb; _showroom jsonb;
  _customer_address text;
  _prev_due numeric := 0; _outstanding numeric := 0; _paid_standalone numeric := 0;
  _phone text;
BEGIN
  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id;
  IF NOT FOUND THEN
    SELECT * INTO _sale FROM public.sales WHERE external_ref = _sale_id::text LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO _items FROM (
    SELECT si.*, p.name AS _p_name, p.sku AS _p_sku
    FROM public.sale_items si LEFT JOIN public.products p ON p.id = si.product_id
    WHERE si.sale_id = _sale.id
  ) x;

  SELECT COALESCE(jsonb_agg(row_to_json(sp)), '[]'::jsonb) INTO _pays
  FROM (SELECT method, amount, reference FROM public.sale_payments
        WHERE sale_id = _sale.id ORDER BY created_at ASC) sp;

  IF _sale.showroom_id IS NOT NULL THEN
    SELECT to_jsonb(s) INTO _showroom FROM (
      SELECT id, name, code, address, city, phone, manager_name FROM public.showrooms WHERE id = _sale.showroom_id
    ) s;
  END IF;

  IF _sale.customer_id IS NOT NULL THEN
    SELECT address INTO _customer_address FROM public.customers WHERE id = _sale.customer_id;
  END IF;
  IF _customer_address IS NULL AND _sale.customer_phone IS NOT NULL THEN
    SELECT address INTO _customer_address FROM public.customers WHERE phone = _sale.customer_phone LIMIT 1;
  END IF;

  _phone := regexp_replace(COALESCE(_sale.customer_phone, ''), '\D', '', 'g');
  IF _sale.customer_id IS NOT NULL OR _phone <> '' THEN
    SELECT COALESCE(SUM(due), 0) INTO _outstanding FROM public.sales
    WHERE id <> _sale.id AND created_at < _sale.created_at
      AND ((_sale.customer_id IS NOT NULL AND customer_id = _sale.customer_id)
        OR (_phone <> '' AND regexp_replace(COALESCE(customer_phone,''), '\D', '', 'g') = _phone));
    SELECT COALESCE(SUM(amount), 0) INTO _paid_standalone FROM public.customer_payments
    WHERE sale_id IS NULL AND created_at < _sale.created_at
      AND ((_sale.customer_id IS NOT NULL AND customer_id = _sale.customer_id)
        OR (_phone <> '' AND regexp_replace(COALESCE(customer_phone,''), '\D', '', 'g') = _phone));
    _prev_due := GREATEST(0, _outstanding - _paid_standalone);
  END IF;

  RETURN jsonb_build_object(
    'sale', to_jsonb(_sale), 'items', _items, 'payments', _pays,
    'showroom', _showroom, 'customer_address', _customer_address, 'previous_due', _prev_due
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_invoice_bundle(uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';