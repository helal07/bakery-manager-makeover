-- Ensure the public landing page can read CMS content anonymously.
-- Idempotent: safe to re-apply on self-hosted Supabase.
set search_path = public;

-- landing_content: anon read of the current row
grant select on public.landing_content to anon;
drop policy if exists "public read landing content" on public.landing_content;
create policy "public read landing content"
  on public.landing_content for select
  to anon
  using (is_current = true);

-- landing_carousels: anon read of active slides
grant select on public.landing_carousels to anon;
drop policy if exists "public read active carousels" on public.landing_carousels;
create policy "public read active carousels"
  on public.landing_carousels for select
  to anon
  using (is_active = true);

-- products: anon read of items flagged for landing
grant select on public.products to anon;
drop policy if exists "public read landing products" on public.products;
create policy "public read landing products"
  on public.products for select
  to anon
  using (is_active = true and show_on_landing = true);
