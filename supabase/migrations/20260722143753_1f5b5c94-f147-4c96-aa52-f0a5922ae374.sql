ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_uniq
  ON public.employees(user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.find_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_any_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users);
$$;

GRANT EXECUTE ON FUNCTION public.has_any_user() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';