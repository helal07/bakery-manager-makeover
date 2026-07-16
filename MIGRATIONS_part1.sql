-- Bakery Manager — combined initial schema
-- 35 migration files, timestamp order

-- ────────────────────────────────────────────────────────────
-- 20260704071133_fb64f1f1-4bb8-451a-9dc2-ec0a7049562a.sql
-- ────────────────────────────────────────────────────────────
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'manager', 'employee');

-- user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Any signed-in role in the app
CREATE OR REPLACE FUNCTION public.has_any_app_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- Policies
CREATE POLICY "Users can view their own role"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owners and admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners and admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners and admins can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners and admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- Trigger: first signup becomes owner
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_assign_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- ────────────────────────────────────────────────────────────
-- 20260704071202_a279b581-cd61-4c89-b172-ac9b3c2a0e90.sql
-- ────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_app_role(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 20260704081159_d45a12e1-f34c-4140-bd3e-4718bddcae7c.sql
-- ────────────────────────────────────────────────────────────
UPDATE auth.users SET email_confirmed_at = now() WHERE email = 'sowayebahmedrafee@gmail.com' AND email_confirmed_at IS NULL;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::app_role FROM auth.users WHERE email = 'sowayebahmedrafee@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 20260707104345_e61f519a-1ff7-4431-81ca-3cc9d22fc7dc.sql
-- ────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_any_app_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 20260707105146_287c3c7b-d51a-4b0b-8c87-27abd03382b9.sql
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owners and admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners and admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners and admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners and admins can delete roles" ON public.user_roles;

CREATE POLICY "Users can view their own role without helper functions"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 20260709114022_516a65bb-ede8-46e2-83c0-0dba52650a9f.sql
-- ────────────────────────────────────────────────────────────
-- =========================================================
-- Phase 1: Landing CMS content + Showrooms
-- =========================================================

-- 1) LANDING CONTENT (singleton) --------------------------
CREATE TABLE public.landing_content (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  content JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.landing_content TO anon, authenticated;
GRANT INSERT, UPDATE ON public.landing_content TO authenticated;
GRANT ALL ON public.landing_content TO service_role;

ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

-- Public can read the landing content (needed for signed-out landing page)
CREATE POLICY "Anyone can read landing content"
  ON public.landing_content FOR SELECT
  USING (true);

-- Only owner/admin can create or update
CREATE POLICY "Owners and admins can insert landing content"
  ON public.landing_content FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Owners and admins can update landing content"
  ON public.landing_content FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  );

-- Seed the singleton row with default dummy content for "Muzahid Food"
INSERT INTO public.landing_content (id, content)
VALUES (
  true,
  jsonb_build_object(
    'brand', jsonb_build_object(
      'name', 'Muzahid Food',
      'tagline', 'Freshly baked, honestly made.'
    ),
    'hero', jsonb_build_object(
      'headline', 'Bakery goodness from our factory to your neighborhood.',
      'subhead', 'A family-run food factory producing breads, biscuits, cakes and pastries — distributed to our showrooms and partner retailers across the country.',
      'ctaPrimary', jsonb_build_object('label', 'Sign in', 'href', '/auth'),
      'ctaSecondary', jsonb_build_object('label', 'Our products', 'href', '#products')
    ),
    'story', jsonb_build_object(
      'title', 'Our story',
      'body', 'Muzahid Food started as a small neighborhood bakery. Today we operate a modern production factory and multiple retail showrooms, serving thousands of customers every week with the same care we started with.'
    ),
    'products', jsonb_build_array(
      jsonb_build_object('name', 'Fresh Breads', 'desc', 'Milk bread, sandwich loaves, buns and rolls baked every morning.'),
      jsonb_build_object('name', 'Biscuits', 'desc', 'Butter cookies, salted crackers and traditional biscuits by the packet.'),
      jsonb_build_object('name', 'Cakes & Pastries', 'desc', 'Birthday cakes, sponge cakes and everyday pastries for any occasion.'),
      jsonb_build_object('name', 'Wholesale supply', 'desc', 'Bulk orders for retailers, dealers and event customers with delivery.')
    ),
    'contact', jsonb_build_object(
      'address', 'Factory & Head Office, Dhaka, Bangladesh',
      'phone', '+880 1XXX-XXXXXX',
      'email', 'hello@muzahidfood.com',
      'hours', 'Sun – Fri, 9:00 AM – 8:00 PM'
    )
  )
);

-- 2) SHOWROOMS --------------------------------------------
CREATE TABLE public.showrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  address TEXT,
  city TEXT,
  phone TEXT,
  manager_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.showrooms TO authenticated;
GRANT ALL ON public.showrooms TO service_role;

ALTER TABLE public.showrooms ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see active showrooms (needed later for
-- transfers, POS, reports); soft-deleted / inactive ones stay visible
-- to owner/admin only.
CREATE POLICY "Authenticated can view showrooms"
  ON public.showrooms FOR SELECT
  TO authenticated
  USING (
    is_active = true
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  );

-- Only owner/admin can create, update, or delete showrooms
CREATE POLICY "Owners and admins can insert showrooms"
  ON public.showrooms FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Owners and admins can update showrooms"
  ON public.showrooms FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Owners and admins can delete showrooms"
  ON public.showrooms FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
  );

-- 3) updated_at trigger -----------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_landing_content_updated_at
  BEFORE UPDATE ON public.landing_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_showrooms_updated_at
  BEFORE UPDATE ON public.showrooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 20260709115938_d544718a-1bfc-4d51-9aa8-d80c24c4c355.sql
-- ────────────────────────────────────────────────────────────
-- 1. Extend enum with superadmin
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

-- END OF PART 1 — run this, then run MIGRATIONS_part2.sql
