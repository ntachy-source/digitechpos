CREATE OR REPLACE FUNCTION public.can_access_license(_license_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select public.current_license_id() = _license_id
$$;

DROP POLICY IF EXISTS "Admins delete sales" ON public.sales;
CREATE POLICY "Users delete sales for active license"
ON public.sales FOR DELETE TO authenticated
USING (public.can_access_license(license_id) AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins delete invoices" ON public.invoices;
CREATE POLICY "Users delete invoices for active license"
ON public.invoices FOR DELETE TO authenticated
USING (public.can_access_license(license_id) AND public.has_role(auth.uid(), 'admin'::public.app_role));