ALTER TABLE public.license_devices
ALTER COLUMN license_owner_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

DROP POLICY IF EXISTS "Authenticated create sale_items" ON public.sale_items;
CREATE POLICY "Checkout creates sale items"
ON public.sale_items FOR INSERT TO authenticated
WITH CHECK (
  exists (
    select 1
    from public.sales s
    where s.id = sale_id
      and s.sold_by = auth.uid()
      and s.license_id = public.current_license_id()
  )
);

DROP POLICY IF EXISTS "Authenticated view sale_items" ON public.sale_items;
CREATE POLICY "Users view sale items for active license"
ON public.sale_items FOR SELECT TO authenticated
USING (
  exists (
    select 1
    from public.sales s
    where s.id = sale_id
      and public.can_access_license(s.license_id)
  )
);