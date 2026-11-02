-- ===== Customers: create / edit with items and empty cans =====
create or replace function public.save_customer(_customer_id uuid, _customer jsonb, _items jsonb, _empty jsonb default '{}'::jsonb)
returns public.customers language plpgsql security definer set search_path = public as $$
declare _c public.customers; _type public.customer_type; _custom text; _name text; _mobile text; _address text; _notes text;
  _opening int; _current int; _enotes text; _it jsonb; _iname text; _iunit text; _iprice numeric; _iid uuid;
  _p public.products; _kind public.product_kind; _idx int := 0; _row public.customer_items; _keep uuid[];
begin
  perform public.require_admin();
  _customer := coalesce(_customer, '{}'::jsonb);
  _empty := coalesce(_empty, '{}'::jsonb);
  _name := btrim(coalesce(_customer->>'name', ''));
  _mobile := regexp_replace(coalesce(_customer->>'mobile', ''), '\s', '', 'g');
  _address := btrim(coalesce(_customer->>'address', ''));
  _notes := nullif(btrim(coalesce(_customer->>'notes', '')), '');
  _enotes := nullif(btrim(coalesce(_empty->>'notes', '')), '');
  if _name = '' or length(_name) > 120 then raise exception 'Customer name is required (up to 120 characters)'; end if;
  if _mobile !~ '^\+?[0-9]{10,13}$' then raise exception 'Enter a valid 10–13 digit mobile number'; end if;
  if length(_address) < 3 or length(_address) > 500 then raise exception 'Address is required'; end if;
  begin
    _type := coalesce(nullif(_customer->>'customer_type', ''), 'HOME')::public.customer_type;
  exception when others then raise exception 'Choose a valid customer type';
  end;
  _custom := nullif(btrim(coalesce(_customer->>'custom_type', '')), '');
  if _type = 'CUSTOM' then
    if _custom is null then raise exception 'Enter a custom customer type'; end if;
    if length(_custom) > 60 then raise exception 'Custom customer type must be 60 characters or less'; end if;
  else
    _custom := null;
  end if;

  if _items is null or jsonb_typeof(_items) <> 'array' then _items := '[]'::jsonb; end if;
  if (select count(*) from jsonb_array_elements(_items)) <> (select count(distinct lower(btrim(coalesce(e->>'item_name', '')))) from jsonb_array_elements(_items) e) then
    raise exception 'Each item name can only appear once in a customer''s items list';
  end if;

  if _customer_id is null then
    begin
      _opening := coalesce(nullif(_empty->>'opening', '')::int, 0);
    exception when others then raise exception 'Opening empty cans must be a whole number';
    end;
    if _opening < 0 then raise exception 'Opening empty cans cannot be negative'; end if;
    insert into public.customers (name, mobile, address, customer_type, custom_type, notes, empty_cans_balance)
    values (_name, _mobile, _address, _type, _custom, _notes, _opening) returning * into _c;
    insert into public.customer_empty_can_txns (customer_id, txn_type, quantity, previous_balance, new_balance, performed_by, notes)
    values (_c.id, 'OPENING_BALANCE', _opening, 0, _opening, auth.uid(), coalesce(_enotes, 'Opening balance'));
  else
    select * into _c from public.customers where id = _customer_id for update;
    if not found then raise exception 'Customer not found'; end if;
    update public.customers set name = _name, mobile = _mobile, address = _address, customer_type = _type, custom_type = _custom, notes = _notes
    where id = _c.id returning * into _c;
    if nullif(_empty->>'current', '') is not null then
      begin
        _current := (_empty->>'current')::int;
      exception when others then raise exception 'Current empty cans must be a whole number';
      end;
      if _current < 0 then raise exception 'Current empty cans cannot be negative'; end if;
      if _current <> _c.empty_cans_balance then
        insert into public.customer_empty_can_txns (customer_id, txn_type, quantity, previous_balance, new_balance, performed_by, notes)
        values (_c.id, 'BALANCE_ADJUSTMENT', _current - _c.empty_cans_balance, _c.empty_cans_balance, _current, auth.uid(), coalesce(_enotes, 'Balance corrected by admin'));
        update public.customers set empty_cans_balance = _current where id = _c.id returning * into _c;
      end if;
    end if;
  end if;

  -- Items: remove the ones no longer listed, then update/insert the rest
  select coalesce(array_agg((e->>'id')::uuid), '{}') into _keep from jsonb_array_elements(_items) e where nullif(e->>'id', '') is not null;
  delete from public.customer_items where customer_id = _c.id and not (id = any(_keep));

  for _it in select * from jsonb_array_elements(_items) loop
    _idx := _idx + 1;
    _iname := btrim(coalesce(_it->>'item_name', ''));
    _iunit := btrim(coalesce(_it->>'unit', ''));
    if _iname = '' or length(_iname) > 80 then raise exception 'Item % needs a name (up to 80 characters)', _idx; end if;
    if _iunit = '' or length(_iunit) > 20 then raise exception 'Enter a unit for % (up to 20 characters)', _iname; end if;
    begin
      _iprice := (_it->>'price')::numeric;
    exception when others then _iprice := null;
    end;
    if _iprice is null or _iprice < 0 or _iprice > 1000000 then raise exception 'Enter a valid price for %', _iname; end if;
    _iprice := round(_iprice, 2);

    select * into _p from public.products where lower(btrim(name)) = lower(_iname) order by created_at limit 1;
    if not found then
      _kind := case when lower(_iunit) in ('can', 'cans') then 'FILLED_CAN'
                    when lower(_iunit) in ('packet', 'packets', 'pouch', 'sachet') then 'PACKET'
                    else 'OTHER' end;
      insert into public.products (name, unit, kind, available_quantity, min_stock_level)
      values (_iname, _iunit, _kind, 0, 0) returning * into _p;
    end if;
    if _p.kind = 'EMPTY_CAN' then raise exception '"%" is the empty-can stock item and cannot be sold. Use a different item name.', _iname; end if;

    _iid := nullif(_it->>'id', '')::uuid;
    begin
      update public.customer_items set item_name = _iname, unit = _iunit, price = _iprice, product_id = _p.id, sort_order = _idx
      where id = _iid and customer_id = _c.id returning * into _row;
      if not found then
        insert into public.customer_items (customer_id, product_id, item_name, unit, price, sort_order)
        values (_c.id, _p.id, _iname, _iunit, _iprice, _idx) returning * into _row;
      end if;
    exception when unique_violation then
      raise exception 'Each item name can only appear once in a customer''s items list';
    end;
    -- Deliveries not yet completed follow the customer's current fixed price
    update public.delivery_items di set unit_price = _iprice, product_name = _iname, unit = _iunit
    from public.delivery_tasks t
    where di.customer_item_id = _row.id and t.id = di.task_id and t.status in ('PENDING', 'ON_HOLD', 'IN_PROGRESS');
  end loop;
  return _c;
end; $$;

create or replace function public.record_empty_can_movement(_customer_id uuid, _type public.empty_can_txn_type, _quantity int, _notes text default null)
returns public.customer_empty_can_txns language plpgsql security definer set search_path = public as $$
declare _c public.customers; _delta int; _tx public.customer_empty_can_txns;
begin
  perform public.require_admin();
  if _quantity is null or _quantity = 0 then raise exception 'Quantity cannot be zero'; end if;
  select * into _c from public.customers where id = _customer_id for update;
  if not found then raise exception 'Customer not found'; end if;
  case _type
    when 'EMPTY_CANS_COLLECTED' then
      if _quantity < 0 then raise exception 'Enter collected cans as a positive number'; end if; _delta := _quantity;
    when 'EMPTY_CANS_ISSUED' then
      if _quantity < 0 then raise exception 'Enter issued cans as a positive number'; end if; _delta := -_quantity;
    when 'BALANCE_ADJUSTMENT' then
      if _notes is null or length(btrim(_notes)) < 3 then raise exception 'Please add a note explaining this correction'; end if;
      _delta := _quantity;
    else raise exception 'The opening balance is set when the customer is created';
  end case;
  if _c.empty_cans_balance + _delta < 0 then
    raise exception 'Empty-can balance cannot go below zero (current balance %)', _c.empty_cans_balance;
  end if;
  insert into public.customer_empty_can_txns (customer_id, txn_type, quantity, previous_balance, new_balance, performed_by, notes)
  values (_c.id, _type, _delta, _c.empty_cans_balance, _c.empty_cans_balance + _delta, auth.uid(), nullif(btrim(_notes), ''))
  returning * into _tx;
  update public.customers set empty_cans_balance = _tx.new_balance where id = _c.id;
  return _tx;
end; $$;

-- ===== Tasks now use the customer's items list and prices =====
create or replace function public.create_delivery_task(
  _customer_id uuid, _employee_id uuid, _priority int, _items jsonb,
  _scheduled_date date default null, _notes text default null)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _c public.customers; _e public.employees; _t public.delivery_tasks; _it jsonb; _p public.products; _qty int; _ci public.customer_items;
begin
  perform public.require_admin();
  select * into _c from public.customers where id = _customer_id;
  if not found then raise exception 'Customer not found'; end if;
  if _c.status <> 'ACTIVE' then raise exception 'Customer % is inactive', _c.customer_code; end if;
  select * into _e from public.employees where id = _employee_id;
  if not found then raise exception 'Employee not found'; end if;
  if _e.status <> 'ACTIVE' then raise exception 'Employee % is inactive', _e.employee_code; end if;
  if _priority is null or _priority < 1 or _priority > 10 then raise exception 'Priority must be between 1 and 10'; end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then
    raise exception 'Add at least one item';
  end if;

  insert into public.delivery_tasks (customer_id, employee_id, customer_code, customer_name, customer_phone, delivery_address, priority, scheduled_date, notes, created_by)
  values (_c.id, _e.id, _c.customer_code, _c.name, _c.mobile, _c.address, _priority, _scheduled_date, nullif(btrim(_notes), ''), auth.uid())
  returning * into _t;

  for _it in select * from jsonb_array_elements(_items) loop
    _qty := (_it->>'quantity')::int;
    if _qty is null or _qty <= 0 then raise exception 'Quantities must be positive whole numbers'; end if;
    if nullif(_it->>'customer_item_id', '') is not null then
      select * into _ci from public.customer_items where id = (_it->>'customer_item_id')::uuid and customer_id = _c.id;
    else
      select * into _ci from public.customer_items where product_id = (_it->>'product_id')::uuid and customer_id = _c.id;
    end if;
    if not found then raise exception 'This item is not in the customer''s items list. Add it with a price first.'; end if;
    select * into _p from public.products where id = _ci.product_id;
    if not found or not _p.is_active then raise exception '% is not available in inventory', _ci.item_name; end if;
    if _p.kind = 'EMPTY_CAN' then raise exception 'Empty cans cannot be delivered; record them as returns'; end if;
    begin
      insert into public.delivery_items (task_id, product_id, product_name, product_kind, unit, requested_qty, unit_price, customer_item_id)
      values (_t.id, _p.id, _ci.item_name, _p.kind, _ci.unit, _qty, _ci.price, _ci.id);
    exception when unique_violation then
      raise exception 'Each item can only be added once per task';
    end;
  end loop;

  perform public.log_task(_t.id, null, 'PENDING', 'Task created');
  return _t;
end; $$;

-- ===== Payment allocation helper (internal) =====
create or replace function public.allocate_oldest_first(_payment_id uuid, _customer_id uuid, _amount numeric, _exclude_bill uuid default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare _remaining numeric(12,2) := round(coalesce(_amount, 0), 2); _ob record; _take numeric(12,2); _done numeric(12,2) := 0;
begin
  if _remaining <= 0 then return 0; end if;
  for _ob in
    select bill_id, outstanding from public.bill_balances
    where customer_id = _customer_id and outstanding > 0 and (_exclude_bill is null or bill_id <> _exclude_bill)
    order by bill_date, bill_code
  loop
    exit when _remaining <= 0;
    _take := least(_remaining, _ob.outstanding);
    insert into public.payment_allocations (payment_id, bill_id, amount, created_by) values (_payment_id, _ob.bill_id, _take, auth.uid());
    _remaining := _remaining - _take;
    _done := _done + _take;
  end loop;
  return _done;
end; $$;

-- ===== Employee: billing context for an assigned delivery =====
create or replace function public.delivery_billing_context(_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _t public.delivery_tasks; _c public.customers;
begin
  select * into _t from public.delivery_tasks where id = _task_id;
  if not found then raise exception 'Task not found'; end if;
  if not (public.has_role(auth.uid(), 'admin') or _t.employee_id = public.current_employee_id()) then
    raise exception 'This task is not assigned to you' using errcode = '42501';
  end if;
  select * into _c from public.customers where id = _t.customer_id;
  return jsonb_build_object(
    'empty_cans_balance', _c.empty_cans_balance,
    'previous_outstanding', coalesce((select sum(outstanding) from public.bill_balances where customer_id = _c.id and outstanding > 0 and task_id <> _task_id), 0),
    'open_bills', (select count(*) from public.bill_balances where customer_id = _c.id and outstanding > 0 and task_id <> _task_id)
  );
end; $$;

-- ===== Employee: complete delivery with bill, payment and empty cans =====
drop function if exists public.complete_delivery(uuid, jsonb, int, text);
create or replace function public.complete_delivery(_task_id uuid, _items jsonb, _empty_cans_returned int default 0, _notes text default null, _payment jsonb default null)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _emp uuid := public.current_employee_id(); _t public.delivery_tasks; _perm public.employee_permissions;
  _it public.delivery_items; _qty int; _total int := 0; _p public.products; _empty public.products; _provided int;
  _bill_total numeric(12,2) := 0; _line numeric(12,2); _bill public.bills; _c public.customers;
  _status text; _now_amt numeric(12,2); _dues_amt numeric(12,2); _prev_out numeric(12,2); _method public.payment_method;
  _computed text; _pay public.payments;
begin
  if _emp is null then raise exception 'Not authorized: active employee account required' using errcode = '42501'; end if;
  select * into _perm from public.employee_permissions where employee_id = _emp;
  if not coalesce(_perm.can_complete_delivery, false) then raise exception 'You do not have permission to complete deliveries' using errcode = '42501'; end if;
  select * into _t from public.delivery_tasks where id = _task_id for update;
  if not found or _t.employee_id <> _emp then raise exception 'This task is not assigned to you' using errcode = '42501'; end if;
  if _t.status = 'DELIVERED' then raise exception 'This delivery is already completed'; end if;
  if _t.status <> 'IN_PROGRESS' then raise exception 'Only an in-progress delivery can be completed'; end if;
  if _empty_cans_returned is null or _empty_cans_returned < 0 then raise exception 'Empty cans collected cannot be negative'; end if;
  if _items is null or jsonb_typeof(_items) <> 'array' then raise exception 'Delivered quantities are required'; end if;

  _payment := coalesce(_payment, '{}'::jsonb);
  begin
    _now_amt := round(coalesce(nullif(_payment->>'amount_paid', ''), '0')::numeric, 2);
    _dues_amt := round(coalesce(nullif(_payment->>'old_dues_paid', ''), '0')::numeric, 2);
  exception when others then raise exception 'Enter valid payment amounts';
  end;
  if _now_amt < 0 or _dues_amt < 0 then raise exception 'Payment amounts cannot be negative'; end if;
  _status := nullif(_payment->>'payment_status', '');
  if _now_amt + _dues_amt > 0 then
    begin
      _method := coalesce(nullif(_payment->>'method', ''), 'CASH')::public.payment_method;
    exception when others then raise exception 'Choose a valid payment method';
    end;
  end if;

  select count(*) into _provided from jsonb_array_elements(_items) e
    where exists (select 1 from public.delivery_items di where di.task_id = _task_id and di.id = (e->>'item_id')::uuid);
  if _provided <> (select count(*) from public.delivery_items where task_id = _task_id) or _provided <> jsonb_array_length(_items) then
    raise exception 'Enter a delivered quantity for every item in this task';
  end if;

  for _it in select * from public.delivery_items where task_id = _task_id order by product_name loop
    select (e->>'delivered_qty')::int into _qty from jsonb_array_elements(_items) e where (e->>'item_id')::uuid = _it.id;
    if _qty is null or _qty < 0 then raise exception 'Delivered quantity for % must be zero or more', _it.product_name; end if;
    if _qty > _it.requested_qty then raise exception 'Delivered % (%) exceeds the requested %', _it.product_name, _qty, _it.requested_qty; end if;
    _line := round(_qty * _it.unit_price, 2);
    update public.delivery_items set delivered_qty = _qty, line_total = _line where id = _it.id;
    _bill_total := _bill_total + _line;
    if _qty > 0 then
      select * into _p from public.products where id = _it.product_id for update;
      if _p.available_quantity < _qty then
        raise exception 'Not enough % in stock (available %, delivering %)', _p.name, _p.available_quantity, _qty;
      end if;
      update public.products set available_quantity = available_quantity - _qty where id = _p.id;
      insert into public.inventory_transactions (product_id, txn_type, quantity, previous_stock, new_stock, task_id, performed_by, notes)
      values (_p.id, 'DELIVERY', -_qty, _p.available_quantity, _p.available_quantity - _qty, _task_id, auth.uid(), 'Delivered on ' || _t.task_code);
    end if;
    _total := _total + _qty;
  end loop;

  if _total = 0 then raise exception 'Nothing was delivered. Use "Report failed" instead.'; end if;

  -- Inventory: returned empties go back into empty-can stock (existing rule)
  if _empty_cans_returned > 0 then
    select * into _empty from public.products where kind = 'EMPTY_CAN' and is_active order by created_at limit 1 for update;
    if not found then raise exception 'No empty-can product is set up in inventory'; end if;
    update public.products set available_quantity = available_quantity + _empty_cans_returned where id = _empty.id;
    insert into public.inventory_transactions (product_id, txn_type, quantity, previous_stock, new_stock, task_id, performed_by, notes)
    values (_empty.id, 'EMPTY_CAN_RETURN', _empty_cans_returned, _empty.available_quantity, _empty.available_quantity + _empty_cans_returned, _task_id, auth.uid(), 'Returned on ' || _t.task_code);
  end if;

  -- Customer empty-can ledger
  select * into _c from public.customers where id = _t.customer_id for update;
  if _empty_cans_returned > 0 then
    insert into public.customer_empty_can_txns (customer_id, txn_type, quantity, previous_balance, new_balance, task_id, employee_id, performed_by, notes)
    values (_c.id, 'EMPTY_CANS_COLLECTED', _empty_cans_returned, _c.empty_cans_balance, _c.empty_cans_balance + _empty_cans_returned, _task_id, _emp, auth.uid(), 'Collected on ' || _t.task_code);
    update public.customers set empty_cans_balance = empty_cans_balance + _empty_cans_returned where id = _c.id;
  end if;

  -- Bill and payment
  select coalesce(sum(outstanding), 0) into _prev_out from public.bill_balances where customer_id = _c.id and outstanding > 0;
  if _now_amt > _bill_total then
    raise exception 'Amount paid now (₹%) cannot be more than this delivery''s bill (₹%)', _now_amt, _bill_total;
  end if;
  if _dues_amt > _prev_out then
    raise exception 'Old dues paid (₹%) cannot be more than the previous pending amount (₹%)', _dues_amt, _prev_out;
  end if;
  _computed := case when _bill_total - _now_amt <= 0 then 'PAID' when _now_amt > 0 then 'PARTIALLY_PAID' else 'UNPAID' end;
  if _status is not null and _status <> _computed then
    raise exception 'Payment status does not match the amount collected (it should be %)', replace(_computed, '_', ' ');
  end if;

  insert into public.bills (customer_id, task_id, total_amount, created_by)
  values (_c.id, _task_id, _bill_total, auth.uid()) returning * into _bill;

  if _now_amt + _dues_amt > 0 then
    insert into public.payments (customer_id, task_id, amount, method, reference_no, notes, collected_by, employee_id)
    values (_c.id, _task_id, _now_amt + _dues_amt, _method, nullif(btrim(coalesce(_payment->>'reference_no', '')), ''),
      nullif(btrim(coalesce(_payment->>'notes', '')), ''), auth.uid(), _emp)
    returning * into _pay;
    if _now_amt > 0 then
      insert into public.payment_allocations (payment_id, bill_id, amount, created_by) values (_pay.id, _bill.id, _now_amt, auth.uid());
    end if;
    if _dues_amt > 0 then
      perform public.allocate_oldest_first(_pay.id, _c.id, _dues_amt, _bill.id);
    end if;
  end if;

  update public.delivery_tasks set status = 'DELIVERED', completed_at = now(),
    duration_seconds = extract(epoch from now() - started_at)::int,
    empty_cans_returned = _empty_cans_returned, completion_notes = nullif(btrim(_notes), '')
  where id = _task_id returning * into _t;
  perform public.log_task(_task_id, 'IN_PROGRESS', 'DELIVERED',
    concat_ws(' · ', nullif(btrim(_notes), ''), 'Bill ₹' || _bill_total, case when _now_amt + _dues_amt > 0 then 'Collected ₹' || (_now_amt + _dues_amt) end));
  return _t;
end; $$;

-- ===== Admin: payments =====
create or replace function public.record_customer_payment(
  _customer_id uuid, _amount numeric, _method public.payment_method, _mode text,
  _bill_id uuid default null, _reference text default null, _notes text default null, _paid_at timestamptz default null)
returns public.payments language plpgsql security definer set search_path = public as $$
declare _c public.customers; _pay public.payments; _amt numeric(12,2); _bb record;
begin
  perform public.require_admin();
  _amt := round(coalesce(_amount, 0), 2);
  if _amt <= 0 then raise exception 'Payment amount must be more than zero'; end if;
  if _amt > 10000000 then raise exception 'Payment amount is too large'; end if;
  if _method is null then raise exception 'Choose a payment method'; end if;
  if _paid_at is not null and _paid_at > now() + interval '1 day' then raise exception 'Payment date cannot be in the future'; end if;
  if _mode not in ('BILL', 'OLDEST', 'CREDIT') then raise exception 'Choose how to apply this payment'; end if;
  select * into _c from public.customers where id = _customer_id for update;
  if not found then raise exception 'Customer not found'; end if;
  if _mode = 'BILL' then
    select * into _bb from public.bill_balances where bill_id = _bill_id and customer_id = _c.id;
    if not found then raise exception 'Choose a bill for this customer'; end if;
    if _bb.outstanding <= 0 then raise exception 'This bill is already fully paid'; end if;
  end if;
  insert into public.payments (customer_id, amount, method, reference_no, notes, paid_at, collected_by)
  values (_c.id, _amt, _method, nullif(btrim(coalesce(_reference, '')), ''), nullif(btrim(coalesce(_notes, '')), ''), coalesce(_paid_at, now()), auth.uid())
  returning * into _pay;
  if _mode = 'BILL' then
    insert into public.payment_allocations (payment_id, bill_id, amount, created_by) values (_pay.id, _bb.bill_id, least(_amt, _bb.outstanding), auth.uid());
  elsif _mode = 'OLDEST' then
    perform public.allocate_oldest_first(_pay.id, _c.id, _amt, null);
  end if;
  return _pay;
end; $$;

create or replace function public.apply_customer_credit(_customer_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare _c public.customers; _pb record; _done numeric(12,2) := 0;
begin
  perform public.require_admin();
  select * into _c from public.customers where id = _customer_id for update;
  if not found then raise exception 'Customer not found'; end if;
  for _pb in select payment_id, unapplied from public.payment_balances
    where customer_id = _c.id and amount > 0 and not is_reversed and unapplied > 0 order by paid_at, payment_code
  loop
    _done := _done + public.allocate_oldest_first(_pb.payment_id, _c.id, _pb.unapplied, null);
  end loop;
  if _done = 0 then raise exception 'There is no unapplied credit or no pending bill to apply it to'; end if;
  return _done;
end; $$;

create or replace function public.reverse_payment(_payment_id uuid, _reason text)
returns public.payments language plpgsql security definer set search_path = public as $$
declare _p public.payments; _r public.payments; _a record;
begin
  perform public.require_admin();
  if _reason is null or length(btrim(_reason)) < 3 then raise exception 'Please give a reason for the reversal'; end if;
  select * into _p from public.payments where id = _payment_id;
  if not found then raise exception 'Payment not found'; end if;
  perform 1 from public.customers where id = _p.customer_id for update;
  if _p.amount <= 0 then raise exception 'A reversal cannot be reversed'; end if;
  if exists (select 1 from public.payments where reverses_payment_id = _p.id) then raise exception 'This payment is already reversed'; end if;
  insert into public.payments (customer_id, task_id, amount, method, reference_no, notes, collected_by, employee_id, reverses_payment_id)
  values (_p.customer_id, _p.task_id, -_p.amount, _p.method, _p.reference_no, 'Reversal of ' || _p.payment_code || ': ' || btrim(_reason), auth.uid(), null, _p.id)
  returning * into _r;
  for _a in select bill_id, sum(amount) as amt from public.payment_allocations where payment_id = _p.id group by bill_id having sum(amount) <> 0 loop
    insert into public.payment_allocations (payment_id, bill_id, amount, created_by) values (_r.id, _a.bill_id, -_a.amt, auth.uid());
  end loop;
  return _r;
end; $$;

-- ===== Reports =====
create or replace function public.customer_report(_from date, _to date, _customer_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _tz text := public.business_tz(); _r jsonb;
begin
  perform public.require_admin();
  if _from is null or _to is null or _from > _to then raise exception 'Choose a valid date range'; end if;
  with t as (
    select * from public.delivery_tasks where status = 'DELIVERED' and (completed_at at time zone _tz)::date between _from and _to
      and (_customer_id is null or customer_id = _customer_id)
  ), items as (
    select t.customer_id, di.product_name, sum(coalesce(di.delivered_qty, 0))::int as qty,
      sum(coalesce(di.delivered_qty, 0)) filter (where di.product_kind = 'FILLED_CAN')::int as cans,
      sum(coalesce(di.delivered_qty, 0)) filter (where di.product_kind = 'PACKET')::int as packets
    from t join public.delivery_items di on di.task_id = t.id group by t.customer_id, di.product_name
  ), bb as (
    select customer_id, sum(total_amount) as billed from public.bill_balances where (bill_date at time zone _tz)::date between _from and _to group by customer_id
  ), pr as (
    select customer_id, sum(amount) as received from public.payments where (paid_at at time zone _tz)::date between _from and _to group by customer_id
  ), ec as (
    select customer_id, sum(quantity) filter (where txn_type = 'EMPTY_CANS_COLLECTED') as collected,
      -sum(quantity) filter (where txn_type = 'EMPTY_CANS_ISSUED') as issued
    from public.customer_empty_can_txns where (created_at at time zone _tz)::date between _from and _to group by customer_id
  )
  select coalesce(jsonb_agg(x order by x->>'code'), '[]'::jsonb) into _r from (
    select jsonb_build_object(
      'id', c.id, 'code', c.customer_code, 'name', c.name, 'mobile', c.mobile, 'type', c.customer_type, 'custom_type', c.custom_type,
      'address', c.address, 'status', c.status, 'joined_at', c.joined_at, 'notes', c.notes,
      'deliveries', (select count(*) from t where t.customer_id = c.id),
      'delivery_days', (select count(distinct (t.completed_at at time zone _tz)::date) from t where t.customer_id = c.id),
      'items', coalesce((select jsonb_object_agg(i.product_name, i.qty) from items i where i.customer_id = c.id), '{}'::jsonb),
      'cans', coalesce((select sum(i.cans) from items i where i.customer_id = c.id), 0),
      'packets', coalesce((select sum(i.packets) from items i where i.customer_id = c.id), 0),
      'billed', coalesce(bb.billed, 0),
      'received', coalesce(pr.received, 0),
      'outstanding', cb.outstanding,
      'total_billed_all', cb.total_billed,
      'total_received_all', cb.total_received,
      'unapplied_credit', cb.unapplied_credit,
      'unpaid_bills', cb.unpaid_bills,
      'partial_bills', cb.partial_bills,
      'last_payment_at', cb.last_payment_at,
      'empty_balance', c.empty_cans_balance,
      'empty_collected', coalesce(ec.collected, 0),
      'empty_issued', coalesce(ec.issued, 0),
      'last_delivery_at', (select max(d.completed_at) from public.delivery_tasks d where d.customer_id = c.id and d.status = 'DELIVERED')
    ) as x
    from public.customers c
    join public.customer_balances cb on cb.customer_id = c.id
    left join bb on bb.customer_id = c.id
    left join pr on pr.customer_id = c.id
    left join ec on ec.customer_id = c.id
    where _customer_id is null or c.id = _customer_id
  ) s;
  return _r;
end; $$;

create or replace function public.employee_report(_from date, _to date, _employee_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _tz text := public.business_tz(); _r jsonb;
begin
  perform public.require_admin();
  if _from is null or _to is null or _from > _to then raise exception 'Choose a valid date range'; end if;
  with t as (
    select * from public.delivery_tasks
    where coalesce((completed_at at time zone _tz)::date, scheduled_date, (created_at at time zone _tz)::date) between _from and _to
      and (_employee_id is null or employee_id = _employee_id)
  ), items as (
    select t.employee_id, di.product_name, sum(coalesce(di.delivered_qty, 0))::int as qty
    from t join public.delivery_items di on di.task_id = t.id where t.status = 'DELIVERED' group by t.employee_id, di.product_name
  ), pay as (
    select employee_id, sum(amount) as amt from public.payments
    where employee_id is not null and (paid_at at time zone _tz)::date between _from and _to group by employee_id
  )
  select coalesce(jsonb_agg(x order by x->>'code'), '[]'::jsonb) into _r from (
    select jsonb_build_object(
      'id', e.id, 'code', e.employee_code, 'name', e.name, 'mobile', e.mobile, 'status', e.status,
      'assigned', (select count(*) from t where t.employee_id = e.id),
      'delivered', (select count(*) from t where t.employee_id = e.id and t.status = 'DELIVERED'),
      'pending', (select count(*) from t where t.employee_id = e.id and t.status in ('PENDING', 'ON_HOLD')),
      'in_progress', (select count(*) from t where t.employee_id = e.id and t.status = 'IN_PROGRESS'),
      'failed', (select count(*) from t where t.employee_id = e.id and t.status = 'FAILED'),
      'cancelled', (select count(*) from t where t.employee_id = e.id and t.status = 'CANCELLED'),
      'items', coalesce((select jsonb_object_agg(i.product_name, i.qty) from items i where i.employee_id = e.id), '{}'::jsonb),
      'total_items', coalesce((select sum(i.qty) from items i where i.employee_id = e.id), 0),
      'empty_collected', coalesce((select sum(t.empty_cans_returned) from t where t.employee_id = e.id and t.status = 'DELIVERED'), 0),
      'amount_collected', coalesce(pay.amt, 0),
      'avg_duration_seconds', (select round(avg(t.duration_seconds)) from t where t.employee_id = e.id and t.status = 'DELIVERED'),
      'total_duration_seconds', coalesce((select sum(t.duration_seconds) from t where t.employee_id = e.id and t.status = 'DELIVERED'), 0)
    ) as x
    from public.employees e left join pay on pay.employee_id = e.id
    where (_employee_id is null or e.id = _employee_id)
      and (e.status = 'ACTIVE' or exists (select 1 from t where t.employee_id = e.id))
  ) s;
  return _r;
end; $$;

create or replace function public.inventory_report(_from date, _to date, _product_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _tz text := public.business_tz(); _r jsonb;
begin
  perform public.require_admin();
  if _from is null or _to is null or _from > _to then raise exception 'Choose a valid date range'; end if;
  with tx as (
    select it.*, (it.created_at at time zone _tz)::date as d from public.inventory_transactions it
    where _product_id is null or it.product_id = _product_id
  ), agg as (
    select p.id, p.product_code, p.name, p.unit, p.kind, p.available_quantity, p.min_stock_level, p.is_active,
      greatest(p.updated_at, (select max(created_at) from tx where tx.product_id = p.id)) as last_updated,
      coalesce((select sum(quantity) from tx where tx.product_id = p.id and tx.d < _from), 0)
        + coalesce((select sum(quantity) from tx where tx.product_id = p.id and tx.d between _from and _to and tx.txn_type = 'OPENING_STOCK'), 0) as opening,
      coalesce((select sum(quantity) from tx where tx.product_id = p.id and tx.d between _from and _to and tx.txn_type = 'STOCK_ADDED'), 0) as added,
      coalesce((select sum(quantity) from tx where tx.product_id = p.id and tx.d between _from and _to and tx.txn_type = 'EMPTY_CAN_RETURN'), 0) as returned,
      coalesce((select -sum(quantity) from tx where tx.product_id = p.id and tx.d between _from and _to and tx.txn_type = 'DELIVERY'), 0) as delivered,
      coalesce((select -sum(quantity) from tx where tx.product_id = p.id and tx.d between _from and _to and tx.txn_type = 'DAMAGE'), 0) as damaged,
      coalesce((select sum(quantity) from tx where tx.product_id = p.id and tx.d between _from and _to and tx.txn_type in ('ADJUSTMENT', 'CORRECTION')), 0) as adjustments
    from public.products p where _product_id is null or p.id = _product_id
  )
  select jsonb_build_object(
    'products', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'code', product_code, 'name', name, 'unit', unit, 'kind', kind, 'active', is_active,
        'opening', opening, 'added', added, 'returned', returned, 'delivered', delivered, 'damaged', damaged, 'adjustments', adjustments,
        'closing', opening + added + returned - delivered - damaged + adjustments,
        'current', available_quantity, 'min', min_stock_level,
        'low', kind <> 'EMPTY_CAN' and available_quantity <= min_stock_level,
        'last_updated', last_updated) order by name) from agg), '[]'::jsonb),
    'movements', coalesce((select jsonb_agg(jsonb_build_object(
        'code', tx.txn_code, 'date', tx.created_at, 'product_code', p.product_code, 'product', p.name, 'unit', p.unit,
        'type', tx.txn_type, 'quantity', tx.quantity, 'previous', tx.previous_stock, 'new', tx.new_stock,
        'task_code', t.task_code, 'notes', tx.notes) order by tx.created_at)
      from tx join public.products p on p.id = tx.product_id left join public.delivery_tasks t on t.id = tx.task_id
      where tx.d between _from and _to), '[]'::jsonb)
  ) into _r;
  return _r;
end; $$;

create or replace function public.delivery_history_rows(_from date, _to date, _customer_id uuid default null, _employee_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _tz text := public.business_tz(); _r jsonb;
begin
  perform public.require_admin();
  if _from is null or _to is null or _from > _to then raise exception 'Choose a valid date range'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'task_code', t.task_code, 'date', coalesce(t.completed_at, t.created_at),
      'customer_code', t.customer_code, 'customer_name', t.customer_name,
      'employee_code', e.employee_code, 'employee_name', e.name,
      'product', di.product_name, 'unit', di.unit, 'requested', di.requested_qty, 'delivered', di.delivered_qty,
      'unit_price', di.unit_price, 'line_total', di.line_total,
      'bill_code', bb.bill_code, 'bill_total', bb.total_amount, 'paid', bb.amount_paid, 'pending', bb.outstanding, 'payment_status', bb.payment_status,
      'empty_cans', t.empty_cans_returned, 'started_at', t.started_at, 'completed_at', t.completed_at,
      'duration_seconds', t.duration_seconds, 'status', t.status)
      order by coalesce(t.completed_at, t.created_at), t.task_code, di.product_name), '[]'::jsonb) into _r
  from public.delivery_tasks t
  join public.employees e on e.id = t.employee_id
  join public.delivery_items di on di.task_id = t.id
  left join public.bill_balances bb on bb.task_id = t.id
  where coalesce((t.completed_at at time zone _tz)::date, t.scheduled_date, (t.created_at at time zone _tz)::date) between _from and _to
    and (_customer_id is null or t.customer_id = _customer_id)
    and (_employee_id is null or t.employee_id = _employee_id);
  return _r;
end; $$;

create or replace function public.payment_history_rows(_from date, _to date, _customer_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _tz text := public.business_tz(); _r jsonb;
begin
  perform public.require_admin();
  if _from is null or _to is null or _from > _to then raise exception 'Choose a valid date range'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'payment_code', p.payment_code, 'customer_code', c.customer_code, 'customer_name', c.name,
      'bill_code', b.bill_code, 'paid_at', p.paid_at, 'amount', p.amount, 'method', p.method,
      'allocated', a.amount, 'bill_remaining', bb.outstanding, 'unapplied', pb.unapplied,
      'collected_by', coalesce(e.name, 'Admin'), 'reference_no', p.reference_no, 'notes', p.notes,
      'reversal_of', rp.payment_code, 'is_reversed', pb.is_reversed)
      order by p.paid_at, p.payment_code, b.bill_code), '[]'::jsonb) into _r
  from public.payments p
  join public.customers c on c.id = p.customer_id
  join public.payment_balances pb on pb.payment_id = p.id
  left join public.payment_allocations a on a.payment_id = p.id
  left join public.bills b on b.id = a.bill_id
  left join public.bill_balances bb on bb.bill_id = a.bill_id
  left join public.employees e on e.id = p.employee_id
  left join public.payments rp on rp.id = p.reverses_payment_id
  where (p.paid_at at time zone _tz)::date between _from and _to
    and (_customer_id is null or p.customer_id = _customer_id);
  return _r;
end; $$;

create or replace function public.empty_can_history_rows(_from date, _to date, _customer_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _tz text := public.business_tz(); _r jsonb;
begin
  perform public.require_admin();
  if _from is null or _to is null or _from > _to then raise exception 'Choose a valid date range'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', x.txn_code, 'date', x.created_at, 'customer_code', c.customer_code, 'customer_name', c.name,
      'type', x.txn_type, 'quantity', x.quantity, 'previous', x.previous_balance, 'new', x.new_balance,
      'task_code', t.task_code, 'employee_name', e.name, 'notes', x.notes) order by x.created_at, x.txn_code), '[]'::jsonb) into _r
  from public.customer_empty_can_txns x
  join public.customers c on c.id = x.customer_id
  left join public.delivery_tasks t on t.id = x.task_id
  left join public.employees e on e.id = x.employee_id
  where (x.created_at at time zone _tz)::date between _from and _to
    and (_customer_id is null or x.customer_id = _customer_id);
  return _r;
end; $$;

-- ===== Function privileges =====
revoke execute on all functions in schema public from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.business_tz() to authenticated;
grant execute on function public.admin_exists() to anon, authenticated;
grant execute on function public.save_customer(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.record_empty_can_movement(uuid, public.empty_can_txn_type, int, text) to authenticated;
grant execute on function public.create_delivery_task(uuid, uuid, int, jsonb, date, text) to authenticated;
grant execute on function public.delivery_billing_context(uuid) to authenticated;
grant execute on function public.complete_delivery(uuid, jsonb, int, text, jsonb) to authenticated;
grant execute on function public.record_customer_payment(uuid, numeric, public.payment_method, text, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.apply_customer_credit(uuid) to authenticated;
grant execute on function public.reverse_payment(uuid, text) to authenticated;
grant execute on function public.customer_report(date, date, uuid) to authenticated;
grant execute on function public.employee_report(date, date, uuid) to authenticated;
grant execute on function public.inventory_report(date, date, uuid) to authenticated;
grant execute on function public.delivery_history_rows(date, date, uuid, uuid) to authenticated;
grant execute on function public.payment_history_rows(date, date, uuid) to authenticated;
grant execute on function public.empty_can_history_rows(date, date, uuid) to authenticated;
revoke execute on function public.allocate_oldest_first(uuid, uuid, numeric, uuid) from authenticated;
grant execute on all functions in schema public to service_role;