ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS customer_address text;

CREATE OR REPLACE FUNCTION public.process_sale(_product_ids uuid[], _customer_name text, _customer_phone text, _customer_address text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into public.sales (sold_by, customer_name, customer_phone, customer_address, total, license_id)
  values (auth.uid(), _customer_name, _customer_phone, _customer_address, 0, _license_id)
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
$function$;