-- =============================================================
-- Muzahid Food — Baseline Schema (Lovable Cloud snapshot)
-- =============================================================
-- HOW TO USE (self-hosted Supabase):
--   1. Open Supabase Studio → SQL Editor
--   2. Copy the ENTIRE contents of this file, paste, press Run
--   3. (Optional) run sql/01_seed.sql afterwards for demo data
--
-- WARNING: This script DROPS and recreates the `public` schema.
--          Any existing data in `public` will be permanently deleted.
--          `auth`, `storage`, `realtime`, `vault` schemas are untouched.
-- =============================================================

BEGIN;

-- Reset public schema
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT CREATE ON SCHEMA public TO postgres, service_role;

-- Required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Standard session settings for the migration
SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;
SELECT pg_catalog.set_config('search_path', 'public', false);

-- =============================================================
-- SCHEMA (tables, functions, triggers, policies, grants)
-- Generated from pg_dump of the current Lovable Cloud database.
-- =============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'superadmin',
    'owner',
    'admin',
    'manager',
    'cashier',
    'staff',
    'employee'
);


--
-- Name: commit_production_batch(uuid, uuid, numeric, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.commit_production_batch(_product_id uuid, _showroom_id uuid, _batch numeric, _ingredients jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _batch_id uuid;
  _ingredient jsonb;
  _material_id uuid;
  _qty_per_unit numeric;
  _required_qty numeric;
  _available_qty numeric;
  _shelf_life_days integer;
  _mfg_date date := current_date;
BEGIN
  IF _product_id IS NULL THEN
    RAISE EXCEPTION 'Product is required';
  END IF;

  IF _batch IS NULL OR _batch <= 0 THEN
    RAISE EXCEPTION 'Batch quantity must be greater than zero';
  END IF;

  IF _ingredients IS NULL OR jsonb_typeof(_ingredients) <> 'array' OR jsonb_array_length(_ingredients) = 0 THEN
    RAISE EXCEPTION 'At least one ingredient is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_ingredients) AS item
    WHERE NULLIF(item->>'materialId', '') IS NULL
       OR COALESCE((item->>'qty')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'Each ingredient needs a material and quantity greater than zero';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_ingredients) AS item
    GROUP BY item->>'materialId'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate ingredients are not allowed in one recipe';
  END IF;

  -- Lock and check every raw stock row before writing any ledger rows.
  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients)
  LOOP
    _material_id := (_ingredient->>'materialId')::uuid;
    _qty_per_unit := (_ingredient->>'qty')::numeric;
    _required_qty := abs(_qty_per_unit * _batch);

    SELECT quantity
    INTO _available_qty
    FROM public.raw_material_stock
    WHERE material_id = _material_id
      AND showroom_id IS NOT DISTINCT FROM _showroom_id
    FOR UPDATE;

    IF COALESCE(_available_qty, 0) < _required_qty THEN
      RAISE EXCEPTION 'Insufficient raw materials for this batch';
    END IF;
  END LOOP;

  _batch_id := gen_random_uuid();

  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients)
  LOOP
    _material_id := (_ingredient->>'materialId')::uuid;
    _qty_per_unit := (_ingredient->>'qty')::numeric;
    _required_qty := abs(_qty_per_unit * _batch);

    PERFORM public.commit_raw_stock_movement(
      _material_id,
      _showroom_id,
      -_required_qty,
      'production_consume',
      'production',
      _batch_id,
      NULL
    );
  END LOOP;

  PERFORM public.commit_stock_movement(
    _product_id,
    _showroom_id,
    _batch,
    'production',
    'production',
    _batch_id,
    NULL
  );

  SELECT shelf_life_days
  INTO _shelf_life_days
  FROM public.products
  WHERE id = _product_id;

  UPDATE public.products
  SET mfg_date = _mfg_date,
      expiry_date = CASE
        WHEN COALESCE(_shelf_life_days, 0) > 0 THEN _mfg_date + _shelf_life_days
        ELSE expiry_date
      END,
      updated_at = now()
  WHERE id = _product_id;

  RETURN _batch_id;
END;
$$;


--
-- Name: commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.commit_raw_stock_movement(_material_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text DEFAULT NULL::text, _ref_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _ledger_id uuid;
BEGIN
  INSERT INTO public.raw_stock_ledger (material_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_material_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  RETURNING id INTO _ledger_id;

  UPDATE public.raw_material_stock
  SET quantity = quantity + _qty,
      updated_at = now()
  WHERE material_id = _material_id
    AND showroom_id IS NOT DISTINCT FROM _showroom_id;

  IF NOT FOUND THEN
    INSERT INTO public.raw_material_stock (material_id, showroom_id, quantity)
    VALUES (_material_id, _showroom_id, _qty);
  END IF;

  RETURN _ledger_id;
END;
$$;


--
-- Name: commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.commit_stock_movement(_product_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text DEFAULT NULL::text, _ref_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _ledger_id uuid;
BEGIN
  INSERT INTO public.stock_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_product_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  RETURNING id INTO _ledger_id;

  UPDATE public.product_stock
  SET quantity = quantity + _qty,
      updated_at = now()
  WHERE product_id = _product_id
    AND showroom_id IS NOT DISTINCT FROM _showroom_id;

  IF NOT FOUND THEN
    INSERT INTO public.product_stock (product_id, showroom_id, quantity)
    VALUES (_product_id, _showroom_id, _qty);
  END IF;

  RETURN _ledger_id;
END;
$$;


--
-- Name: find_user_id_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_user_id_by_email(_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from auth.users where lower(email) = lower(_email) limit 1;
$$;


--
-- Name: handle_new_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_role() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cash_registers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_registers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    showroom_id uuid,
    cashier_id uuid,
    opened_by uuid,
    closed_by uuid,
    opening_float numeric DEFAULT 0 NOT NULL,
    closing_cash numeric,
    expected_cash numeric,
    difference numeric,
    status text DEFAULT 'open'::text NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    note_open text,
    note_close text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    tagline text,
    logo_url text,
    address text,
    phone text,
    email text,
    vat_reg text,
    footer_note text,
    currency text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_current boolean DEFAULT true NOT NULL
);


--
-- Name: customer_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    mode text DEFAULT 'percentage' NOT NULL,
    discount_pct numeric DEFAULT 0 NOT NULL,
    selling_price_group_id uuid,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: customer_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    sale_id uuid,
    showroom_id uuid,
    invoice_ref text,
    customer_name text,
    customer_phone text,
    amount numeric DEFAULT 0 NOT NULL,
    method text,
    reference text,
    note text,
    paid_on date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    loyalty_points numeric DEFAULT 0 NOT NULL,
    avatar_url text,
    group_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role text,
    showroom_id uuid,
    email text,
    phone text,
    salary numeric,
    attendance numeric,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: expense_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    category text,
    showroom_id uuid,
    title text,
    description text,
    amount numeric DEFAULT 0 NOT NULL,
    note text,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: held_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.held_sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    showroom_id uuid,
    cashier_id uuid,
    customer_id uuid,
    customer_name text,
    customer_phone text,
    label text,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    item_count integer DEFAULT 0 NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount numeric DEFAULT 0 NOT NULL,
    tax numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: landing_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section text,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    updated_by uuid
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    showroom_id uuid,
    customer_id uuid,
    customer_name text,
    customer_phone text,
    status text DEFAULT 'pending'::text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    code text,
    order_type text,
    due_date date
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    permission_key text NOT NULL,
    module text,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_selling_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_selling_prices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    price_group_id uuid,
    price numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    showroom_id uuid,
    quantity numeric DEFAULT 0 NOT NULL,
    min_stock numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sku text,
    name text NOT NULL,
    category text,
    category_id uuid,
    unit text,
    price numeric DEFAULT 0 NOT NULL,
    cost numeric DEFAULT 0 NOT NULL,
    threshold numeric DEFAULT 0 NOT NULL,
    shelf_life_days integer,
    mfg_date date,
    expiry_date date,
    image_url text,
    barcode text,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchase_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_id uuid,
    material_id uuid,
    product_id uuid,
    name text,
    unit text,
    qty numeric DEFAULT 0 NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchase_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_return_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_id uuid,
    material_id uuid,
    product_id uuid,
    name text,
    unit text,
    qty numeric DEFAULT 0 NOT NULL,
    price numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchase_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text,
    purchase_id uuid,
    supplier_id uuid,
    showroom_id uuid,
    amount numeric DEFAULT 0 NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text,
    supplier_id uuid,
    category_id uuid,
    showroom_id uuid,
    purchase_date date DEFAULT CURRENT_DATE NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount numeric DEFAULT 0 NOT NULL,
    tax numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    paid numeric DEFAULT 0 NOT NULL,
    due numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'Received'::text NOT NULL,
    payment text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qc_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qc_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id text,
    product_id uuid,
    showroom_id uuid,
    result text DEFAULT 'pass'::text NOT NULL,
    notes text,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: raw_material_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.raw_material_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid NOT NULL,
    showroom_id uuid,
    quantity numeric DEFAULT 0 NOT NULL,
    min_stock numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: raw_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.raw_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    unit text,
    cost numeric DEFAULT 0 NOT NULL,
    min_stock numeric DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- Name: raw_stock_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.raw_stock_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid,
    showroom_id uuid,
    qty numeric NOT NULL,
    kind text,
    ref_type text,
    ref_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recipe_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipe_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    color text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: recipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    material_id uuid NOT NULL,
    category_id uuid,
    qty numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    permission_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid,
    product_name text,
    product_sku text,
    qty numeric DEFAULT 0 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    line_total numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sale_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    method text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sale_return_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_return_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    return_id uuid,
    sale_item_id uuid,
    product_id uuid,
    product_name text,
    qty numeric DEFAULT 0 NOT NULL,
    line_total numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sale_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text,
    sale_id uuid,
    invoice_ref text,
    customer_name text,
    amount numeric DEFAULT 0 NOT NULL,
    reason text,
    showroom_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_ref text,
    showroom_id uuid,
    register_id uuid,
    cashier_id uuid,
    customer_id uuid,
    customer_name text,
    customer_phone text,
    subtotal numeric DEFAULT 0 NOT NULL,
    discount numeric DEFAULT 0 NOT NULL,
    tax numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    paid numeric DEFAULT 0 NOT NULL,
    due numeric DEFAULT 0 NOT NULL,
    payment_mode text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: selling_price_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.selling_price_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: showrooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.showrooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    city text,
    address text,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    manager_name text
);


--
-- Name: stock_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    showroom_id uuid,
    qty numeric NOT NULL,
    kind text,
    ref_type text,
    ref_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supplier_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid,
    purchase_id uuid,
    showroom_id uuid,
    amount numeric DEFAULT 0 NOT NULL,
    method text,
    reference text,
    note text,
    paid_on date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transfer_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfer_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transfer_id uuid NOT NULL,
    product_id uuid,
    material_id uuid,
    qty numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text,
    from_showroom_id uuid,
    to_showroom_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    short_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text,
    email text,
    phone text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_role_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_role_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid,
    showroom_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wastage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wastage_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid,
    product_id uuid,
    showroom_id uuid,
    qty numeric DEFAULT 0 NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    ref_ledger_id uuid,
    logged_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    showroom_id uuid,
    batch_qty numeric DEFAULT 0 NOT NULL,
    batch_id text,
    assigned_to text,
    status text DEFAULT 'pending'::text NOT NULL,
    planned_date date,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_roles app_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_roles
    ADD CONSTRAINT app_roles_pkey PRIMARY KEY (id);


--
-- Name: cash_registers cash_registers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_registers
    ADD CONSTRAINT cash_registers_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);


--
-- Name: customer_groups customer_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_groups
    ADD CONSTRAINT customer_groups_pkey PRIMARY KEY (id);


--
-- Name: customer_payments customer_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payments
    ADD CONSTRAINT customer_payments_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: expense_categories expense_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: held_sales held_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.held_sales
    ADD CONSTRAINT held_sales_pkey PRIMARY KEY (id);


--
-- Name: landing_content landing_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_content
    ADD CONSTRAINT landing_content_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_permission_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_permission_key_key UNIQUE (permission_key);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (id);


--
-- Name: product_selling_prices product_selling_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_selling_prices
    ADD CONSTRAINT product_selling_prices_pkey PRIMARY KEY (id);


--
-- Name: product_selling_prices product_selling_prices_product_id_price_group_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_selling_prices
    ADD CONSTRAINT product_selling_prices_product_id_price_group_id_key UNIQUE (product_id, price_group_id);


--
-- Name: product_stock product_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock
    ADD CONSTRAINT product_stock_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: purchase_categories purchase_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_categories
    ADD CONSTRAINT purchase_categories_pkey PRIMARY KEY (id);


--
-- Name: purchase_items purchase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_return_items purchase_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_returns purchase_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_pkey PRIMARY KEY (id);


--
-- Name: purchases purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);


--
-- Name: qc_checks qc_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checks
    ADD CONSTRAINT qc_checks_pkey PRIMARY KEY (id);


--
-- Name: raw_material_stock raw_material_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_material_stock
    ADD CONSTRAINT raw_material_stock_pkey PRIMARY KEY (id);


--
-- Name: raw_materials raw_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_materials
    ADD CONSTRAINT raw_materials_pkey PRIMARY KEY (id);


--
-- Name: raw_stock_ledger raw_stock_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_stock_ledger
    ADD CONSTRAINT raw_stock_ledger_pkey PRIMARY KEY (id);


--
-- Name: recipe_categories recipe_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_categories
    ADD CONSTRAINT recipe_categories_name_key UNIQUE (name);


--
-- Name: recipe_categories recipe_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipe_categories
    ADD CONSTRAINT recipe_categories_pkey PRIMARY KEY (id);


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_id_permission_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_permission_key_key UNIQUE (role_id, permission_key);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sale_payments sale_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_pkey PRIMARY KEY (id);


--
-- Name: sale_return_items sale_return_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_pkey PRIMARY KEY (id);


--
-- Name: sale_returns sale_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: selling_price_groups selling_price_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.selling_price_groups
    ADD CONSTRAINT selling_price_groups_pkey PRIMARY KEY (id);


--
-- Name: showrooms showrooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.showrooms
    ADD CONSTRAINT showrooms_pkey PRIMARY KEY (id);


--
-- Name: stock_ledger stock_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger
    ADD CONSTRAINT stock_ledger_pkey PRIMARY KEY (id);


--
-- Name: supplier_payments supplier_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: transfer_items transfer_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_items
    ADD CONSTRAINT transfer_items_pkey PRIMARY KEY (id);


--
-- Name: transfers transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_pkey PRIMARY KEY (id);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);


--
-- Name: user_role_assignments user_role_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: wastage_log wastage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wastage_log
    ADD CONSTRAINT wastage_log_pkey PRIMARY KEY (id);


--
-- Name: work_orders work_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_pkey PRIMARY KEY (id);


--
-- Name: product_stock_product_showroom_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_stock_product_showroom_uniq ON public.product_stock USING btree (product_id, showroom_id) NULLS NOT DISTINCT;


--
-- Name: raw_material_stock_material_showroom_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX raw_material_stock_material_showroom_uniq ON public.raw_material_stock USING btree (material_id, showroom_id) NULLS NOT DISTINCT;


--
-- Name: app_roles set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.app_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cash_registers set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.cash_registers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: company_settings set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_groups set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customer_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_payments set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customers set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employees set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: expense_categories set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: expenses set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: held_sales set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.held_sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: landing_content set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.landing_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: permissions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_categories set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_selling_prices set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_selling_prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_stock set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: purchase_categories set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchase_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: purchase_items set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: purchase_return_items set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchase_return_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: purchase_returns set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchase_returns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: purchases set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: qc_checks set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.qc_checks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: raw_material_stock set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.raw_material_stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: raw_materials set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.raw_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: raw_stock_ledger set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.raw_stock_ledger FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: recipe_categories set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.recipe_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: recipes set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: role_permissions set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sale_items set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sale_payments set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sale_return_items set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sale_return_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sale_returns set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sale_returns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sales set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: selling_price_groups set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.selling_price_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: showrooms set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.showrooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: stock_ledger set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stock_ledger FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: supplier_payments set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: suppliers set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transfer_items set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transfer_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: transfers set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: units set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_profiles set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_role_assignments set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_role_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_roles set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: wastage_log set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.wastage_log FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: work_orders set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cash_registers cash_registers_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_registers
    ADD CONSTRAINT cash_registers_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: customer_payments customer_payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payments
    ADD CONSTRAINT customer_payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_payments customer_payments_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payments
    ADD CONSTRAINT customer_payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;


--
-- Name: customer_payments customer_payments_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payments
    ADD CONSTRAINT customer_payments_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: customers customers_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.customer_groups(id) ON DELETE SET NULL;


--
-- Name: employees employees_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id) ON DELETE SET NULL;


--
-- Name: expenses expenses_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: held_sales held_sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.held_sales
    ADD CONSTRAINT held_sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: held_sales held_sales_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.held_sales
    ADD CONSTRAINT held_sales_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: orders orders_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: product_selling_prices product_selling_prices_price_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_selling_prices
    ADD CONSTRAINT product_selling_prices_price_group_id_fkey FOREIGN KEY (price_group_id) REFERENCES public.selling_price_groups(id) ON DELETE CASCADE;


--
-- Name: product_selling_prices product_selling_prices_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_selling_prices
    ADD CONSTRAINT product_selling_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_stock product_stock_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock
    ADD CONSTRAINT product_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_stock product_stock_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock
    ADD CONSTRAINT product_stock_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL;


--
-- Name: purchase_items purchase_items_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.raw_materials(id) ON DELETE SET NULL;


--
-- Name: purchase_items purchase_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: purchase_items purchase_items_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_items
    ADD CONSTRAINT purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;


--
-- Name: purchase_return_items purchase_return_items_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.raw_materials(id) ON DELETE SET NULL;


--
-- Name: purchase_return_items purchase_return_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: purchase_return_items purchase_return_items_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_return_items
    ADD CONSTRAINT purchase_return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.purchase_returns(id) ON DELETE CASCADE;


--
-- Name: purchase_returns purchase_returns_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE SET NULL;


--
-- Name: purchase_returns purchase_returns_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: purchase_returns purchase_returns_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_returns
    ADD CONSTRAINT purchase_returns_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: purchases purchases_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.purchase_categories(id) ON DELETE SET NULL;


--
-- Name: purchases purchases_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: purchases purchases_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchases
    ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: qc_checks qc_checks_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checks
    ADD CONSTRAINT qc_checks_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: qc_checks qc_checks_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qc_checks
    ADD CONSTRAINT qc_checks_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: raw_material_stock raw_material_stock_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_material_stock
    ADD CONSTRAINT raw_material_stock_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.raw_materials(id) ON DELETE CASCADE;


--
-- Name: raw_material_stock raw_material_stock_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_material_stock
    ADD CONSTRAINT raw_material_stock_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE CASCADE;


--
-- Name: raw_stock_ledger raw_stock_ledger_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_stock_ledger
    ADD CONSTRAINT raw_stock_ledger_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.raw_materials(id) ON DELETE CASCADE;


--
-- Name: raw_stock_ledger raw_stock_ledger_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.raw_stock_ledger
    ADD CONSTRAINT raw_stock_ledger_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: recipes recipes_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.recipe_categories(id) ON DELETE SET NULL;


--
-- Name: recipes recipes_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.raw_materials(id) ON DELETE CASCADE;


--
-- Name: recipes recipes_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.app_roles(id) ON DELETE CASCADE;


--
-- Name: sale_items sale_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: sale_items sale_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sale_payments sale_payments_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_payments
    ADD CONSTRAINT sale_payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sale_return_items sale_return_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: sale_return_items sale_return_items_return_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_return_id_fkey FOREIGN KEY (return_id) REFERENCES public.sale_returns(id) ON DELETE CASCADE;


--
-- Name: sale_return_items sale_return_items_sale_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_return_items
    ADD CONSTRAINT sale_return_items_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES public.sale_items(id) ON DELETE SET NULL;


--
-- Name: sale_returns sale_returns_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;


--
-- Name: sale_returns sale_returns_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_returns
    ADD CONSTRAINT sale_returns_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: sales sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: sales sales_register_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_register_id_fkey FOREIGN KEY (register_id) REFERENCES public.cash_registers(id) ON DELETE SET NULL;


--
-- Name: sales sales_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: stock_ledger stock_ledger_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger
    ADD CONSTRAINT stock_ledger_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: stock_ledger stock_ledger_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_ledger
    ADD CONSTRAINT stock_ledger_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: supplier_payments supplier_payments_purchase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE SET NULL;


--
-- Name: supplier_payments supplier_payments_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: supplier_payments supplier_payments_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: transfer_items transfer_items_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_items
    ADD CONSTRAINT transfer_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.raw_materials(id) ON DELETE SET NULL;


--
-- Name: transfer_items transfer_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_items
    ADD CONSTRAINT transfer_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: transfer_items transfer_items_transfer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfer_items
    ADD CONSTRAINT transfer_items_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES public.transfers(id) ON DELETE CASCADE;


--
-- Name: transfers transfers_from_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_from_showroom_id_fkey FOREIGN KEY (from_showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: transfers transfers_to_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transfers
    ADD CONSTRAINT transfers_to_showroom_id_fkey FOREIGN KEY (to_showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_role_assignments user_role_assignments_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.app_roles(id) ON DELETE CASCADE;


--
-- Name: user_role_assignments user_role_assignments_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE CASCADE;


--
-- Name: user_role_assignments user_role_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_role_assignments
    ADD CONSTRAINT user_role_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wastage_log wastage_log_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wastage_log
    ADD CONSTRAINT wastage_log_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.raw_materials(id) ON DELETE SET NULL;


--
-- Name: wastage_log wastage_log_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wastage_log
    ADD CONSTRAINT wastage_log_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: wastage_log wastage_log_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wastage_log
    ADD CONSTRAINT wastage_log_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: work_orders work_orders_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: work_orders work_orders_showroom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_showroom_id_fkey FOREIGN KEY (showroom_id) REFERENCES public.showrooms(id) ON DELETE SET NULL;


--
-- Name: app_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: app_roles app_roles_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY app_roles_all_authenticated ON public.app_roles TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: cash_registers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_registers cash_registers_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cash_registers_all_authenticated ON public.cash_registers TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings company_settings_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_all_authenticated ON public.company_settings TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: customer_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_groups customer_groups_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_groups_all_authenticated ON public.customer_groups TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: customer_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_payments customer_payments_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_payments_all_authenticated ON public.customer_payments TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_all_authenticated ON public.customers TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: employees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

--
-- Name: employees employees_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employees_all_authenticated ON public.employees TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: expense_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: expense_categories expense_categories_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expense_categories_all_authenticated ON public.expense_categories TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses expenses_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_all_authenticated ON public.expenses TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: held_sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.held_sales ENABLE ROW LEVEL SECURITY;

--
-- Name: held_sales held_sales_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY held_sales_all_authenticated ON public.held_sales TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: landing_content; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_content ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_content landing_content_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_content_all_authenticated ON public.landing_content TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_all_authenticated ON public.orders TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: permissions permissions_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY permissions_all_authenticated ON public.permissions TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: product_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: product_categories product_categories_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_categories_all_authenticated ON public.product_categories TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: product_selling_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_selling_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: product_selling_prices product_selling_prices_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_selling_prices_all_authenticated ON public.product_selling_prices TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: product_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: product_stock product_stock_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_stock_all_authenticated ON public.product_stock TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_all_authenticated ON public.products TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: purchase_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_categories purchase_categories_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_categories_all_authenticated ON public.purchase_categories TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: purchase_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_items purchase_items_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_items_all_authenticated ON public.purchase_items TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: purchase_return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_return_items purchase_return_items_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_return_items_all_authenticated ON public.purchase_return_items TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: purchase_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_returns purchase_returns_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_returns_all_authenticated ON public.purchase_returns TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: purchases purchases_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchases_all_authenticated ON public.purchases TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: qc_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qc_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: qc_checks qc_checks_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qc_checks_all_authenticated ON public.qc_checks TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: raw_material_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.raw_material_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: raw_material_stock raw_material_stock_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raw_material_stock_all_authenticated ON public.raw_material_stock TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: raw_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: raw_materials raw_materials_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raw_materials_all_authenticated ON public.raw_materials TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: raw_stock_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.raw_stock_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: raw_stock_ledger raw_stock_ledger_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY raw_stock_ledger_all_authenticated ON public.raw_stock_ledger TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: recipe_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recipe_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: recipe_categories recipe_categories_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipe_categories_all_authenticated ON public.recipe_categories TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: recipes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes recipes_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY recipes_all_authenticated ON public.recipes TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: role_permissions role_permissions_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY role_permissions_all_authenticated ON public.role_permissions TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: sale_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_items sale_items_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_items_all_authenticated ON public.sale_items TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: sale_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_payments sale_payments_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_payments_all_authenticated ON public.sale_payments TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: sale_return_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_return_items sale_return_items_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_return_items_all_authenticated ON public.sale_return_items TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: sale_returns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_returns sale_returns_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_returns_all_authenticated ON public.sale_returns TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

--
-- Name: sales sales_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_all_authenticated ON public.sales TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: selling_price_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.selling_price_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: selling_price_groups selling_price_groups_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY selling_price_groups_all_authenticated ON public.selling_price_groups TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: showrooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.showrooms ENABLE ROW LEVEL SECURITY;

--
-- Name: showrooms showrooms_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY showrooms_all_authenticated ON public.showrooms TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: stock_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_ledger stock_ledger_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_ledger_all_authenticated ON public.stock_ledger TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: supplier_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_payments supplier_payments_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_payments_all_authenticated ON public.supplier_payments TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_all_authenticated ON public.suppliers TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: transfer_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;

--
-- Name: transfer_items transfer_items_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transfer_items_all_authenticated ON public.transfer_items TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: transfers transfers_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transfers_all_authenticated ON public.transfers TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

--
-- Name: units units_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY units_all_authenticated ON public.units TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles user_profiles_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_profiles_all_authenticated ON public.user_profiles TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: user_role_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: user_role_assignments user_role_assignments_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_role_assignments_all_authenticated ON public.user_role_assignments TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_all_authenticated ON public.user_roles TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: wastage_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wastage_log ENABLE ROW LEVEL SECURITY;

--
-- Name: wastage_log wastage_log_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wastage_log_all_authenticated ON public.wastage_log TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: work_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: work_orders work_orders_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY work_orders_all_authenticated ON public.work_orders TO authenticated USING ((auth.uid() IS NOT NULL)) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION commit_production_batch(_product_id uuid, _showroom_id uuid, _batch numeric, _ingredients jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.commit_production_batch(_product_id uuid, _showroom_id uuid, _batch numeric, _ingredients jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.commit_production_batch(_product_id uuid, _showroom_id uuid, _batch numeric, _ingredients jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.commit_production_batch(_product_id uuid, _showroom_id uuid, _batch numeric, _ingredients jsonb) TO service_role;


--
-- Name: FUNCTION commit_raw_stock_movement(_material_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text, _ref_id uuid, _note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.commit_raw_stock_movement(_material_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text, _ref_id uuid, _note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.commit_raw_stock_movement(_material_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text, _ref_id uuid, _note text) TO authenticated;
GRANT ALL ON FUNCTION public.commit_raw_stock_movement(_material_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text, _ref_id uuid, _note text) TO service_role;


--
-- Name: FUNCTION commit_stock_movement(_product_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text, _ref_id uuid, _note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.commit_stock_movement(_product_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text, _ref_id uuid, _note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.commit_stock_movement(_product_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text, _ref_id uuid, _note text) TO authenticated;
GRANT ALL ON FUNCTION public.commit_stock_movement(_product_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text, _ref_id uuid, _note text) TO service_role;


--
-- Name: FUNCTION find_user_id_by_email(_email text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_user_id_by_email(_email text) TO anon;
GRANT ALL ON FUNCTION public.find_user_id_by_email(_email text) TO authenticated;
GRANT ALL ON FUNCTION public.find_user_id_by_email(_email text) TO service_role;


--
-- Name: FUNCTION handle_new_user_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user_role() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user_role() TO service_role;


--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO anon;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
-- Name: TABLE app_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_roles TO anon;
GRANT ALL ON TABLE public.app_roles TO authenticated;
GRANT ALL ON TABLE public.app_roles TO service_role;


--
-- Name: TABLE cash_registers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cash_registers TO anon;
GRANT ALL ON TABLE public.cash_registers TO authenticated;
GRANT ALL ON TABLE public.cash_registers TO service_role;


--
-- Name: TABLE company_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.company_settings TO anon;
GRANT ALL ON TABLE public.company_settings TO authenticated;
GRANT ALL ON TABLE public.company_settings TO service_role;


--
-- Name: TABLE customer_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_groups TO anon;
GRANT ALL ON TABLE public.customer_groups TO authenticated;
GRANT ALL ON TABLE public.customer_groups TO service_role;


--
-- Name: TABLE customer_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customer_payments TO anon;
GRANT ALL ON TABLE public.customer_payments TO authenticated;
GRANT ALL ON TABLE public.customer_payments TO service_role;


--
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.customers TO anon;
GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;


--
-- Name: TABLE employees; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employees TO anon;
GRANT ALL ON TABLE public.employees TO authenticated;
GRANT ALL ON TABLE public.employees TO service_role;


--
-- Name: TABLE expense_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.expense_categories TO anon;
GRANT ALL ON TABLE public.expense_categories TO authenticated;
GRANT ALL ON TABLE public.expense_categories TO service_role;


--
-- Name: TABLE expenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.expenses TO anon;
GRANT ALL ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO service_role;


--
-- Name: TABLE held_sales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.held_sales TO anon;
GRANT ALL ON TABLE public.held_sales TO authenticated;
GRANT ALL ON TABLE public.held_sales TO service_role;


--
-- Name: TABLE landing_content; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.landing_content TO anon;
GRANT ALL ON TABLE public.landing_content TO authenticated;
GRANT ALL ON TABLE public.landing_content TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.permissions TO anon;
GRANT ALL ON TABLE public.permissions TO authenticated;
GRANT ALL ON TABLE public.permissions TO service_role;


--
-- Name: TABLE product_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_categories TO anon;
GRANT ALL ON TABLE public.product_categories TO authenticated;
GRANT ALL ON TABLE public.product_categories TO service_role;


--
-- Name: TABLE product_selling_prices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_selling_prices TO anon;
GRANT ALL ON TABLE public.product_selling_prices TO authenticated;
GRANT ALL ON TABLE public.product_selling_prices TO service_role;


--
-- Name: TABLE product_stock; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_stock TO anon;
GRANT ALL ON TABLE public.product_stock TO authenticated;
GRANT ALL ON TABLE public.product_stock TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE purchase_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_categories TO anon;
GRANT ALL ON TABLE public.purchase_categories TO authenticated;
GRANT ALL ON TABLE public.purchase_categories TO service_role;


--
-- Name: TABLE purchase_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_items TO anon;
GRANT ALL ON TABLE public.purchase_items TO authenticated;
GRANT ALL ON TABLE public.purchase_items TO service_role;


--
-- Name: TABLE purchase_return_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_return_items TO anon;
GRANT ALL ON TABLE public.purchase_return_items TO authenticated;
GRANT ALL ON TABLE public.purchase_return_items TO service_role;


--
-- Name: TABLE purchase_returns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchase_returns TO anon;
GRANT ALL ON TABLE public.purchase_returns TO authenticated;
GRANT ALL ON TABLE public.purchase_returns TO service_role;


--
-- Name: TABLE purchases; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.purchases TO anon;
GRANT ALL ON TABLE public.purchases TO authenticated;
GRANT ALL ON TABLE public.purchases TO service_role;


--
-- Name: TABLE qc_checks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.qc_checks TO anon;
GRANT ALL ON TABLE public.qc_checks TO authenticated;
GRANT ALL ON TABLE public.qc_checks TO service_role;


--
-- Name: TABLE raw_material_stock; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.raw_material_stock TO anon;
GRANT ALL ON TABLE public.raw_material_stock TO authenticated;
GRANT ALL ON TABLE public.raw_material_stock TO service_role;


--
-- Name: TABLE raw_materials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.raw_materials TO anon;
GRANT ALL ON TABLE public.raw_materials TO authenticated;
GRANT ALL ON TABLE public.raw_materials TO service_role;


--
-- Name: TABLE raw_stock_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.raw_stock_ledger TO anon;
GRANT ALL ON TABLE public.raw_stock_ledger TO authenticated;
GRANT ALL ON TABLE public.raw_stock_ledger TO service_role;


--
-- Name: TABLE recipe_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recipe_categories TO anon;
GRANT ALL ON TABLE public.recipe_categories TO authenticated;
GRANT ALL ON TABLE public.recipe_categories TO service_role;


--
-- Name: TABLE recipes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recipes TO anon;
GRANT ALL ON TABLE public.recipes TO authenticated;
GRANT ALL ON TABLE public.recipes TO service_role;


--
-- Name: TABLE role_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.role_permissions TO anon;
GRANT ALL ON TABLE public.role_permissions TO authenticated;
GRANT ALL ON TABLE public.role_permissions TO service_role;


--
-- Name: TABLE sale_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sale_items TO anon;
GRANT ALL ON TABLE public.sale_items TO authenticated;
GRANT ALL ON TABLE public.sale_items TO service_role;


--
-- Name: TABLE sale_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sale_payments TO anon;
GRANT ALL ON TABLE public.sale_payments TO authenticated;
GRANT ALL ON TABLE public.sale_payments TO service_role;


--
-- Name: TABLE sale_return_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sale_return_items TO anon;
GRANT ALL ON TABLE public.sale_return_items TO authenticated;
GRANT ALL ON TABLE public.sale_return_items TO service_role;


--
-- Name: TABLE sale_returns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sale_returns TO anon;
GRANT ALL ON TABLE public.sale_returns TO authenticated;
GRANT ALL ON TABLE public.sale_returns TO service_role;


--
-- Name: TABLE sales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sales TO anon;
GRANT ALL ON TABLE public.sales TO authenticated;
GRANT ALL ON TABLE public.sales TO service_role;


--
-- Name: TABLE selling_price_groups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.selling_price_groups TO anon;
GRANT ALL ON TABLE public.selling_price_groups TO authenticated;
GRANT ALL ON TABLE public.selling_price_groups TO service_role;


--
-- Name: TABLE showrooms; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.showrooms TO anon;
GRANT ALL ON TABLE public.showrooms TO authenticated;
GRANT ALL ON TABLE public.showrooms TO service_role;


--
-- Name: TABLE stock_ledger; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.stock_ledger TO anon;
GRANT ALL ON TABLE public.stock_ledger TO authenticated;
GRANT ALL ON TABLE public.stock_ledger TO service_role;


--
-- Name: TABLE supplier_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.supplier_payments TO anon;
GRANT ALL ON TABLE public.supplier_payments TO authenticated;
GRANT ALL ON TABLE public.supplier_payments TO service_role;


--
-- Name: TABLE suppliers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.suppliers TO anon;
GRANT ALL ON TABLE public.suppliers TO authenticated;
GRANT ALL ON TABLE public.suppliers TO service_role;


--
-- Name: TABLE transfer_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transfer_items TO anon;
GRANT ALL ON TABLE public.transfer_items TO authenticated;
GRANT ALL ON TABLE public.transfer_items TO service_role;


--
-- Name: TABLE transfers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transfers TO anon;
GRANT ALL ON TABLE public.transfers TO authenticated;
GRANT ALL ON TABLE public.transfers TO service_role;


--
-- Name: TABLE units; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.units TO anon;
GRANT ALL ON TABLE public.units TO authenticated;
GRANT ALL ON TABLE public.units TO service_role;


--
-- Name: TABLE user_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_profiles TO anon;
GRANT ALL ON TABLE public.user_profiles TO authenticated;
GRANT ALL ON TABLE public.user_profiles TO service_role;


--
-- Name: TABLE user_role_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_role_assignments TO anon;
GRANT ALL ON TABLE public.user_role_assignments TO authenticated;
GRANT ALL ON TABLE public.user_role_assignments TO service_role;


--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
-- Name: TABLE wastage_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wastage_log TO anon;
GRANT ALL ON TABLE public.wastage_log TO authenticated;
GRANT ALL ON TABLE public.wastage_log TO service_role;


--
-- Name: TABLE work_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.work_orders TO anon;
GRANT ALL ON TABLE public.work_orders TO authenticated;
GRANT ALL ON TABLE public.work_orders TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

-- =============================================================
-- CORE SEED DATA
-- (roles, permission catalog, unit / category defaults,
--  company settings, landing content)
-- Required for the app to boot correctly.
-- =============================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: app_roles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.app_roles VALUES ('cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'Admin', 'Full operational access', true, true, '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.app_roles VALUES ('7bff69e0-a323-44d1-85a0-de4953e582d1', 'Manager', 'Operations + production, no access control', true, true, '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.app_roles VALUES ('76b5711e-f860-4fd5-a3f3-6db3ab71fe87', 'Cashier', 'POS + basic sales + customers', true, true, '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.app_roles VALUES ('4b45766e-2c20-4f12-bbc6-4fe6cbc95d48', 'Superadmin', 'Full access, bypasses all permission checks', true, true, '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: expense_categories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: landing_content; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.permissions VALUES ('9299d188-9ba5-4928-849e-6db7550416bf', 'dashboard.access', 'Dashboard', 'View dashboard', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('352db9d9-e482-42e4-84af-92a76fead853', 'pos.access', 'POS', 'Access POS terminal', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('bbb14c32-3ed0-4301-b52c-00037702ed2f', 'pos.discount', 'POS', 'Apply discounts at POS', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('c80e2e87-8662-4aaf-b4d7-e9d5a6f4502e', 'pos.void', 'POS', 'Void a line / sale at POS', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('8bbd656b-07ab-4b60-bd45-7aa9042a5985', 'sales.view', 'Sales', 'View sales', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('d6c71874-fc6a-4d01-bc69-5916feeccae3', 'sales.create', 'Sales', 'Create sales', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('da7296be-b3eb-4a9e-acd7-2d93ba0469b6', 'sales.edit', 'Sales', 'Edit sales', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('346edd0c-90ec-432a-830b-9503243c2389', 'sales.delete', 'Sales', 'Delete sales', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('9e096e63-897a-4e5c-80ab-298b271eec3c', 'sales.return', 'Sales', 'Sale returns', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('c4919905-df00-423d-b503-e97acd056b4d', 'sales.payments', 'Sales', 'Customer payments', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('71cb3e80-c0b9-42cd-b466-5fd7459c2868', 'purchases.view', 'Purchases', 'View purchases', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('3714730f-bfdf-4366-a2b5-3dcfa7f97d77', 'purchases.create', 'Purchases', 'Create purchases', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('6a51fabc-191f-49eb-b49b-f85f3e0a86f9', 'purchases.edit', 'Purchases', 'Edit purchases', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('65341d82-dc30-4152-b859-818c9bd5b739', 'purchases.delete', 'Purchases', 'Delete purchases', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('fa157152-7916-48ac-83f3-c1604ae45825', 'purchases.return', 'Purchases', 'Purchase returns', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('2b65344b-ebf2-42d3-8f11-4f606b4c3b95', 'purchases.payments', 'Purchases', 'Supplier payments', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('b30b82e4-2f6c-43ca-9415-edfbbb343427', 'products.view', 'Products', 'View products', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('800fba26-02ef-450c-86bc-4f0ee2e4989b', 'products.create', 'Products', 'Create products', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('dd6f1f6d-7593-4f2b-a8ac-ad66d5a1232b', 'products.edit', 'Products', 'Edit products', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('99660268-c0cb-4404-8ae8-83c742577f77', 'products.delete', 'Products', 'Delete products', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('f99521ab-cf97-4101-9445-35f2cc579531', 'products.categories.manage', 'Products', 'Manage product categories', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('5aa9fbc4-292c-401e-a4b8-023c015a2a5a', 'products.units.manage', 'Products', 'Manage units', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('b7cabc1c-251e-40d6-8da3-31fbb32948dd', 'products.selling_prices.manage', 'Products', 'Manage selling price groups', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('119b2679-68ca-430a-8b9c-e64e1a03017e', 'inventory.view', 'Inventory', 'View stock', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('9d4563c8-6c10-467f-a392-f93493f157aa', 'inventory.transfer', 'Inventory', 'Transfer stock between showrooms', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('99403dab-a2bc-4f67-b9dd-ce1331d99d29', 'inventory.adjust', 'Inventory', 'Adjust stock', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('f8be8732-9d26-49c7-856a-4696938de0e4', 'contacts.customers.view', 'Contacts', 'View customers', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('e6afa55c-a6eb-4307-a037-31d4e456301b', 'contacts.customers.manage', 'Contacts', 'Manage customers', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('1a6e86d6-6d63-4f7c-901d-f7035398a1ec', 'contacts.customer_groups.manage', 'Contacts', 'Manage customer groups', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('1018611d-443c-41e1-934c-f1240533a62f', 'contacts.suppliers.view', 'Contacts', 'View suppliers', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('681f0960-3e7b-4519-b6fd-0b6606c6cb54', 'contacts.suppliers.manage', 'Contacts', 'Manage suppliers', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('b316ca77-0a8c-4b5b-ac0a-29cc3e3b19f1', 'production.access', 'Production', 'Access Production module', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('a5b39c81-fbd9-4a6f-a2d0-6eeaa4b0768f', 'production.recipes.view', 'Production', 'View recipes & BOM', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('f82b0a23-d5b3-49ce-84db-6f00a2413d4c', 'production.recipes.manage', 'Production', 'Create / edit recipes', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('15075e36-25ef-4694-b142-4dbed2f7a166', 'production.raw_materials.view', 'Production', 'View raw materials & stock', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('b8ff0982-1be1-47db-812a-647a42c3e092', 'production.raw_materials.manage', 'Production', 'Manage raw materials & stock', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('dad19604-46aa-4eb8-9965-5141c319a57f', 'production.work_orders.manage', 'Production', 'Manage work orders', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('7c85dd9f-b744-4086-a7e2-53212ed9b75a', 'production.wastage.manage', 'Production', 'Log production wastage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('cb126931-ed5d-4086-82c9-c5c844b528c3', 'production.qc.manage', 'Production', 'Perform quality checks', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('eae140ed-5c73-402b-830d-66371fdc9f6b', 'production.reports.view', 'Production', 'View production reports', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('809c19a5-1239-425d-9244-b47947f239a9', 'expenses.view', 'Expenses', 'View expenses', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('88b210ba-ae2e-4c31-bd83-496fc002f2d8', 'expenses.manage', 'Expenses', 'Manage expenses', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('73ffbcf5-ff52-487c-80fe-b7aa08448e0a', 'expenses.categories.manage', 'Expenses', 'Manage expense categories', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('eca7f255-71ff-49ac-add7-51e1eb8fb6eb', 'reports.sales', 'Reports', 'Sales reports', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('ded9de6a-3dd8-41bc-9be1-77facae7fbc0', 'reports.purchase', 'Reports', 'Purchase reports', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('7b9d2412-4b55-46d5-85e8-0e531b674f30', 'reports.stock', 'Reports', 'Stock reports', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('19e0b857-d10e-444b-81e3-d1e6d84c6fa1', 'reports.expenses', 'Reports', 'Expense reports', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('d5ef43b4-51d5-43a4-9b7b-7ebd85f2e1be', 'reports.ledgers', 'Reports', 'Payment & return ledgers', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('9b8ef639-28bd-47f5-86b0-fdef0ac561b9', 'showrooms.view', 'Showrooms', 'View showrooms', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('7ca6762c-09bd-4ca9-bfcf-06de674a4f6f', 'showrooms.manage', 'Showrooms', 'Manage showrooms', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('3a5a0e76-0003-4e48-84d8-624e1667d711', 'employees.view', 'Employees', 'View employees', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('3d8b3366-d82c-4f10-8f37-1180cb71637a', 'employees.manage', 'Employees', 'Manage employees', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('c993733c-04f4-423d-ba2d-c9360eb7bc3c', 'settings.general', 'Settings', 'General settings', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('a4b133ed-5ff0-4024-b151-e974a30ce1f5', 'settings.landing', 'Settings', 'Edit landing page', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.permissions VALUES ('8b1274de-69ef-472b-b437-19419952f38b', 'settings.access', 'Settings', 'Access Control (roles & permissions)', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');


--
-- Data for Name: product_categories; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.product_categories VALUES ('a19b80c7-75d5-4acb-ade1-09801da2a144', 'Bakery', '2026-07-16 14:55:52.525376+00', '2026-07-16 14:55:52.525376+00');
INSERT INTO public.product_categories VALUES ('2774311a-17b1-44b2-b995-3ce69c5c9ffe', 'Bakery', '2026-07-16 14:57:29.032352+00', '2026-07-16 14:57:29.032352+00');


--
-- Data for Name: purchase_categories; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: recipe_categories; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.recipe_categories VALUES ('0a6065f5-b019-409d-a811-177e70453c99', 'Breads & Buns', '2026-07-16 14:57:28.783971+00', '2026-07-16 14:57:28.783971+00', '#f59e0b', true);
INSERT INTO public.recipe_categories VALUES ('81eb4235-7d10-4218-9ff8-e874ffbd11ec', 'Cakes', '2026-07-16 14:57:28.783971+00', '2026-07-16 14:57:28.783971+00', '#ec4899', true);
INSERT INTO public.recipe_categories VALUES ('6b878de8-9fd5-4858-accd-25ae3cc83fb3', 'Biscuits', '2026-07-16 14:57:28.783971+00', '2026-07-16 14:57:28.783971+00', '#8b5cf6', true);


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.role_permissions VALUES ('54a651ba-af6f-4fc1-b72a-d975da3c9aea', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'dashboard.access', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('6d5e12f4-3601-47c7-802a-172151420863', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'pos.access', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('908d51c0-c7ce-4782-ab6b-be32adfe93dc', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'pos.discount', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('f728ea29-c443-4a46-9c7b-d3406d131de5', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'pos.void', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('ab00e76e-b5e7-435a-8ee9-fac134dc6c8b', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'sales.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('89feac7b-51c7-4081-8df7-84ebaaaf19b4', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'sales.create', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('1ffc3896-4f0e-4b89-be32-c2eb25a46359', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'sales.edit', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('63effaa3-84e7-4864-8ad8-6081fb9cabf8', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'sales.delete', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('dd362b91-a310-4193-99f7-a752bfff7323', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'sales.return', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('d6f56db6-781a-40b3-8735-45519e077218', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'sales.payments', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('cd2d3df8-72f1-421c-9a2e-d8ab81429655', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'purchases.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('0f0404b9-338f-420c-8395-a2eca06912e4', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'purchases.create', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('86c98052-e187-45f6-b617-df7b960d9885', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'purchases.edit', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('4386efda-41cc-45ed-b6ba-15c3e6af36aa', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'purchases.delete', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('8d2ca64d-38b3-4224-910e-63fe84c23ef7', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'purchases.return', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('9924c9b1-8dc7-448d-b42a-12aac0c2c537', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'purchases.payments', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('3edeab87-5eba-4ccb-b2d0-fa23fb8d9450', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'products.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('cf001c9f-d4cf-4cf1-952b-c3d63a29f7d1', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'products.create', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('2e170622-45ff-487b-ae75-5f8d4cedbb08', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'products.edit', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('79ac262f-7e0d-4f5a-b75c-c6466db53bb6', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'products.delete', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('bf11f0e1-9095-42a6-b45b-146bc929221b', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'products.categories.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('fe609813-0d6c-4067-9738-6fc355d7af59', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'products.units.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('fdcdfe56-8ee6-404d-a61b-d8e7102f4b2b', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'products.selling_prices.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('e6b78028-ccfa-4e55-956e-155b5e5f97a8', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'inventory.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('ad51a44b-f0cf-4ad5-996c-bb9e31018896', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'inventory.transfer', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('b8e0fa55-5d66-4e28-bf66-f153def8965a', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'inventory.adjust', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('cc887f77-8a34-462f-af5e-a06534428ba7', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'contacts.customers.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('ca1139df-43d2-4b18-8dc3-5e571db99ee4', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'contacts.customers.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('a0363afa-ddf3-484a-a0ab-a815f37cd6b4', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'contacts.customer_groups.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('1a3e1042-6d8f-4ffb-8310-3b44a57a144c', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'contacts.suppliers.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('291c7392-d784-4a5c-909a-bcc54491aa6c', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'contacts.suppliers.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('920ea43a-7b11-426d-973a-305d33dcf2d6', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'production.access', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('06a8bb59-2b5c-4064-91b9-15bb5f746379', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'production.recipes.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('bb9c8b06-7344-40c1-bf0a-8817cfccbb96', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'production.recipes.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('95dffd9c-0399-4f9a-a58e-5f1ce2b81fa9', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'production.raw_materials.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('2b41de99-7711-403a-8593-233c09c4f46f', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'production.raw_materials.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('a131e00e-fc99-4b2c-b34a-5bc3869cf2d9', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'production.work_orders.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('0d852d25-e242-486c-8db2-419e74cc6871', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'production.wastage.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('082b18d4-cb02-4326-8d10-cc9ab057af16', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'production.qc.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('99557e07-a7f6-4050-af5f-ce8b64294580', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'production.reports.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('e9cd5731-7e65-4e18-ada8-3b70baa8029a', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'expenses.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('4c0b33f1-b545-4432-848d-5362ea9d785e', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'expenses.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('42fc4d8f-6677-488c-90f2-c5de53e9527d', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'expenses.categories.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('87b4c782-36e6-41ed-a0f3-7428d3b0cea5', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'reports.sales', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('1b15077f-55be-41ed-8925-05bd17c6699d', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'reports.purchase', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('0b535926-d4ac-49f5-a353-8903f6c2dfeb', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'reports.stock', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('8df660bb-7109-4019-8c7c-51c35ca76bc7', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'reports.expenses', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('26c95d38-9b38-4bd9-a9ab-f07720d7d4ae', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'reports.ledgers', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('1da7328f-fd71-4f47-9806-5cb7c3e68e69', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'showrooms.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('fd2c4795-9c4d-4380-bd0e-59f9c06a6a20', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'showrooms.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('e3098d91-b8f7-4d03-b0a2-f0c360bcfd6d', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'employees.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('8752d7f0-776a-40b4-b9d2-e559ec169d1d', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'employees.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('de56a78f-26f3-44f7-b6e7-521a8db9dd25', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'settings.general', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('7649b1aa-f2eb-4e1f-8ba8-510391a0c64d', 'cebefcc7-ccbb-4028-81fa-dae887c4ea33', 'settings.landing', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('f0573a2a-debc-4088-bff8-848c7e09c835', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'dashboard.access', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('8fc35f85-fb7c-4d38-8062-5533ad7a2bcb', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'pos.access', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('6f5bdfab-3114-4c56-9f39-8c4b897c0ab1', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'pos.discount', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('8afc2d14-923d-4183-a513-90cdc0053e0d', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'sales.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('cb065c58-bc1e-4688-b654-a506b935684f', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'sales.create', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('9abfc06d-5abc-461f-b91b-2888413bc920', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'sales.edit', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('eb8eb931-6a94-426a-99c7-67007d83a005', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'sales.return', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('95cdd68a-168d-4a80-87ca-5f824740483a', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'sales.payments', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('96cf6073-09cf-4a27-b7c2-2581532a520e', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'purchases.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('923d854b-7093-46de-90dc-fdcc2809c414', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'purchases.create', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('e1d4a206-2b5f-4e82-a35a-f172ecd1c703', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'purchases.edit', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('4dfdb816-4e67-4812-b293-4c9f70d94302', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'purchases.return', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('7887bf72-cbc6-4548-9e88-7ed5960fa33e', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'purchases.payments', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('66aac5ef-e26e-47dc-a7aa-8d47fcdbd3d8', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'products.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('2ff3f8f5-73ff-4e0c-9c31-daac2ab16f6c', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'products.create', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('561e897c-d0ad-44d2-83e9-c59fb1dfa730', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'products.edit', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('58791294-8c01-4ef8-876d-fe5a3d3dcb93', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'products.categories.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('081f45c5-40ef-4b17-ae6e-132784b03a74', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'products.units.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('86029a28-cfa8-42b1-af64-2500c829311c', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'products.selling_prices.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('e29d8c2b-c406-4efb-ac07-827940df9778', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'inventory.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('03571189-fa97-45d8-a3a7-f232ed4f11d1', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'inventory.transfer', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('fefba35e-7408-460d-b9a9-bfc0015db3ba', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'inventory.adjust', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('986c4d76-deef-4d39-9d78-ffa25bf83f69', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'contacts.customers.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('1d54a802-41dc-4443-adb9-c20aedf64aac', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'contacts.customers.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('132e944c-a203-42dd-a117-41f4c9619f2f', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'contacts.customer_groups.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('62d31f7e-1d3a-4c1d-ac0f-bb03ed3afa21', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'contacts.suppliers.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('74ae38c1-d0a3-4080-9b87-ad504aba876f', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'contacts.suppliers.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('1611f61c-3c17-483f-a8f2-8f1489894e31', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'production.access', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('b2ba9fc3-2563-47cc-8f3f-5dbfecec2652', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'production.recipes.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('d3f88542-c52e-444c-b4c3-bed67f21d3a5', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'production.recipes.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('b65020e1-f752-427c-ad92-5c2aedeb46f0', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'production.raw_materials.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('a98b6beb-8852-4f41-8841-57b2f10c5fae', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'production.raw_materials.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('752187e3-a27a-4ab2-879c-4dc690b5e958', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'production.work_orders.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('7b51a583-2431-46e2-928f-e727900f9526', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'production.wastage.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('78953fde-98a4-41c6-8258-142bc5799b4e', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'production.qc.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('17bd9b84-1208-4764-a229-b55f18f794dc', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'production.reports.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('eeff7e96-7768-47fc-9b84-8f2fbd695e13', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'expenses.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('961925e2-337f-4738-8cfe-e848b0785f27', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'expenses.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('b24506fa-7049-4973-8801-32ae6551a61f', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'expenses.categories.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('192b49fb-3d6c-4259-882d-3770941bc7a8', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'reports.sales', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('66cad09f-35ea-430e-b18c-f05cde1d281f', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'reports.purchase', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('717bcb64-d19f-49a2-a007-6a89035cdc02', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'reports.stock', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('500a091f-74fa-43c5-8737-394168a31e56', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'reports.expenses', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('75cc0e7c-4e41-4886-a0dd-840867c0e5e1', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'reports.ledgers', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('1557c95d-02b4-4e80-82fe-32237912d192', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'showrooms.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('aca7f881-885e-457d-91da-edf4aaa5de64', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'employees.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('b5c7d67c-1828-4f9a-a081-cef1e4cd1355', '7bff69e0-a323-44d1-85a0-de4953e582d1', 'settings.general', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('03f8f946-d086-4ab4-8eee-86f7c67642db', '76b5711e-f860-4fd5-a3f3-6db3ab71fe87', 'dashboard.access', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('64cd963f-e6a7-4d9b-a2bd-b8003a42f07e', '76b5711e-f860-4fd5-a3f3-6db3ab71fe87', 'pos.access', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('cbc3b3c7-2f5c-4376-93c7-3cc2ae51c88f', '76b5711e-f860-4fd5-a3f3-6db3ab71fe87', 'pos.discount', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('af68e3c2-1e1b-4f6f-8671-789ce5ddadb8', '76b5711e-f860-4fd5-a3f3-6db3ab71fe87', 'sales.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('c1989e62-6190-4e77-96ba-2f0fe61d7a0a', '76b5711e-f860-4fd5-a3f3-6db3ab71fe87', 'sales.create', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('32959641-c9d6-4d54-bc3e-10fa4adf869c', '76b5711e-f860-4fd5-a3f3-6db3ab71fe87', 'sales.return', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('df3f8f18-81dc-4923-bca1-892f3b2718be', '76b5711e-f860-4fd5-a3f3-6db3ab71fe87', 'sales.payments', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('f336f534-7fa6-4b1f-8bec-7d7b157f147e', '76b5711e-f860-4fd5-a3f3-6db3ab71fe87', 'contacts.customers.view', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');
INSERT INTO public.role_permissions VALUES ('eb3aeb04-3a05-4b12-bd3a-a57fea598dde', '76b5711e-f860-4fd5-a3f3-6db3ab71fe87', 'contacts.customers.manage', '2026-07-16 15:50:17.660378+00', '2026-07-16 15:50:17.660378+00');


--
-- Data for Name: selling_price_groups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: units; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--

-- Auto-assign 'owner' role to the first user on signup (self-hosted only).
-- Lovable Cloud manages this trigger separately; on self-hosted we create it here.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

COMMIT;

-- =============================================================
-- Done. Next steps:
--   • (Optional) run sql/01_seed.sql for demo products/customers.
--   • For every future change, run the new file(s) inside
--     supabase/migrations/ in timestamp order.
-- =============================================================
