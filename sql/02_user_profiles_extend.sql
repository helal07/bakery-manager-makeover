-- Adds missing columns used by My Profile page (bio, language, timezone, software).
-- Safe to re-run. After running, PostgREST schema cache is reloaded via NOTIFY.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS bio       text,
  ADD COLUMN IF NOT EXISTS language  text,
  ADD COLUMN IF NOT EXISTS timezone  text,
  ADD COLUMN IF NOT EXISTS software  jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
