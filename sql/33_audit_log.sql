-- ============================================================================
-- Patch 33 — Activity log (audit trail), superadmin read-only
-- Run once in the production VPS Supabase SQL editor. Idempotent.
--
-- Adds:
--   * public.audit_log                       — append-only trail, superadmin read
--   * public.audit_row_change()              — trigger writing who/what/when + diff
--   * triggers on all business tables
--   * public.log_audit_event(...)            — app-side login/logout events
--   * public.audit_note(...)                 — plain-language notes from RPCs
--   * public.purge_audit_log(timestamptz)    — superadmin retention cleanup
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  showroom_id uuid,
  changed_fields text[],
  old_data jsonb,
  new_data jsonb,
  note text
);

CREATE INDEX IF NOT EXISTS audit_log_occurred_at_idx ON public.audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_table_idx ON public.audit_log (table_name);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Read-only for superadmins; no INSERT/UPDATE/DELETE policy exists, so rows can
-- only be written by the security-definer trigger/functions below.
DROP POLICY IF EXISTS "Superadmins can read the activity log" ON public.audit_log;
CREATE POLICY "Superadmins can read the activity log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_bootstrap_superadmin((select auth.uid())));

-- ---------------------------------------------------------------------------
-- Actor email lookup (auth schema is not directly readable by clients)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_actor_email(_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT email FROM auth.users WHERE id = _user;
$$;
REVOKE ALL ON FUNCTION public.audit_actor_email(uuid) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- Explicit event logger (login/logout from the app)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _action text,
  _table_name text DEFAULT NULL,
  _record_id uuid DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _u uuid := auth.uid();
BEGIN
  IF _action IS NULL OR _action NOT IN ('login', 'logout', 'rpc') THEN
    RAISE EXCEPTION 'Unsupported audit action';
  END IF;
  INSERT INTO public.audit_log (actor_id, actor_email, action, table_name, record_id, note)
  VALUES (_u, public.audit_actor_email(_u), _action, _table_name, _record_id, left(coalesce(_note, ''), 500));
EXCEPTION WHEN OTHERS THEN
  NULL;
END; $$;
REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, text) TO authenticated, service_role;

-- Internal note writer used inside security-definer RPCs
CREATE OR REPLACE FUNCTION public.audit_note(_table_name text, _record_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _u uuid := auth.uid();
BEGIN
  INSERT INTO public.audit_log (actor_id, actor_email, action, table_name, record_id, note)
  VALUES (_u, public.audit_actor_email(_u), 'rpc', _table_name, _record_id, left(coalesce(_note, ''), 500));
EXCEPTION WHEN OTHERS THEN
  NULL;
END; $$;
REVOKE ALL ON FUNCTION public.audit_note(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_note(text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Row-level trigger: records who/what/when plus a field-level diff
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _old jsonb; _new jsonb; _changed text[]; _u uuid; _rid uuid; _showroom uuid; _k text;
  _redact text[] := ARRAY['password','password_hash','token','access_token','refresh_token','secret'];
BEGIN
  _u := auth.uid();
  IF TG_OP <> 'INSERT' THEN _old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN _new := to_jsonb(NEW); END IF;

  FOREACH _k IN ARRAY _redact LOOP
    IF _old ? _k THEN _old := jsonb_set(_old, ARRAY[_k], '"[redacted]"'::jsonb); END IF;
    IF _new ? _k THEN _new := jsonb_set(_new, ARRAY[_k], '"[redacted]"'::jsonb); END IF;
  END LOOP;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key ORDER BY key) INTO _changed
      FROM jsonb_each(_new)
     WHERE key NOT IN ('updated_at')
       AND (_old -> key) IS DISTINCT FROM (_new -> key);
    -- Nothing really changed (e.g. touch-only update): don't record noise.
    IF _changed IS NULL OR array_length(_changed, 1) = 0 THEN RETURN NULL; END IF;
  END IF;

  BEGIN
    _rid := COALESCE((_new ->> 'id')::uuid, (_old ->> 'id')::uuid);
  EXCEPTION WHEN OTHERS THEN _rid := NULL; END;
  BEGIN
    _showroom := COALESCE((_new ->> 'showroom_id')::uuid, (_old ->> 'showroom_id')::uuid);
  EXCEPTION WHEN OTHERS THEN _showroom := NULL; END;

  INSERT INTO public.audit_log (
    actor_id, actor_email, action, table_name, record_id, showroom_id,
    changed_fields, old_data, new_data)
  VALUES (
    _u, public.audit_actor_email(_u), lower(TG_OP), TG_TABLE_NAME, _rid, _showroom,
    _changed, _old, _new);

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Logging must never roll back the user's real work.
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

-- Attach to the tracked tables (skips any table that does not exist)
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sales','sale_items','sale_returns','customer_payments',
    'purchases','purchase_items','purchase_returns','supplier_payments',
    'transfers','transfer_items',
    'products','raw_materials','recipes','sub_recipes','sub_recipe_items',
    'wastage_log','repurpose_queue','production_overheads',
    'customers','suppliers','showrooms','company_settings','employees',
    'app_roles','role_permissions','user_role_assignments','user_roles'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
           FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', t);
    END IF;
  END LOOP;
END $do$;

-- ---------------------------------------------------------------------------
-- Batch delete writes a plain-language note as well
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_production_batch(_batch_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.assert_app_staff();
  PERFORM public.assert_permission('production.batches.delete');
  PERFORM public.reverse_production_batch_internal(_batch_id, COALESCE(_note, 'Batch deleted'));
  PERFORM public.audit_note('production_batches', _batch_id,
    COALESCE(_note, 'Production batch deleted (stock reversed)'));
END; $$;

-- ---------------------------------------------------------------------------
-- Retention cleanup (superadmin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_audit_log(_before timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _n integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_bootstrap_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.audit_log WHERE occurred_at < _before;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END; $$;
REVOKE ALL ON FUNCTION public.purge_audit_log(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_audit_log(timestamptz) TO authenticated, service_role;

COMMIT;
