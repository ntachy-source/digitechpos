-- Enums
create type public.app_role as enum ('admin', 'staff');
create type public.product_status as enum ('in_stock', 'sold', 'reserved');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles viewable by authenticated"
  on public.profiles for select
  to authenticated using (true);
create policy "Users update own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id);

-- Roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.get_my_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid() order by role limit 1
$$;

create policy "Users view own roles"
  on public.user_roles for select
  to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles"
  on public.user_roles for all
  to authenticated using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  model text not null,
  category text not null default 'Mobile Phone',
  imei_serial text not null unique,
  cost_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  status public.product_status not null default 'in_stock',
  notes text,
  qr_code text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products enable row level security;

create policy "Authenticated view products"
  on public.products for select to authenticated using (true);
create policy "Admins insert products"
  on public.products for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
create policy "Admins update products"
  on public.products for update to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create policy "Admins delete products"
  on public.products for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));
-- Staff also need to update product status on sale -> handled via security definer fn below

-- Sales
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  total numeric(12,2) not null default 0,
  sold_by uuid references auth.users(id),
  customer_name text,
  customer_phone text,
  created_at timestamptz not null default now()
);
alter table public.sales enable row level security;

create policy "Authenticated view sales"
  on public.sales for select to authenticated using (true);
create policy "Authenticated create sales"
  on public.sales for insert to authenticated
  with check (sold_by = auth.uid());
create policy "Admins delete sales"
  on public.sales for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Sale items
create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  price numeric(12,2) not null,
  created_at timestamptz not null default now()
);
alter table public.sale_items enable row level security;

create policy "Authenticated view sale_items"
  on public.sale_items for select to authenticated using (true);
create policy "Authenticated create sale_items"
  on public.sale_items for insert to authenticated with check (true);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Process a sale atomically: marks products as sold (allows staff to do it via security definer)
create or replace function public.process_sale(
  _product_ids uuid[],
  _customer_name text,
  _customer_phone text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  _sale_id uuid;
  _total numeric(12,2) := 0;
  _pid uuid;
  _price numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.sales (sold_by, customer_name, customer_phone, total)
  values (auth.uid(), _customer_name, _customer_phone, 0)
  returning id into _sale_id;

  foreach _pid in array _product_ids loop
    select sale_price into _price from public.products
      where id = _pid and status = 'in_stock' for update;
    if _price is null then
      raise exception 'Product % not available', _pid;
    end if;
    insert into public.sale_items (sale_id, product_id, price) values (_sale_id, _pid, _price);
    update public.products set status = 'sold', updated_at = now() where id = _pid;
    _total := _total + _price;
  end loop;

  update public.sales set total = _total where id = _sale_id;
  return _sale_id;
end; $$;

-- Auto profile + role on new user. First user becomes admin, rest staff.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare _is_first boolean;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email);

  select count(*) = 0 into _is_first from public.user_roles;
  insert into public.user_roles (user_id, role)
  values (new.id, case when _is_first then 'admin'::public.app_role else 'staff'::public.app_role end);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();