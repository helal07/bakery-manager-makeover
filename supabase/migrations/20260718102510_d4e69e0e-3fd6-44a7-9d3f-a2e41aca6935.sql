set search_path = public;

create table if not exists public.landing_carousels (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  subtitle text,
  image_url text not null,
  link_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.landing_carousels to anon;
grant select, insert, update, delete on public.landing_carousels to authenticated;
grant all on public.landing_carousels to service_role;

alter table public.landing_carousels enable row level security;

drop policy if exists "public read active carousels" on public.landing_carousels;
create policy "public read active carousels"
  on public.landing_carousels for select
  to anon
  using (is_active = true);

drop policy if exists "auth read carousels" on public.landing_carousels;
create policy "auth read carousels"
  on public.landing_carousels for select
  to authenticated
  using (true);

drop policy if exists "auth manage carousels" on public.landing_carousels;
create policy "auth manage carousels"
  on public.landing_carousels for all
  to authenticated
  using (true) with check (true);

drop trigger if exists trg_landing_carousels_updated_at on public.landing_carousels;
create trigger trg_landing_carousels_updated_at
  before update on public.landing_carousels
  for each row execute function public.update_updated_at_column();

alter table public.products add column if not exists show_on_landing boolean not null default false;

grant select on public.products to anon;
drop policy if exists "public read landing products" on public.products;
create policy "public read landing products"
  on public.products for select
  to anon
  using (is_active = true and show_on_landing = true);

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'landing-images read' and tablename = 'objects' and schemaname = 'storage') then
    create policy "landing-images read" on storage.objects for select
      to anon, authenticated using (bucket_id = 'landing-images');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'landing-images insert' and tablename = 'objects' and schemaname = 'storage') then
    create policy "landing-images insert" on storage.objects for insert
      to authenticated with check (bucket_id = 'landing-images');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'landing-images update' and tablename = 'objects' and schemaname = 'storage') then
    create policy "landing-images update" on storage.objects for update
      to authenticated using (bucket_id = 'landing-images') with check (bucket_id = 'landing-images');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'landing-images delete' and tablename = 'objects' and schemaname = 'storage') then
    create policy "landing-images delete" on storage.objects for delete
      to authenticated using (bucket_id = 'landing-images');
  end if;
end $$;

notify pgrst, 'reload schema';