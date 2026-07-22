UPDATE public.raw_material_stock  SET showroom_id = NULL WHERE showroom_id IS NOT NULL;
UPDATE public.raw_stock_ledger    SET showroom_id = NULL WHERE showroom_id IS NOT NULL;
UPDATE public.wastage_log         SET showroom_id = NULL WHERE showroom_id IS NOT NULL;
UPDATE public.qc_checks           SET showroom_id = NULL WHERE showroom_id IS NOT NULL;
UPDATE public.work_orders         SET showroom_id = NULL WHERE showroom_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='raw_material_stock_factory_only') THEN
    ALTER TABLE public.raw_material_stock ADD CONSTRAINT raw_material_stock_factory_only CHECK (showroom_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='raw_stock_ledger_factory_only') THEN
    ALTER TABLE public.raw_stock_ledger ADD CONSTRAINT raw_stock_ledger_factory_only CHECK (showroom_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='wastage_log_factory_only') THEN
    ALTER TABLE public.wastage_log ADD CONSTRAINT wastage_log_factory_only CHECK (showroom_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='qc_checks_factory_only') THEN
    ALTER TABLE public.qc_checks ADD CONSTRAINT qc_checks_factory_only CHECK (showroom_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='work_orders_factory_only') THEN
    ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_factory_only CHECK (showroom_id IS NULL);
  END IF;
END $$;

INSERT INTO public.permissions (permission_key, label, module) VALUES
  ('production.view','View production module','Production'),
  ('production.batches','Run production batches','Production'),
  ('production.recipes','Manage recipes / BOM','Production'),
  ('production.work_orders','Manage work orders','Production'),
  ('production.qc','Perform QC checks','Production'),
  ('production.wastage','Log wastage','Production'),
  ('production.reports','View production reports','Production'),
  ('raw_materials.manage','Manage raw materials','Production'),
  ('raw_stock.manage','Manage raw material stock','Production')
ON CONFLICT (permission_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';