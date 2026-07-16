-- Enums
do $$ begin
  create type public.app_role as enum ('superadmin','owner','admin','manager','cashier','staff','employee');
exception when duplicate_object then null; end $$;

-- updated_at trigger function
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- showrooms
create table if not exists public.showrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  city text,
  address text,
  phone text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.showrooms to authenticated;
grant all on public.showrooms to service_role;
alter table public.showrooms enable row level security;
drop policy if exists "showrooms_all_authenticated" on public.showrooms;
create policy "showrooms_all_authenticated" on public.showrooms for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.showrooms;
create trigger set_updated_at before update on public.showrooms for each row execute function public.update_updated_at_column();

-- user_roles
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
drop policy if exists "user_roles_all_authenticated" on public.user_roles;
create policy "user_roles_all_authenticated" on public.user_roles for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.user_roles;
create trigger set_updated_at before update on public.user_roles for each row execute function public.update_updated_at_column();

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

-- app_roles
create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.app_roles to authenticated;
grant all on public.app_roles to service_role;
alter table public.app_roles enable row level security;
drop policy if exists "app_roles_all_authenticated" on public.app_roles;
create policy "app_roles_all_authenticated" on public.app_roles for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.app_roles;
create trigger set_updated_at before update on public.app_roles for each row execute function public.update_updated_at_column();

-- permissions
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  permission_key text not null unique,
  module text,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.permissions to authenticated;
grant all on public.permissions to service_role;
alter table public.permissions enable row level security;
drop policy if exists "permissions_all_authenticated" on public.permissions;
create policy "permissions_all_authenticated" on public.permissions for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.permissions;
create trigger set_updated_at before update on public.permissions for each row execute function public.update_updated_at_column();

-- role_permissions
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.app_roles(id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(role_id, permission_key)
);
grant select, insert, update, delete on public.role_permissions to authenticated;
grant all on public.role_permissions to service_role;
alter table public.role_permissions enable row level security;
drop policy if exists "role_permissions_all_authenticated" on public.role_permissions;
create policy "role_permissions_all_authenticated" on public.role_permissions for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.role_permissions;
create trigger set_updated_at before update on public.role_permissions for each row execute function public.update_updated_at_column();

-- user_role_assignments
create table if not exists public.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid references public.app_roles(id) on delete cascade,
  showroom_id uuid references public.showrooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.user_role_assignments to authenticated;
grant all on public.user_role_assignments to service_role;
alter table public.user_role_assignments enable row level security;
drop policy if exists "user_role_assignments_all_authenticated" on public.user_role_assignments;
create policy "user_role_assignments_all_authenticated" on public.user_role_assignments for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.user_role_assignments;
create trigger set_updated_at before update on public.user_role_assignments for each row execute function public.update_updated_at_column();

-- user_profiles
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
alter table public.user_profiles enable row level security;
drop policy if exists "user_profiles_all_authenticated" on public.user_profiles;
create policy "user_profiles_all_authenticated" on public.user_profiles for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.user_profiles;
create trigger set_updated_at before update on public.user_profiles for each row execute function public.update_updated_at_column();

-- employees
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  showroom_id uuid references public.showrooms(id) on delete set null,
  email text,
  phone text,
  salary numeric,
  attendance numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.employees to authenticated;
grant all on public.employees to service_role;
alter table public.employees enable row level security;
drop policy if exists "employees_all_authenticated" on public.employees;
create policy "employees_all_authenticated" on public.employees for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.employees;
create trigger set_updated_at before update on public.employees for each row execute function public.update_updated_at_column();

-- customer_groups
create table if not exists public.customer_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_pct numeric not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customer_groups to authenticated;
grant all on public.customer_groups to service_role;
alter table public.customer_groups enable row level security;
drop policy if exists "customer_groups_all_authenticated" on public.customer_groups;
create policy "customer_groups_all_authenticated" on public.customer_groups for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.customer_groups;
create trigger set_updated_at before update on public.customer_groups for each row execute function public.update_updated_at_column();

-- customers
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  loyalty_points numeric not null default 0,
  avatar_url text,
  group_id uuid references public.customer_groups(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
drop policy if exists "customers_all_authenticated" on public.customers;
create policy "customers_all_authenticated" on public.customers for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.customers;
create trigger set_updated_at before update on public.customers for each row execute function public.update_updated_at_column();

-- cash_registers
create table if not exists public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid references public.showrooms(id) on delete set null,
  cashier_id uuid,
  opened_by uuid,
  closed_by uuid,
  opening_float numeric not null default 0,
  closing_cash numeric,
  expected_cash numeric,
  difference numeric,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  note_open text,
  note_close text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cash_registers to authenticated;
grant all on public.cash_registers to service_role;
alter table public.cash_registers enable row level security;
drop policy if exists "cash_registers_all_authenticated" on public.cash_registers;
create policy "cash_registers_all_authenticated" on public.cash_registers for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.cash_registers;
create trigger set_updated_at before update on public.cash_registers for each row execute function public.update_updated_at_column();

-- units
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.units to authenticated;
grant all on public.units to service_role;
alter table public.units enable row level security;
drop policy if exists "units_all_authenticated" on public.units;
create policy "units_all_authenticated" on public.units for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.units;
create trigger set_updated_at before update on public.units for each row execute function public.update_updated_at_column();

-- product_categories
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.product_categories to authenticated;
grant all on public.product_categories to service_role;
alter table public.product_categories enable row level security;
drop policy if exists "product_categories_all_authenticated" on public.product_categories;
create policy "product_categories_all_authenticated" on public.product_categories for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.product_categories;
create trigger set_updated_at before update on public.product_categories for each row execute function public.update_updated_at_column();

-- selling_price_groups
create table if not exists public.selling_price_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.selling_price_groups to authenticated;
grant all on public.selling_price_groups to service_role;
alter table public.selling_price_groups enable row level security;
drop policy if exists "selling_price_groups_all_authenticated" on public.selling_price_groups;
create policy "selling_price_groups_all_authenticated" on public.selling_price_groups for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.selling_price_groups;
create trigger set_updated_at before update on public.selling_price_groups for each row execute function public.update_updated_at_column();

-- products
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text,
  name text not null,
  category text,
  category_id uuid references public.product_categories(id) on delete set null,
  unit text,
  price numeric not null default 0,
  cost numeric not null default 0,
  threshold numeric not null default 0,
  shelf_life_days integer,
  mfg_date date,
  expiry_date date,
  image_url text,
  barcode text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
drop policy if exists "products_all_authenticated" on public.products;
create policy "products_all_authenticated" on public.products for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.products;
create trigger set_updated_at before update on public.products for each row execute function public.update_updated_at_column();

-- product_stock
create table if not exists public.product_stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  showroom_id uuid references public.showrooms(id) on delete cascade,
  quantity numeric not null default 0,
  min_stock numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, showroom_id)
);
grant select, insert, update, delete on public.product_stock to authenticated;
grant all on public.product_stock to service_role;
alter table public.product_stock enable row level security;
drop policy if exists "product_stock_all_authenticated" on public.product_stock;
create policy "product_stock_all_authenticated" on public.product_stock for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.product_stock;
create trigger set_updated_at before update on public.product_stock for each row execute function public.update_updated_at_column();

-- product_selling_prices
create table if not exists public.product_selling_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  price_group_id uuid references public.selling_price_groups(id) on delete cascade,
  price numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, price_group_id)
);
grant select, insert, update, delete on public.product_selling_prices to authenticated;
grant all on public.product_selling_prices to service_role;
alter table public.product_selling_prices enable row level security;
drop policy if exists "product_selling_prices_all_authenticated" on public.product_selling_prices;
create policy "product_selling_prices_all_authenticated" on public.product_selling_prices for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.product_selling_prices;
create trigger set_updated_at before update on public.product_selling_prices for each row execute function public.update_updated_at_column();

-- stock_ledger
create table if not exists public.stock_ledger (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  showroom_id uuid references public.showrooms(id) on delete set null,
  qty numeric not null,
  kind text,
  ref_type text,
  ref_id uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.stock_ledger to authenticated;
grant all on public.stock_ledger to service_role;
alter table public.stock_ledger enable row level security;
drop policy if exists "stock_ledger_all_authenticated" on public.stock_ledger;
create policy "stock_ledger_all_authenticated" on public.stock_ledger for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.stock_ledger;
create trigger set_updated_at before update on public.stock_ledger for each row execute function public.update_updated_at_column();

-- raw_materials
create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text,
  cost numeric not null default 0,
  threshold numeric not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.raw_materials to authenticated;
grant all on public.raw_materials to service_role;
alter table public.raw_materials enable row level security;
drop policy if exists "raw_materials_all_authenticated" on public.raw_materials;
create policy "raw_materials_all_authenticated" on public.raw_materials for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.raw_materials;
create trigger set_updated_at before update on public.raw_materials for each row execute function public.update_updated_at_column();

-- raw_material_stock
create table if not exists public.raw_material_stock (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.raw_materials(id) on delete cascade,
  showroom_id uuid references public.showrooms(id) on delete cascade,
  quantity numeric not null default 0,
  min_stock numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, showroom_id)
);
grant select, insert, update, delete on public.raw_material_stock to authenticated;
grant all on public.raw_material_stock to service_role;
alter table public.raw_material_stock enable row level security;
drop policy if exists "raw_material_stock_all_authenticated" on public.raw_material_stock;
create policy "raw_material_stock_all_authenticated" on public.raw_material_stock for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.raw_material_stock;
create trigger set_updated_at before update on public.raw_material_stock for each row execute function public.update_updated_at_column();

-- raw_stock_ledger
create table if not exists public.raw_stock_ledger (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references public.raw_materials(id) on delete cascade,
  showroom_id uuid references public.showrooms(id) on delete set null,
  qty numeric not null,
  kind text,
  ref_type text,
  ref_id uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.raw_stock_ledger to authenticated;
grant all on public.raw_stock_ledger to service_role;
alter table public.raw_stock_ledger enable row level security;
drop policy if exists "raw_stock_ledger_all_authenticated" on public.raw_stock_ledger;
create policy "raw_stock_ledger_all_authenticated" on public.raw_stock_ledger for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.raw_stock_ledger;
create trigger set_updated_at before update on public.raw_stock_ledger for each row execute function public.update_updated_at_column();

-- recipe_categories
create table if not exists public.recipe_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.recipe_categories to authenticated;
grant all on public.recipe_categories to service_role;
alter table public.recipe_categories enable row level security;
drop policy if exists "recipe_categories_all_authenticated" on public.recipe_categories;
create policy "recipe_categories_all_authenticated" on public.recipe_categories for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.recipe_categories;
create trigger set_updated_at before update on public.recipe_categories for each row execute function public.update_updated_at_column();

-- recipes
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  material_id uuid not null references public.raw_materials(id) on delete cascade,
  category_id uuid references public.recipe_categories(id) on delete set null,
  qty numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.recipes to authenticated;
grant all on public.recipes to service_role;
alter table public.recipes enable row level security;
drop policy if exists "recipes_all_authenticated" on public.recipes;
create policy "recipes_all_authenticated" on public.recipes for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.recipes;
create trigger set_updated_at before update on public.recipes for each row execute function public.update_updated_at_column();

-- work_orders
create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  showroom_id uuid references public.showrooms(id) on delete set null,
  batch_qty numeric not null default 0,
  batch_id text,
  assigned_to uuid,
  status text not null default 'pending',
  planned_date date,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.work_orders to authenticated;
grant all on public.work_orders to service_role;
alter table public.work_orders enable row level security;
drop policy if exists "work_orders_all_authenticated" on public.work_orders;
create policy "work_orders_all_authenticated" on public.work_orders for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.work_orders;
create trigger set_updated_at before update on public.work_orders for each row execute function public.update_updated_at_column();

-- qc_checks
create table if not exists public.qc_checks (
  id uuid primary key default gen_random_uuid(),
  batch_id text,
  product_id uuid references public.products(id) on delete set null,
  showroom_id uuid references public.showrooms(id) on delete set null,
  result text not null default 'pass',
  notes text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.qc_checks to authenticated;
grant all on public.qc_checks to service_role;
alter table public.qc_checks enable row level security;
drop policy if exists "qc_checks_all_authenticated" on public.qc_checks;
create policy "qc_checks_all_authenticated" on public.qc_checks for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.qc_checks;
create trigger set_updated_at before update on public.qc_checks for each row execute function public.update_updated_at_column();

-- wastage_log
create table if not exists public.wastage_log (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references public.raw_materials(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  showroom_id uuid references public.showrooms(id) on delete set null,
  qty numeric not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.wastage_log to authenticated;
grant all on public.wastage_log to service_role;
alter table public.wastage_log enable row level security;
drop policy if exists "wastage_log_all_authenticated" on public.wastage_log;
create policy "wastage_log_all_authenticated" on public.wastage_log for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.wastage_log;
create trigger set_updated_at before update on public.wastage_log for each row execute function public.update_updated_at_column();

-- suppliers
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
alter table public.suppliers enable row level security;
drop policy if exists "suppliers_all_authenticated" on public.suppliers;
create policy "suppliers_all_authenticated" on public.suppliers for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.suppliers;
create trigger set_updated_at before update on public.suppliers for each row execute function public.update_updated_at_column();

-- purchase_categories
create table if not exists public.purchase_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.purchase_categories to authenticated;
grant all on public.purchase_categories to service_role;
alter table public.purchase_categories enable row level security;
drop policy if exists "purchase_categories_all_authenticated" on public.purchase_categories;
create policy "purchase_categories_all_authenticated" on public.purchase_categories for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.purchase_categories;
create trigger set_updated_at before update on public.purchase_categories for each row execute function public.update_updated_at_column();

-- purchases
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  code text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  category_id uuid references public.purchase_categories(id) on delete set null,
  showroom_id uuid references public.showrooms(id) on delete set null,
  purchase_date date not null default current_date,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  paid numeric not null default 0,
  due numeric not null default 0,
  status text not null default 'Received',
  payment text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.purchases to authenticated;
grant all on public.purchases to service_role;
alter table public.purchases enable row level security;
drop policy if exists "purchases_all_authenticated" on public.purchases;
create policy "purchases_all_authenticated" on public.purchases for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.purchases;
create trigger set_updated_at before update on public.purchases for each row execute function public.update_updated_at_column();

-- purchase_items
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references public.purchases(id) on delete cascade,
  material_id uuid references public.raw_materials(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  name text,
  unit text,
  qty numeric not null default 0,
  price numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.purchase_items to authenticated;
grant all on public.purchase_items to service_role;
alter table public.purchase_items enable row level security;
drop policy if exists "purchase_items_all_authenticated" on public.purchase_items;
create policy "purchase_items_all_authenticated" on public.purchase_items for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.purchase_items;
create trigger set_updated_at before update on public.purchase_items for each row execute function public.update_updated_at_column();

-- purchase_returns
create table if not exists public.purchase_returns (
  id uuid primary key default gen_random_uuid(),
  code text,
  purchase_id uuid references public.purchases(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  showroom_id uuid references public.showrooms(id) on delete set null,
  amount numeric not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.purchase_returns to authenticated;
grant all on public.purchase_returns to service_role;
alter table public.purchase_returns enable row level security;
drop policy if exists "purchase_returns_all_authenticated" on public.purchase_returns;
create policy "purchase_returns_all_authenticated" on public.purchase_returns for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.purchase_returns;
create trigger set_updated_at before update on public.purchase_returns for each row execute function public.update_updated_at_column();

-- purchase_return_items
create table if not exists public.purchase_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid references public.purchase_returns(id) on delete cascade,
  material_id uuid references public.raw_materials(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  name text,
  unit text,
  qty numeric not null default 0,
  price numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.purchase_return_items to authenticated;
grant all on public.purchase_return_items to service_role;
alter table public.purchase_return_items enable row level security;
drop policy if exists "purchase_return_items_all_authenticated" on public.purchase_return_items;
create policy "purchase_return_items_all_authenticated" on public.purchase_return_items for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.purchase_return_items;
create trigger set_updated_at before update on public.purchase_return_items for each row execute function public.update_updated_at_column();

-- supplier_payments
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete cascade,
  purchase_id uuid references public.purchases(id) on delete set null,
  showroom_id uuid references public.showrooms(id) on delete set null,
  amount numeric not null default 0,
  method text,
  reference text,
  note text,
  paid_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.supplier_payments to authenticated;
grant all on public.supplier_payments to service_role;
alter table public.supplier_payments enable row level security;
drop policy if exists "supplier_payments_all_authenticated" on public.supplier_payments;
create policy "supplier_payments_all_authenticated" on public.supplier_payments for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.supplier_payments;
create trigger set_updated_at before update on public.supplier_payments for each row execute function public.update_updated_at_column();

-- expense_categories
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.expense_categories to authenticated;
grant all on public.expense_categories to service_role;
alter table public.expense_categories enable row level security;
drop policy if exists "expense_categories_all_authenticated" on public.expense_categories;
create policy "expense_categories_all_authenticated" on public.expense_categories for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.expense_categories;
create trigger set_updated_at before update on public.expense_categories for each row execute function public.update_updated_at_column();

-- expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.expense_categories(id) on delete set null,
  category text,
  showroom_id uuid references public.showrooms(id) on delete set null,
  title text,
  description text,
  amount numeric not null default 0,
  note text,
  expense_date date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.expenses to service_role;
alter table public.expenses enable row level security;
drop policy if exists "expenses_all_authenticated" on public.expenses;
create policy "expenses_all_authenticated" on public.expenses for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.expenses;
create trigger set_updated_at before update on public.expenses for each row execute function public.update_updated_at_column();

-- sales
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  external_ref text,
  showroom_id uuid references public.showrooms(id) on delete set null,
  register_id uuid references public.cash_registers(id) on delete set null,
  cashier_id uuid,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  paid numeric not null default 0,
  due numeric not null default 0,
  payment_mode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sales to authenticated;
grant all on public.sales to service_role;
alter table public.sales enable row level security;
drop policy if exists "sales_all_authenticated" on public.sales;
create policy "sales_all_authenticated" on public.sales for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.sales;
create trigger set_updated_at before update on public.sales for each row execute function public.update_updated_at_column();

-- sale_items
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  product_sku text,
  qty numeric not null default 0,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sale_items to authenticated;
grant all on public.sale_items to service_role;
alter table public.sale_items enable row level security;
drop policy if exists "sale_items_all_authenticated" on public.sale_items;
create policy "sale_items_all_authenticated" on public.sale_items for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.sale_items;
create trigger set_updated_at before update on public.sale_items for each row execute function public.update_updated_at_column();

-- sale_payments
create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null,
  amount numeric not null default 0,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sale_payments to authenticated;
grant all on public.sale_payments to service_role;
alter table public.sale_payments enable row level security;
drop policy if exists "sale_payments_all_authenticated" on public.sale_payments;
create policy "sale_payments_all_authenticated" on public.sale_payments for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.sale_payments;
create trigger set_updated_at before update on public.sale_payments for each row execute function public.update_updated_at_column();

-- sale_returns
create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  code text,
  sale_id uuid references public.sales(id) on delete set null,
  invoice_ref text,
  customer_name text,
  amount numeric not null default 0,
  reason text,
  showroom_id uuid references public.showrooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sale_returns to authenticated;
grant all on public.sale_returns to service_role;
alter table public.sale_returns enable row level security;
drop policy if exists "sale_returns_all_authenticated" on public.sale_returns;
create policy "sale_returns_all_authenticated" on public.sale_returns for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.sale_returns;
create trigger set_updated_at before update on public.sale_returns for each row execute function public.update_updated_at_column();

-- sale_return_items
create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid references public.sale_returns(id) on delete cascade,
  sale_item_id uuid references public.sale_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  qty numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sale_return_items to authenticated;
grant all on public.sale_return_items to service_role;
alter table public.sale_return_items enable row level security;
drop policy if exists "sale_return_items_all_authenticated" on public.sale_return_items;
create policy "sale_return_items_all_authenticated" on public.sale_return_items for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.sale_return_items;
create trigger set_updated_at before update on public.sale_return_items for each row execute function public.update_updated_at_column();

-- customer_payments
create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  showroom_id uuid references public.showrooms(id) on delete set null,
  invoice_ref text,
  customer_name text,
  customer_phone text,
  amount numeric not null default 0,
  method text,
  reference text,
  note text,
  paid_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customer_payments to authenticated;
grant all on public.customer_payments to service_role;
alter table public.customer_payments enable row level security;
drop policy if exists "customer_payments_all_authenticated" on public.customer_payments;
create policy "customer_payments_all_authenticated" on public.customer_payments for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.customer_payments;
create trigger set_updated_at before update on public.customer_payments for each row execute function public.update_updated_at_column();

-- held_sales
create table if not exists public.held_sales (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid references public.showrooms(id) on delete set null,
  cashier_id uuid,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  label text,
  snapshot jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  item_count integer not null default 0,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.held_sales to authenticated;
grant all on public.held_sales to service_role;
alter table public.held_sales enable row level security;
drop policy if exists "held_sales_all_authenticated" on public.held_sales;
create policy "held_sales_all_authenticated" on public.held_sales for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.held_sales;
create trigger set_updated_at before update on public.held_sales for each row execute function public.update_updated_at_column();

-- transfers
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  code text,
  from_showroom_id uuid references public.showrooms(id) on delete set null,
  to_showroom_id uuid references public.showrooms(id) on delete set null,
  status text not null default 'pending',
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.transfers to authenticated;
grant all on public.transfers to service_role;
alter table public.transfers enable row level security;
drop policy if exists "transfers_all_authenticated" on public.transfers;
create policy "transfers_all_authenticated" on public.transfers for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.transfers;
create trigger set_updated_at before update on public.transfers for each row execute function public.update_updated_at_column();

-- transfer_items
create table if not exists public.transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  material_id uuid references public.raw_materials(id) on delete set null,
  qty numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.transfer_items to authenticated;
grant all on public.transfer_items to service_role;
alter table public.transfer_items enable row level security;
drop policy if exists "transfer_items_all_authenticated" on public.transfer_items;
create policy "transfer_items_all_authenticated" on public.transfer_items for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.transfer_items;
create trigger set_updated_at before update on public.transfer_items for each row execute function public.update_updated_at_column();

-- orders
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  showroom_id uuid references public.showrooms(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  status text not null default 'pending',
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
drop policy if exists "orders_all_authenticated" on public.orders;
create policy "orders_all_authenticated" on public.orders for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.orders;
create trigger set_updated_at before update on public.orders for each row execute function public.update_updated_at_column();

-- company_settings
create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  name text,
  tagline text,
  logo_url text,
  address text,
  phone text,
  email text,
  vat_reg text,
  footer_note text,
  currency text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.company_settings to authenticated;
grant all on public.company_settings to service_role;
alter table public.company_settings enable row level security;
drop policy if exists "company_settings_all_authenticated" on public.company_settings;
create policy "company_settings_all_authenticated" on public.company_settings for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.company_settings;
create trigger set_updated_at before update on public.company_settings for each row execute function public.update_updated_at_column();

-- landing_content
create table if not exists public.landing_content (
  id uuid primary key default gen_random_uuid(),
  section text,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.landing_content to authenticated;
grant all on public.landing_content to service_role;
alter table public.landing_content enable row level security;
drop policy if exists "landing_content_all_authenticated" on public.landing_content;
create policy "landing_content_all_authenticated" on public.landing_content for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop trigger if exists set_updated_at on public.landing_content;
create trigger set_updated_at before update on public.landing_content for each row execute function public.update_updated_at_column();

-- RPC: commit_stock_movement
create or replace function public.commit_stock_movement(
  _product_id uuid,
  _showroom_id uuid,
  _qty numeric,
  _kind text,
  _ref_type text default null,
  _ref_id uuid default null,
  _note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare _ledger_id uuid;
begin
  insert into public.stock_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  values (_product_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  returning id into _ledger_id;

  insert into public.product_stock (product_id, showroom_id, quantity)
  values (_product_id, _showroom_id, _qty)
  on conflict (product_id, showroom_id)
  do update set quantity = public.product_stock.quantity + excluded.quantity;

  return _ledger_id;
end;
$$;

-- RPC: commit_raw_stock_movement
create or replace function public.commit_raw_stock_movement(
  _material_id uuid,
  _showroom_id uuid,
  _qty numeric,
  _kind text,
  _ref_type text default null,
  _ref_id uuid default null,
  _note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare _ledger_id uuid;
begin
  insert into public.raw_stock_ledger (material_id, showroom_id, qty, kind, ref_type, ref_id, note)
  values (_material_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  returning id into _ledger_id;

  insert into public.raw_material_stock (material_id, showroom_id, quantity)
  values (_material_id, _showroom_id, _qty)
  on conflict (material_id, showroom_id)
  do update set quantity = public.raw_material_stock.quantity + excluded.quantity;

  return _ledger_id;
end;
$$;

-- RPC: find_user_id_by_email
create or replace function public.find_user_id_by_email(_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(_email) limit 1;
$$;
