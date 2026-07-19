ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shipping numeric NOT NULL DEFAULT 0;
NOTIFY pgrst, 'reload schema';