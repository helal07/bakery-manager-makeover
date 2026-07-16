-- Grant superadmin to a specific user (fixes: new row violates RLS on products, etc.)
-- Replace the email below with your signed-in account.

WITH me AS (
  SELECT id FROM auth.users WHERE email = 'REPLACE_WITH_YOUR_EMAIL@example.com'
)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'superadmin'::public.app_role FROM me
ON CONFLICT DO NOTHING;

WITH me AS (
  SELECT id FROM auth.users WHERE email = 'REPLACE_WITH_YOUR_EMAIL@example.com'
)
INSERT INTO public.user_role_assignments (user_id, role_id)
SELECT me.id, r.id
FROM me, public.app_roles r
WHERE r.name = 'Superadmin'
ON CONFLICT DO NOTHING;
