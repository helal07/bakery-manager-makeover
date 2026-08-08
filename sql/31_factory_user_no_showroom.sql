-- ============================================================================
-- Patch 31 — Factory access for staff with no showroom + Batch History permission
-- Run once in the production VPS Supabase SQL editor. Idempotent.
--
-- Problem this fixes:
--   An employee with only Production permissions and NO showroom assigned could
--   commit a production batch (the RPC is SECURITY DEFINER), but every later
--   read of that batch was filtered out by RLS, because user_is_factory_user()
--   required an assignment to a showroom flagged is_factory. So production
--   "saved" successfully yet never appeared in Batch History.
--
-- Rule after this patch: a staff user with no showroom assignment at all is a
-- Factory user (production lives at showroom_id IS NULL). Users assigned to one
-- or more showrooms are unaffected — they only get Factory access when one of
-- their assignments is the factory.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.user_is_factory_user(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user IS NOT NULL AND (
    public.user_is_global_admin(_user)
    OR EXISTS (
      SELECT 1 FROM public.user_role_assignments a
      JOIN public.showrooms s ON s.id = a.showroom_id
      WHERE a.user_id = _user AND s.is_factory IS TRUE)
    -- staff with a role but no showroom scope at all => factory-scoped
    OR (
      EXISTS (SELECT 1 FROM public.user_role_assignments a WHERE a.user_id = _user)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_role_assignments a
        WHERE a.user_id = _user AND a.showroom_id IS NOT NULL)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.user_is_factory_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_is_factory_user(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Batch History report permission
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (permission_key, label, module)
VALUES ('production.reports.batch_history', 'View batch history report', 'Production')
ON CONFLICT (permission_key) DO UPDATE
  SET label = EXCLUDED.label, module = EXCLUDED.module;

-- Grant it to every role that can already see production reports or batches,
-- so nobody loses access to a page they could reach before.
INSERT INTO public.role_permissions (role_id, permission_key)
SELECT DISTINCT rp.role_id, 'production.reports.batch_history'
FROM public.role_permissions rp
WHERE rp.permission_key IN ('production.reports.view', 'production.batches')
ON CONFLICT DO NOTHING;

COMMIT;
