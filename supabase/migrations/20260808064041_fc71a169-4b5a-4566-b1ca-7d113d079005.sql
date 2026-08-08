CREATE OR REPLACE FUNCTION public.user_is_factory_user(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user IS NOT NULL AND (
    public.user_is_global_admin(_user)
    OR EXISTS (
      SELECT 1 FROM public.user_role_assignments a
      JOIN public.showrooms s ON s.id = a.showroom_id
      WHERE a.user_id = _user AND s.is_factory IS TRUE)
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

INSERT INTO public.permissions (permission_key, label, module)
VALUES ('production.reports.batch_history', 'View batch history report', 'Production')
ON CONFLICT (permission_key) DO UPDATE
  SET label = EXCLUDED.label, module = EXCLUDED.module;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT DISTINCT rp.role_id, 'production.reports.batch_history'
FROM public.role_permissions rp
WHERE rp.permission_key IN ('production.reports.view', 'production.batches')
ON CONFLICT DO NOTHING;