ALTER TABLE public.transfers RENAME COLUMN from_showroom_id TO source_showroom_id;
ALTER TABLE public.transfers RENAME COLUMN to_showroom_id TO dest_showroom_id;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS received_at timestamp with time zone;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.transfers ALTER COLUMN status SET DEFAULT 'draft';
NOTIFY pgrst, 'reload schema';