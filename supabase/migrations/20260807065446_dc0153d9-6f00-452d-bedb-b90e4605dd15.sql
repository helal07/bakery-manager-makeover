ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS selling_price_group_id UUID REFERENCES public.selling_price_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_spg ON public.customers(selling_price_group_id);

UPDATE public.customers c
   SET selling_price_group_id = g.selling_price_group_id
  FROM public.customer_groups g
 WHERE c.group_id = g.id
   AND g.selling_price_group_id IS NOT NULL
   AND c.selling_price_group_id IS NULL;

DELETE FROM public.role_permissions WHERE permission_key = 'contacts.customer_groups.manage';
DELETE FROM public.permissions WHERE permission_key = 'contacts.customer_groups.manage';