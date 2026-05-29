CREATE OR REPLACE FUNCTION public.process_sale_qty(
  _items jsonb,
  _customer_name text,
  _customer_phone text,
  _customer_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  _sale_id uuid;
  _total numeric(12,2) := 0;
  _license_id uuid;
  _item jsonb;
  _pid uuid;
  _qty int;
  _price numeric(12,2);
  _avail int;
  _i int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  _license_id := public.current_license_id();
  if _license_id is null then raise exception 'No active license'; end if;

  insert into public.sales (sold_by, customer_name, customer_phone, customer_address, total, license_id)
  values (auth.uid(), _customer_name, _customer_phone, _customer_address, 0, _license_id)
  returning id into _sale_id;

  for _item in select * from jsonb_array_elements(_items) loop
    _pid := (_item->>'product_id')::uuid;
    _qty := coalesce((_item->>'quantity')::int, 1);
    if _qty < 1 then raise exception 'Quantity must be at least 1'; end if;

    select sale_price, quantity into _price, _avail
      from public.products
      where id = _pid and status = 'in_stock' and license_id = _license_id
      for update;
    if _price is null then raise exception 'Product % not available', _pid; end if;
    if _avail < _qty then raise exception 'Insufficient stock for product % (have %, need %)', _pid, _avail, _qty; end if;

    for _i in 1.._qty loop
      insert into public.sale_items (sale_id, product_id, price) values (_sale_id, _pid, _price);
      _total := _total + _price;
    end loop;

    if _avail - _qty <= 0 then
      update public.products set status = 'sold', quantity = 0, updated_at = now() where id = _pid;
    else
      update public.products set quantity = _avail - _qty, updated_at = now() where id = _pid;
    end if;
  end loop;

  update public.sales set total = _total where id = _sale_id;
  return _sale_id;
end;
$$;