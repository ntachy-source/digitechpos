-- Add account ownership to license device and business data
ALTER TABLE public.license_devices
ADD COLUMN IF NOT EXISTS license_owner_id uuid;

UPDATE public.license_devices
SET license_owner_id = license_id
WHERE license_owner_id IS NULL;

CREATE OR REPLACE FUNCTION public.current_license_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select license_owner_id
  from public.license_devices
  where user_id = auth.uid()
  order by last_seen_at desc
  limit 1
$$;

CREATE OR REPLACE FUNCTION public.can_access_license(_license_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.current_license_id() = _license_id
$$;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS license_id uuid;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS license_id uuid;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS license_id uuid;
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS license_id uuid;

-- Preserve the original master account data and give later licenses a fresh workspace
UPDATE public.products SET license_id = '84b30d09-0310-497d-b0ea-5324ace3ad5a'::uuid WHERE license_id IS NULL;
UPDATE public.sales SET license_id = '84b30d09-0310-497d-b0ea-5324ace3ad5a'::uuid WHERE license_id IS NULL;
UPDATE public.invoices SET license_id = '84b30d09-0310-497d-b0ea-5324ace3ad5a'::uuid WHERE license_id IS NULL;
UPDATE public.business_settings SET license_id = '84b30d09-0310-497d-b0ea-5324ace3ad5a'::uuid WHERE license_id IS NULL;

ALTER TABLE public.products ALTER COLUMN license_id SET NOT NULL;
ALTER TABLE public.sales ALTER COLUMN license_id SET NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN license_id SET NOT NULL;
ALTER TABLE public.business_settings ALTER COLUMN license_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_license_id ON public.products(license_id);
CREATE INDEX IF NOT EXISTS idx_sales_license_id ON public.sales(license_id);
CREATE INDEX IF NOT EXISTS idx_invoices_license_id ON public.invoices(license_id);
CREATE INDEX IF NOT EXISTS idx_business_settings_license_id ON public.business_settings(license_id);
CREATE INDEX IF NOT EXISTS idx_license_devices_user_id_seen ON public.license_devices(user_id, last_seen_at desc);

-- Make settings one row per license account
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_settings_license_id_key'
  ) THEN
    ALTER TABLE public.business_settings ADD CONSTRAINT business_settings_license_id_key UNIQUE (license_id);
  END IF;
END $$;

-- Update sale processing to use the active license account
CREATE OR REPLACE FUNCTION public.process_sale(_product_ids uuid[], _customer_name text, _customer_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  _sale_id uuid;
  _total numeric(12,2) := 0;
  _pid uuid;
  _price numeric(12,2);
  _license_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  _license_id := public.current_license_id();
  if _license_id is null then
    raise exception 'No active license';
  end if;

  insert into public.sales (sold_by, customer_name, customer_phone, total, license_id)
  values (auth.uid(), _customer_name, _customer_phone, 0, _license_id)
  returning id into _sale_id;

  foreach _pid in array _product_ids loop
    select sale_price into _price from public.products
      where id = _pid and status = 'in_stock' and license_id = _license_id for update;
    if _price is null then
      raise exception 'Product % not available', _pid;
    end if;
    insert into public.sale_items (sale_id, product_id, price) values (_sale_id, _pid, _price);
    update public.products set status = 'sold', updated_at = now() where id = _pid and license_id = _license_id;
    _total := _total + _price;
  end loop;

  update public.sales set total = _total where id = _sale_id;
  return _sale_id;
end;
$$;

-- Replace policies to scope data by license account and allow staff product management in their own workspace
DROP POLICY IF EXISTS "Admins delete products" ON public.products;
DROP POLICY IF EXISTS "Admins insert products" ON public.products;
DROP POLICY IF EXISTS "Admins update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated view products" ON public.products;

CREATE POLICY "Users view products for active license"
ON public.products FOR SELECT TO authenticated
USING (public.can_access_license(license_id));

CREATE POLICY "Users create products for active license"
ON public.products FOR INSERT TO authenticated
WITH CHECK (license_id = public.current_license_id() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users update products for active license"
ON public.products FOR UPDATE TO authenticated
USING (public.can_access_license(license_id))
WITH CHECK (public.can_access_license(license_id));

CREATE POLICY "Users delete products for active license"
ON public.products FOR DELETE TO authenticated
USING (public.can_access_license(license_id));

DROP POLICY IF EXISTS "Authenticated create sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated view sales" ON public.sales;
DROP POLICY IF EXISTS "Admins delete sales" ON public.sales;

CREATE POLICY "Users view sales for active license"
ON public.sales FOR SELECT TO authenticated
USING (public.can_access_license(license_id));

CREATE POLICY "Users create sales for active license"
ON public.sales FOR INSERT TO authenticated
WITH CHECK (sold_by = auth.uid() AND license_id = public.current_license_id());

CREATE POLICY "Admins delete sales"
ON public.sales FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Authenticated view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Auth create invoices" ON public.invoices;
DROP POLICY IF EXISTS "Auth update own or admin" ON public.invoices;
DROP POLICY IF EXISTS "Admins delete invoices" ON public.invoices;

CREATE POLICY "Users view invoices for active license"
ON public.invoices FOR SELECT TO authenticated
USING (public.can_access_license(license_id));

CREATE POLICY "Users create invoices for active license"
ON public.invoices FOR INSERT TO authenticated
WITH CHECK ((created_by = auth.uid() OR created_by IS NULL) AND license_id = public.current_license_id());

CREATE POLICY "Users update invoices for active license"
ON public.invoices FOR UPDATE TO authenticated
USING (public.can_access_license(license_id))
WITH CHECK (public.can_access_license(license_id));

CREATE POLICY "Admins delete invoices"
ON public.invoices FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Authenticated view settings" ON public.business_settings;
DROP POLICY IF EXISTS "Admins insert settings" ON public.business_settings;
DROP POLICY IF EXISTS "Admins update settings" ON public.business_settings;

CREATE POLICY "Users view settings for active license"
ON public.business_settings FOR SELECT TO authenticated
USING (public.can_access_license(license_id));

CREATE POLICY "Users create settings for active license"
ON public.business_settings FOR INSERT TO authenticated
WITH CHECK (license_id = public.current_license_id() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users update settings for active license"
ON public.business_settings FOR UPDATE TO authenticated
USING (public.can_access_license(license_id))
WITH CHECK (public.can_access_license(license_id));