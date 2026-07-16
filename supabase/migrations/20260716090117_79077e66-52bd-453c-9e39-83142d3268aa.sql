alter table public.showrooms add column if not exists manager_name text;

alter table public.company_settings add column if not exists is_current boolean not null default true;

alter table public.landing_content add column if not exists is_current boolean not null default true;
alter table public.landing_content add column if not exists updated_by uuid;

alter table public.orders add column if not exists code text;
alter table public.orders add column if not exists order_type text;
alter table public.orders add column if not exists items text;
alter table public.orders add column if not exists due_date date;

-- Security hardening: search_path + restrict execution
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text) from public, anon;
revoke execute on function public.commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text) from public, anon;
revoke execute on function public.find_user_id_by_email(text) from public, anon;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;

grant execute on function public.commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text) to authenticated, service_role;
grant execute on function public.commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text) to authenticated, service_role;
grant execute on function public.find_user_id_by_email(text) to authenticated, service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
