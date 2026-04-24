-- =========================================================
-- 1. LICENSE KEYS
-- =========================================================
create table public.license_keys (
  id uuid primary key default gen_random_uuid(),
  key_value text not null unique,
  client_name text not null,
  role public.app_role not null default 'staff',
  device_limit integer not null default 1 check (device_limit > 0),
  expires_at timestamptz,
  revoked boolean not null default false,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.license_keys enable row level security;

create policy "Authenticated view licenses"
  on public.license_keys for select
  to authenticated using (true);

create policy "Admins insert licenses"
  on public.license_keys for insert
  to authenticated with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins update licenses"
  on public.license_keys for update
  to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "Admins delete licenses"
  on public.license_keys for delete
  to authenticated using (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 2. LICENSE DEVICES
-- =========================================================
create table public.license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.license_keys(id) on delete cascade,
  device_id text not null,
  user_id uuid,
  device_label text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (license_id, device_id)
);

alter table public.license_devices enable row level security;

create policy "Authenticated view devices"
  on public.license_devices for select
  to authenticated using (true);

create policy "Admins manage devices"
  on public.license_devices for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 3. BUSINESS SETTINGS (single row)
-- =========================================================
create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default 'SGH Gadget Store',
  address text,
  phone text,
  email text,
  tax_id text,
  logo_url text,
  invoice_footer text,
  updated_at timestamptz not null default now()
);

alter table public.business_settings enable row level security;

create policy "Authenticated view settings"
  on public.business_settings for select
  to authenticated using (true);

create policy "Admins update settings"
  on public.business_settings for update
  to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "Admins insert settings"
  on public.business_settings for insert
  to authenticated with check (public.has_role(auth.uid(), 'admin'));

create trigger trg_business_settings_updated
  before update on public.business_settings
  for each row execute function public.set_updated_at();

insert into public.business_settings (business_name) values ('SGH Gadget Store');

-- =========================================================
-- 4. INVOICES
-- =========================================================
create sequence public.invoice_number_seq start 1000;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default ('INV-' || to_char(nextval('public.invoice_number_seq'), 'FM000000')),
  sale_id uuid references public.sales(id) on delete set null,
  client_name text,
  client_phone text,
  client_email text,
  client_address text,
  notes text,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  business_snapshot jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.invoices enable row level security;

create policy "Authenticated view invoices"
  on public.invoices for select
  to authenticated using (true);

create policy "Authenticated create invoices"
  on public.invoices for insert
  to authenticated with check (true);

create policy "Authenticated update invoices"
  on public.invoices for update
  to authenticated using (true);

create policy "Admins delete invoices"
  on public.invoices for delete
  to authenticated using (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 5. STORAGE BUCKET FOR LOGOS
-- =========================================================
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "Public read logos"
  on storage.objects for select
  using (bucket_id = 'logos');

create policy "Admins upload logos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'logos' and public.has_role(auth.uid(), 'admin'));

create policy "Admins update logos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'logos' and public.has_role(auth.uid(), 'admin'));

create policy "Admins delete logos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'logos' and public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 6. KEY GENERATION HELPER
-- =========================================================
create or replace function public.generate_license_key()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  chunk text;
  result text := 'SGH';
  i int;
  j int;
begin
  for i in 1..4 loop
    chunk := '';
    for j in 1..4 loop
      chunk := chunk || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    result := result || '-' || chunk;
  end loop;
  return result;
end;
$$;

-- =========================================================
-- 7. ACTIVATION FUNCTION
-- =========================================================
create or replace function public.activate_license(
  _key text,
  _device_id text,
  _device_label text default null
)
returns table (
  license_id uuid,
  role public.app_role,
  client_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _lic public.license_keys%rowtype;
  _device_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into _lic from public.license_keys
    where key_value = upper(trim(_key));

  if _lic.id is null then
    raise exception 'Invalid license key';
  end if;
  if _lic.revoked then
    raise exception 'License key has been revoked';
  end if;
  if _lic.expires_at is not null and _lic.expires_at < now() then
    raise exception 'License key expired';
  end if;

  -- existing device?
  if exists (select 1 from public.license_devices
             where license_id = _lic.id and device_id = _device_id) then
    update public.license_devices
      set last_seen_at = now(), user_id = auth.uid(), device_label = coalesce(_device_label, device_label)
      where license_id = _lic.id and device_id = _device_id;
  else
    select count(*) into _device_count from public.license_devices where license_id = _lic.id;
    if _device_count >= _lic.device_limit then
      raise exception 'Device limit reached for this license';
    end if;
    insert into public.license_devices (license_id, device_id, user_id, device_label)
      values (_lic.id, _device_id, auth.uid(), _device_label);
  end if;

  -- assign / refresh role
  delete from public.user_roles where user_id = auth.uid();
  insert into public.user_roles (user_id, role) values (auth.uid(), _lic.role);

  -- ensure profile exists
  insert into public.profiles (id, full_name, email)
  values (auth.uid(), _lic.client_name, null)
  on conflict (id) do update set full_name = excluded.full_name;

  return query select _lic.id, _lic.role, _lic.client_name, _lic.expires_at;
end;
$$;

-- =========================================================
-- 8. SEED MASTER ADMIN KEY (no expiry, 5 devices)
-- =========================================================
insert into public.license_keys (key_value, client_name, role, device_limit, expires_at, notes)
values ('SGH-ADMN-MSTR-2026-ROOT', 'SGH Master Admin', 'admin', 5, null, 'Master bootstrap key — keep secret');