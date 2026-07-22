ALTER TABLE public.sale_return_items ADD COLUMN IF NOT EXISTS condition text DEFAULT 'resellable';
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS kind text DEFAULT 'normal';
ALTER TABLE public.showrooms ADD COLUMN IF NOT EXISTS is_factory boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.damaged_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  showroom_id uuid REFERENCES public.showrooms(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS damaged_stock_product_showroom_uniq
  ON public.damaged_stock (product_id, COALESCE(showroom_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.damaged_stock TO authenticated;
GRANT ALL ON public.damaged_stock TO service_role;
ALTER TABLE public.damaged_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "damaged_stock all authed" ON public.damaged_stock;
CREATE POLICY "damaged_stock all authed" ON public.damaged_stock FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.damaged_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  showroom_id uuid REFERENCES public.showrooms(id) ON DELETE SET NULL,
  qty numeric NOT NULL,
  kind text NOT NULL,
  ref_type text,
  ref_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.damaged_ledger TO authenticated;
GRANT ALL ON public.damaged_ledger TO service_role;
ALTER TABLE public.damaged_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "damaged_ledger all authed" ON public.damaged_ledger;
CREATE POLICY "damaged_ledger all authed" ON public.damaged_ledger FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.repurpose_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty numeric NOT NULL,
  source_showroom_id uuid REFERENCES public.showrooms(id) ON DELETE SET NULL,
  transfer_id uuid REFERENCES public.transfers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  converted_material_id uuid REFERENCES public.raw_materials(id),
  yield_qty numeric,
  wastage_qty numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repurpose_queue TO authenticated;
GRANT ALL ON public.repurpose_queue TO service_role;
ALTER TABLE public.repurpose_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "repurpose_queue all authed" ON public.repurpose_queue;
CREATE POLICY "repurpose_queue all authed" ON public.repurpose_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.commit_damaged_movement(
  _product_id uuid, _showroom_id uuid, _qty numeric, _kind text,
  _ref_type text DEFAULT NULL, _ref_id uuid DEFAULT NULL, _note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ledger_id uuid;
BEGIN
  INSERT INTO public.damaged_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_product_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  RETURNING id INTO _ledger_id;
  UPDATE public.damaged_stock SET quantity = quantity + _qty, updated_at = now()
   WHERE product_id = _product_id AND showroom_id IS NOT DISTINCT FROM _showroom_id;
  IF NOT FOUND THEN
    INSERT INTO public.damaged_stock (product_id, showroom_id, quantity) VALUES (_product_id, _showroom_id, _qty);
  END IF;
  RETURN _ledger_id;
END; $$;

CREATE OR REPLACE FUNCTION public.commit_damaged_transfer_approve(_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t record; _it record;
BEGIN
  SELECT * INTO _t FROM public.transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer % not found', _transfer_id; END IF;
  IF _t.kind IS DISTINCT FROM 'damaged_return' THEN
    RAISE EXCEPTION 'Transfer % is not a damaged return', _transfer_id;
  END IF;
  FOR _it IN SELECT product_id, qty FROM public.transfer_items WHERE transfer_id = _transfer_id LOOP
    PERFORM public.commit_damaged_movement(_it.product_id, _t.source_showroom_id, -abs(_it.qty),
      'transfer_out', 'transfer', _transfer_id, 'Damaged return to factory');
    INSERT INTO public.repurpose_queue (product_id, qty, source_showroom_id, transfer_id, status)
    VALUES (_it.product_id, _it.qty, _t.source_showroom_id, _transfer_id, 'pending');
  END LOOP;
  UPDATE public.transfers SET status='received', received_at=now() WHERE id=_transfer_id;
END; $$;

CREATE OR REPLACE FUNCTION public.commit_repurpose(
  _queue_id uuid, _material_id uuid, _yield_qty numeric, _wastage_qty numeric, _note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _q record;
BEGIN
  SELECT * INTO _q FROM public.repurpose_queue WHERE id=_queue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue item % not found', _queue_id; END IF;
  IF _q.status <> 'pending' THEN RAISE EXCEPTION 'Queue item already processed'; END IF;
  IF _material_id IS NOT NULL THEN
    IF _yield_qty IS NULL OR _yield_qty <= 0 THEN RAISE EXCEPTION 'Yield quantity must be greater than zero'; END IF;
    PERFORM public.commit_raw_stock_movement(_material_id, NULL, _yield_qty, 'repurpose_in',
      'repurpose', _queue_id, COALESCE(_note, 'Repurposed from damaged product'));
  END IF;
  IF _wastage_qty IS NOT NULL AND _wastage_qty > 0 THEN
    INSERT INTO public.wastage_log (material_id, showroom_id, qty, reason, notes)
    VALUES (COALESCE(_material_id, (SELECT id FROM public.raw_materials LIMIT 1)), NULL, _wastage_qty,
      CASE WHEN _material_id IS NULL THEN 'repurpose_discard' ELSE 'repurpose_wastage' END, _note);
  END IF;
  INSERT INTO public.damaged_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_q.product_id, NULL, -abs(_q.qty),
    CASE WHEN _material_id IS NULL THEN 'discard' ELSE 'repurpose_out' END, 'repurpose', _queue_id, _note);
  UPDATE public.repurpose_queue
     SET status = CASE WHEN _material_id IS NULL THEN 'discarded' ELSE 'converted' END,
         converted_material_id=_material_id, yield_qty=_yield_qty, wastage_qty=_wastage_qty,
         note=COALESCE(_note, note), processed_at=now()
   WHERE id=_queue_id;
END; $$;

INSERT INTO public.permissions (permission_key, label, module) VALUES
  ('sales.return.damaged','Mark returned items as damaged','Sales'),
  ('transfers.damaged.create','Create damaged-return transfer','Transfers'),
  ('production.repurpose','Repurpose damaged products','Production'),
  ('production.repurpose.report','View repurpose history','Production')
ON CONFLICT (permission_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';