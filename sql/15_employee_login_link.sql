-- Employee ↔ auth.users link + first-run signup lock helpers.
-- Idempotent; safe to run multiple times on self-hosted Supabase.

-- 1. employees.user_id ---------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_uniq
  ON public.employees(user_id)
  WHERE user_id IS NOT NULL;

-- 2. has_any_user() RPC (callable by anon so /auth can decide) ------------
CREATE OR REPLACE FUNCTION public.has_any_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users);
$$;

GRANT EXECUTE ON FUNCTION public.has_any_user() TO anon, authenticated;

-- 3. Reload PostgREST schema ---------------------------------------------
NOTIFY pgrst, 'reload schema';
