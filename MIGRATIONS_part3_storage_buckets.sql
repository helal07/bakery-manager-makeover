-- Create the storage buckets used by the app (all private; the app signs URLs).
insert into storage.buckets (id, name, public)
values
  ('company-logos',    'company-logos',    false),
  ('product-images',   'product-images',   false),
  ('customer-avatars', 'customer-avatars', false)
on conflict (id) do nothing;

-- RLS policies on storage.objects: allow any authenticated user to read/write
-- objects in these three buckets. Tighten later per-user if needed.
do $$
begin
  -- READ
  if not exists (select 1 from pg_policies where policyname = 'app buckets read' and tablename = 'objects' and schemaname = 'storage') then
    create policy "app buckets read"
      on storage.objects for select
      to authenticated
      using (bucket_id in ('company-logos','product-images','customer-avatars'));
  end if;

  -- INSERT
  if not exists (select 1 from pg_policies where policyname = 'app buckets insert' and tablename = 'objects' and schemaname = 'storage') then
    create policy "app buckets insert"
      on storage.objects for insert
      to authenticated
      with check (bucket_id in ('company-logos','product-images','customer-avatars'));
  end if;

  -- UPDATE (upsert)
  if not exists (select 1 from pg_policies where policyname = 'app buckets update' and tablename = 'objects' and schemaname = 'storage') then
    create policy "app buckets update"
      on storage.objects for update
      to authenticated
      using (bucket_id in ('company-logos','product-images','customer-avatars'))
      with check (bucket_id in ('company-logos','product-images','customer-avatars'));
  end if;

  -- DELETE
  if not exists (select 1 from pg_policies where policyname = 'app buckets delete' and tablename = 'objects' and schemaname = 'storage') then
    create policy "app buckets delete"
      on storage.objects for delete
      to authenticated
      using (bucket_id in ('company-logos','product-images','customer-avatars'));
  end if;
end $$;
