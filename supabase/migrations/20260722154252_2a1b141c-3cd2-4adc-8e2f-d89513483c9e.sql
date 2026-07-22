DROP POLICY IF EXISTS employees_select ON public.employees;
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated
  USING (
    public.user_is_global_admin(auth.uid())
    OR user_id = auth.uid()
    OR (showroom_id IS NOT NULL AND public.user_has_showroom_access(auth.uid(), showroom_id))
  );