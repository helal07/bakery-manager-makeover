-- ============================================================================
-- 29_missing_staff_guard.sql
-- Fix: "function public.assert_app_staff() does not exist"
--
-- sql/25_strict_tenant_isolation.sql calls public.assert_app_staff() from every
-- commit_* RPC, but the helper itself was never part of that file, so a fresh
-- self-hosted database ends up with RPCs that reference a missing function.
-- Any purchase / production / stock movement then fails, even for a superadmin.
--
-- Run this once. Idempotent — safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_app_staff(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user)
    OR EXISTS (SELECT 1 FROM public.user_role_assignments WHERE user_id = _user)
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_app_staff()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN; END IF;
  IF NOT public.is_app_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.is_app_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_app_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_app_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_app_staff() TO authenticated, service_role;
