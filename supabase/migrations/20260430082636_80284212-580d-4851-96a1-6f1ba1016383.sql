CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START 1;

CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL DEFAULT ('QUO-' || to_char(nextval('public.quote_number_seq'), 'FM000000')),
  client_name text,
  client_phone text,
  client_email text,
  client_address text,
  notes text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  valid_until date,
  status text NOT NULL DEFAULT 'draft',
  business_snapshot jsonb,
  license_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view quotations for active license"
  ON public.quotations FOR SELECT TO authenticated
  USING (can_access_license(license_id));

CREATE POLICY "Users create quotations for active license"
  ON public.quotations FOR INSERT TO authenticated
  WITH CHECK (((created_by = auth.uid()) OR (created_by IS NULL)) AND (license_id = current_license_id()));

CREATE POLICY "Users update quotations for active license"
  ON public.quotations FOR UPDATE TO authenticated
  USING (can_access_license(license_id))
  WITH CHECK (can_access_license(license_id));

CREATE POLICY "Admins delete quotations for active license"
  ON public.quotations FOR DELETE TO authenticated
  USING (can_access_license(license_id) AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();