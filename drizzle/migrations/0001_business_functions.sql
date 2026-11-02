
-- ===== Helpers =====
create or replace function public.require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Not authorized: administrator access required' using errcode = '42501';
  end if;
end; $$;

create or replace function public.log_task(_task uuid, _from public.task_status, _to public.task_status, _note text)
returns void language sql security definer set search_path = public as $$
  insert into public.delivery_logs (task_id, from_status, to_status, actor_id, note) values (_task, _from, _to, auth.uid(), _note);
$$;

create or replace function public.admin_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role = 'admin')
$$;

create or replace function public.bootstrap_first_admin(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('bootstrap_first_admin'));
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'An administrator already exists';
  end if;
  insert into public.user_roles (user_id, role) values (_user_id, 'admin');
end; $$;

-- Next eligible task for an employee: lowest priority number, then oldest
create or replace function public.next_eligible_task_id(_employee uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select t.id from public.delivery_tasks t
  where t.employee_id = _employee and t.status = 'PENDING'
    and (t.scheduled_date is null or t.scheduled_date <= (now() at time zone public.business_tz())::date)
  order by t.priority asc, t.scheduled_date asc nulls first, t.created_at asc, t.task_code asc
  limit 1
$$;

create or replace function public.my_next_task_id()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare _emp uuid := public.current_employee_id();
begin
  if _emp is null then return null; end if;
  if exists (select 1 from public.delivery_tasks where employee_id = _emp and status = 'IN_PROGRESS') then return null; end if;
  return public.next_eligible_task_id(_emp);
end; $$;

-- ===== Admin: tasks =====
create or replace function public.create_delivery_task(
  _customer_id uuid, _employee_id uuid, _priority int, _items jsonb,
  _scheduled_date date default null, _notes text default null)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _c public.customers; _e public.employees; _t public.delivery_tasks; _it jsonb; _p public.products; _qty int; _price numeric;
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
    raise exception 'Add at least one product';
  end if;

  insert into public.delivery_tasks (customer_id, employee_id, customer_code, customer_name, customer_phone, delivery_address, priority, scheduled_date, notes, created_by)
  values (_c.id, _e.id, _c.customer_code, _c.name, _c.mobile, _c.address, _priority, _scheduled_date, nullif(btrim(_notes), ''), auth.uid())
  returning * into _t;

  for _it in select * from jsonb_array_elements(_items) loop
    _qty := (_it->>'quantity')::int;
    if _qty is null or _qty <= 0 then raise exception 'Quantities must be positive whole numbers'; end if;
    select * into _p from public.products where id = (_it->>'product_id')::uuid;
    if not found or not _p.is_active then raise exception 'Product is not available'; end if;
    if _p.kind = 'EMPTY_CAN' then raise exception 'Empty cans cannot be delivered; record them as returns'; end if;
    _price := case _p.kind when 'FILLED_CAN' then _c.price_per_can when 'PACKET' then _c.price_per_packet else 0 end;
    begin
      insert into public.delivery_items (task_id, product_id, product_name, product_kind, unit, requested_qty, unit_price)
      values (_t.id, _p.id, _p.name, _p.kind, _p.unit, _qty, _price);
    exception when unique_violation then
      raise exception 'Each product can only be added once per task';
    end;
  end loop;

  perform public.log_task(_t.id, null, 'PENDING', 'Task created');
  return _t;
end; $$;

create or replace function public.cancel_delivery_task(_task_id uuid, _reason text)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _t public.delivery_tasks; _old public.task_status;
begin
  perform public.require_admin();
  if _reason is null or length(btrim(_reason)) < 3 then raise exception 'Please give a reason for cancelling'; end if;
  select * into _t from public.delivery_tasks where id = _task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if _t.status not in ('PENDING', 'ON_HOLD', 'IN_PROGRESS') then raise exception 'Only pending, on-hold or in-progress tasks can be cancelled'; end if;
  _old := _t.status;
  update public.delivery_tasks set status = 'CANCELLED', completed_at = now(),
    duration_seconds = case when started_at is not null then extract(epoch from now() - started_at)::int end,
    failure_reason = btrim(_reason)
  where id = _task_id returning * into _t;
  perform public.log_task(_task_id, _old, 'CANCELLED', btrim(_reason));
  return _t;
end; $$;

create or replace function public.reassign_delivery_task(_task_id uuid, _employee_id uuid, _priority int default null)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _t public.delivery_tasks; _e public.employees; _old public.task_status;
begin
  perform public.require_admin();
  select * into _e from public.employees where id = _employee_id;
  if not found or _e.status <> 'ACTIVE' then raise exception 'Choose an active employee'; end if;
  if _priority is not null and (_priority < 1 or _priority > 10) then raise exception 'Priority must be between 1 and 10'; end if;
  select * into _t from public.delivery_tasks where id = _task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if _t.status not in ('PENDING', 'ON_HOLD', 'FAILED') then raise exception 'Only pending, on-hold or failed tasks can be reassigned'; end if;
  _old := _t.status;
  update public.delivery_tasks set employee_id = _employee_id, status = 'PENDING', priority = coalesce(_priority, priority),
    started_at = null, completed_at = null, duration_seconds = null, hold_reason = null,
    failure_reason = case when _old = 'FAILED' then null else failure_reason end
  where id = _task_id returning * into _t;
  perform public.log_task(_task_id, _old, 'PENDING', 'Assigned to ' || _e.name || ' (' || _e.employee_code || ')');
  return _t;
end; $$;

create or replace function public.set_task_priority(_task_id uuid, _priority int)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _t public.delivery_tasks;
begin
  perform public.require_admin();
  if _priority is null or _priority < 1 or _priority > 10 then raise exception 'Priority must be between 1 and 10'; end if;
  select * into _t from public.delivery_tasks where id = _task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if _t.status not in ('PENDING', 'ON_HOLD') then raise exception 'Priority can only change before delivery starts'; end if;
  update public.delivery_tasks set priority = _priority where id = _task_id returning * into _t;
  perform public.log_task(_task_id, _t.status, _t.status, 'Priority set to ' || _priority);
  return _t;
end; $$;

create or replace function public.resume_delivery_task(_task_id uuid)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _t public.delivery_tasks;
begin
  perform public.require_admin();
  select * into _t from public.delivery_tasks where id = _task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if _t.status <> 'ON_HOLD' then raise exception 'Only on-hold tasks can be resumed'; end if;
  update public.delivery_tasks set status = 'PENDING', hold_reason = null where id = _task_id returning * into _t;
  perform public.log_task(_task_id, 'ON_HOLD', 'PENDING', 'Returned to queue');
  return _t;
end; $$;

-- ===== Employee: delivery workflow =====
create or replace function public.start_delivery(_task_id uuid)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _emp uuid := public.current_employee_id(); _t public.delivery_tasks; _next uuid; _perm public.employee_permissions;
begin
  if _emp is null then raise exception 'Not authorized: active employee account required' using errcode = '42501'; end if;
  select * into _perm from public.employee_permissions where employee_id = _emp;
  if not coalesce(_perm.can_start_delivery, false) then raise exception 'You do not have permission to start deliveries' using errcode = '42501'; end if;
  -- Serialize all queue operations for this employee
  perform 1 from public.employees where id = _emp for update;
  select * into _t from public.delivery_tasks where id = _task_id for update;
  if not found or _t.employee_id <> _emp then raise exception 'This task is not assigned to you' using errcode = '42501'; end if;
  if _t.status = 'IN_PROGRESS' then raise exception 'This delivery has already started'; end if;
  if _t.status <> 'PENDING' then raise exception 'This task cannot be started (status: %)', _t.status; end if;
  if exists (select 1 from public.delivery_tasks where employee_id = _emp and status = 'IN_PROGRESS') then
    raise exception 'Finish your current delivery before starting another';
  end if;
  _next := public.next_eligible_task_id(_emp);
  if _next is distinct from _task_id then raise exception 'Please deliver tasks in priority order. Another task is next in your queue.'; end if;
  update public.delivery_tasks set status = 'IN_PROGRESS', started_at = now(), completed_at = null, duration_seconds = null
  where id = _task_id returning * into _t;
  perform public.log_task(_task_id, 'PENDING', 'IN_PROGRESS', 'Delivery started');
  return _t;
end; $$;

create or replace function public.complete_delivery(_task_id uuid, _items jsonb, _empty_cans_returned int default 0, _notes text default null)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _emp uuid := public.current_employee_id(); _t public.delivery_tasks; _perm public.employee_permissions;
  _it public.delivery_items; _qty int; _total int := 0; _p public.products; _empty public.products; _provided int;
begin
  if _emp is null then raise exception 'Not authorized: active employee account required' using errcode = '42501'; end if;
  select * into _perm from public.employee_permissions where employee_id = _emp;
  if not coalesce(_perm.can_complete_delivery, false) then raise exception 'You do not have permission to complete deliveries' using errcode = '42501'; end if;
  select * into _t from public.delivery_tasks where id = _task_id for update;
  if not found or _t.employee_id <> _emp then raise exception 'This task is not assigned to you' using errcode = '42501'; end if;
  if _t.status = 'DELIVERED' then raise exception 'This delivery is already completed'; end if;
  if _t.status <> 'IN_PROGRESS' then raise exception 'Only an in-progress delivery can be completed'; end if;
  if _empty_cans_returned is null or _empty_cans_returned < 0 then raise exception 'Returned empty cans cannot be negative'; end if;
  if _items is null or jsonb_typeof(_items) <> 'array' then raise exception 'Delivered quantities are required'; end if;

  select count(*) into _provided from jsonb_array_elements(_items) e
    where exists (select 1 from public.delivery_items di where di.task_id = _task_id and di.id = (e->>'item_id')::uuid);
  if _provided <> (select count(*) from public.delivery_items where task_id = _task_id) or _provided <> jsonb_array_length(_items) then
    raise exception 'Enter a delivered quantity for every product in this task';
  end if;

  for _it in select * from public.delivery_items where task_id = _task_id order by product_name loop
    select (e->>'delivered_qty')::int into _qty from jsonb_array_elements(_items) e where (e->>'item_id')::uuid = _it.id;
    if _qty is null or _qty < 0 then raise exception 'Delivered quantity for % must be zero or more', _it.product_name; end if;
    if _qty > _it.requested_qty then raise exception 'Delivered % (%) exceeds the requested %', _it.product_name, _qty, _it.requested_qty; end if;
    update public.delivery_items set delivered_qty = _qty where id = _it.id;
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

  if _empty_cans_returned > 0 then
    select * into _empty from public.products where kind = 'EMPTY_CAN' and is_active order by created_at limit 1 for update;
    if not found then raise exception 'No empty-can product is set up in inventory'; end if;
    update public.products set available_quantity = available_quantity + _empty_cans_returned where id = _empty.id;
    insert into public.inventory_transactions (product_id, txn_type, quantity, previous_stock, new_stock, task_id, performed_by, notes)
    values (_empty.id, 'EMPTY_CAN_RETURN', _empty_cans_returned, _empty.available_quantity, _empty.available_quantity + _empty_cans_returned, _task_id, auth.uid(), 'Returned on ' || _t.task_code);
  end if;

  update public.delivery_tasks set status = 'DELIVERED', completed_at = now(),
    duration_seconds = extract(epoch from now() - started_at)::int,
    empty_cans_returned = _empty_cans_returned, completion_notes = nullif(btrim(_notes), '')
  where id = _task_id returning * into _t;
  perform public.log_task(_task_id, 'IN_PROGRESS', 'DELIVERED', nullif(btrim(_notes), ''));
  return _t;
end; $$;

create or replace function public.fail_delivery(_task_id uuid, _reason text)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _emp uuid := public.current_employee_id(); _t public.delivery_tasks; _perm public.employee_permissions;
begin
  if _emp is null then raise exception 'Not authorized: active employee account required' using errcode = '42501'; end if;
  select * into _perm from public.employee_permissions where employee_id = _emp;
  if not coalesce(_perm.can_report_failure, false) then raise exception 'You do not have permission to report failed deliveries' using errcode = '42501'; end if;
  if _reason is null or length(btrim(_reason)) < 3 then raise exception 'Please describe why the delivery failed'; end if;
  select * into _t from public.delivery_tasks where id = _task_id for update;
  if not found or _t.employee_id <> _emp then raise exception 'This task is not assigned to you' using errcode = '42501'; end if;
  if _t.status <> 'IN_PROGRESS' then raise exception 'Only an in-progress delivery can be reported as failed'; end if;
  update public.delivery_tasks set status = 'FAILED', completed_at = now(),
    duration_seconds = extract(epoch from now() - started_at)::int, failure_reason = btrim(_reason)
  where id = _task_id returning * into _t;
  perform public.log_task(_task_id, 'IN_PROGRESS', 'FAILED', btrim(_reason));
  return _t;
end; $$;

create or replace function public.hold_delivery(_task_id uuid, _reason text)
returns public.delivery_tasks language plpgsql security definer set search_path = public as $$
declare _emp uuid := public.current_employee_id(); _t public.delivery_tasks; _perm public.employee_permissions;
begin
  if _emp is null then raise exception 'Not authorized: active employee account required' using errcode = '42501'; end if;
  select * into _perm from public.employee_permissions where employee_id = _emp;
  if not coalesce(_perm.can_hold_delivery, false) then raise exception 'You do not have permission to put deliveries on hold' using errcode = '42501'; end if;
  if _reason is null or length(btrim(_reason)) < 3 then raise exception 'Please give a reason for the hold'; end if;
  select * into _t from public.delivery_tasks where id = _task_id for update;
  if not found or _t.employee_id <> _emp then raise exception 'This task is not assigned to you' using errcode = '42501'; end if;
  if _t.status <> 'IN_PROGRESS' then raise exception 'Only an in-progress delivery can be put on hold'; end if;
  update public.delivery_tasks set status = 'ON_HOLD', started_at = null, hold_reason = btrim(_reason)
  where id = _task_id returning * into _t;
  perform public.log_task(_task_id, 'IN_PROGRESS', 'ON_HOLD', btrim(_reason));
  return _t;
end; $$;

-- ===== Admin: inventory =====
create or replace function public.create_product(_name text, _unit text, _kind public.product_kind, _opening_stock int, _min_stock int)
returns public.products language plpgsql security definer set search_path = public as $$
declare _p public.products;
begin
  perform public.require_admin();
  if _opening_stock is null or _opening_stock < 0 then raise exception 'Opening stock cannot be negative'; end if;
  if _min_stock is null or _min_stock < 0 then raise exception 'Minimum stock cannot be negative'; end if;
  begin
    insert into public.products (name, unit, kind, available_quantity, min_stock_level)
    values (btrim(_name), btrim(_unit), _kind, _opening_stock, _min_stock) returning * into _p;
  exception when unique_violation then raise exception 'A product with this name already exists';
  end;
  if _opening_stock > 0 then
    insert into public.inventory_transactions (product_id, txn_type, quantity, previous_stock, new_stock, performed_by, notes)
    values (_p.id, 'OPENING_STOCK', _opening_stock, 0, _opening_stock, auth.uid(), 'Opening stock');
  end if;
  return _p;
end; $$;

create or replace function public.record_stock_movement(_product_id uuid, _type public.txn_type, _quantity int, _notes text default null)
returns public.inventory_transactions language plpgsql security definer set search_path = public as $$
declare _p public.products; _delta int; _tx public.inventory_transactions;
begin
  perform public.require_admin();
  if _quantity is null or _quantity = 0 then raise exception 'Quantity cannot be zero'; end if;
  select * into _p from public.products where id = _product_id for update;
  if not found then raise exception 'Product not found'; end if;
  case _type
    when 'STOCK_ADDED' then
      if _quantity < 0 then raise exception 'Added stock must be positive'; end if; _delta := _quantity;
    when 'DAMAGE' then
      if _quantity < 0 then raise exception 'Enter damaged quantity as a positive number'; end if; _delta := -_quantity;
    when 'EMPTY_CAN_RETURN' then
      if _p.kind <> 'EMPTY_CAN' then raise exception 'Returns can only be recorded on an empty-can product'; end if;
      if _quantity < 0 then raise exception 'Returned quantity must be positive'; end if; _delta := _quantity;
    when 'ADJUSTMENT', 'CORRECTION' then _delta := _quantity;
    else raise exception 'This movement type is recorded automatically';
  end case;
  if _type in ('DAMAGE', 'ADJUSTMENT', 'CORRECTION') and (_notes is null or length(btrim(_notes)) < 3) then
    raise exception 'Please add a note explaining this change';
  end if;
  if _p.available_quantity + _delta < 0 then
    raise exception 'Stock cannot go below zero (available %)', _p.available_quantity;
  end if;
  update public.products set available_quantity = available_quantity + _delta where id = _p.id;
  insert into public.inventory_transactions (product_id, txn_type, quantity, previous_stock, new_stock, performed_by, notes)
  values (_p.id, _type, _delta, _p.available_quantity, _p.available_quantity + _delta, auth.uid(), nullif(btrim(_notes), ''))
  returning * into _tx;
  return _tx;
end; $$;

-- ===== Stats views (respect caller RLS) =====
create or replace view public.customer_stats with (security_invoker = on) as
select c.id as customer_id,
  count(distinct t.id) filter (where t.status = 'DELIVERED') as total_deliveries,
  coalesce(sum(di.delivered_qty) filter (where t.status = 'DELIVERED' and di.product_kind = 'FILLED_CAN'), 0)::int as total_cans,
  coalesce(sum(di.delivered_qty) filter (where t.status = 'DELIVERED' and di.product_kind = 'PACKET'), 0)::int as total_packets,
  count(distinct (t.completed_at at time zone public.business_tz())::date) filter (where t.status = 'DELIVERED') as delivery_days,
  max(t.completed_at) filter (where t.status = 'DELIVERED') as last_delivery_at
from public.customers c
left join public.delivery_tasks t on t.customer_id = c.id
left join public.delivery_items di on di.task_id = t.id
group by c.id;
grant select on public.customer_stats to authenticated;

create or replace view public.employee_stats with (security_invoker = on) as
select e.id as employee_id,
  count(*) filter (where t.status = 'DELIVERED') as delivered,
  count(*) filter (where t.status = 'FAILED') as failed,
  count(*) filter (where t.status = 'PENDING') as pending,
  count(*) filter (where t.status = 'IN_PROGRESS') as in_progress,
  count(*) filter (where t.status = 'ON_HOLD') as on_hold,
  round(avg(t.duration_seconds) filter (where t.status = 'DELIVERED'))::int as avg_duration_seconds,
  max(t.completed_at) filter (where t.status = 'DELIVERED') as last_delivery_at
from public.employees e
left join public.delivery_tasks t on t.employee_id = e.id
group by e.id;
grant select on public.employee_stats to authenticated;

-- ===== Admin dashboard =====
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _tz text := public.business_tz(); _today date := (now() at time zone _tz)::date; _r jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'total_customers', (select count(*) from customers),
    'active_customers', (select count(*) from customers where status = 'ACTIVE'),
    'total_employees', (select count(*) from employees),
    'active_employees', (select count(*) from employees where status = 'ACTIVE'),
    'today_tasks', (select count(*) from delivery_tasks where (created_at at time zone _tz)::date = _today or (completed_at at time zone _tz)::date = _today or status in ('PENDING','IN_PROGRESS')),
    'today_delivered', (select count(*) from delivery_tasks where status = 'DELIVERED' and (completed_at at time zone _tz)::date = _today),
    'today_failed', (select count(*) from delivery_tasks where status = 'FAILED' and (completed_at at time zone _tz)::date = _today),
    'pending', (select count(*) from delivery_tasks where status = 'PENDING'),
    'in_progress', (select count(*) from delivery_tasks where status = 'IN_PROGRESS'),
    'on_hold', (select count(*) from delivery_tasks where status = 'ON_HOLD'),
    'filled_cans', (select coalesce(sum(available_quantity), 0) from products where kind = 'FILLED_CAN' and is_active),
    'packets', (select coalesce(sum(available_quantity), 0) from products where kind = 'PACKET' and is_active),
    'empty_cans', (select coalesce(sum(available_quantity), 0) from products where kind = 'EMPTY_CAN' and is_active),
    'low_stock', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'unit', unit, 'available', available_quantity, 'min', min_stock_level) order by available_quantity)
       from products where is_active and kind <> 'EMPTY_CAN' and available_quantity <= min_stock_level), '[]'::jsonb),
    'employee_today', coalesce((select jsonb_agg(x order by x->>'delivered' desc) from (
       select jsonb_build_object('id', e.id, 'name', e.name, 'code', e.employee_code,
         'delivered', count(t.*) filter (where t.status = 'DELIVERED' and (t.completed_at at time zone _tz)::date = _today),
         'failed', count(t.*) filter (where t.status = 'FAILED' and (t.completed_at at time zone _tz)::date = _today),
         'pending', count(t.*) filter (where t.status = 'PENDING'),
         'in_progress', count(t.*) filter (where t.status = 'IN_PROGRESS'),
         'avg_minutes', round(avg(t.duration_seconds) filter (where t.status = 'DELIVERED' and (t.completed_at at time zone _tz)::date = _today) / 60.0, 1)) as x
       from employees e left join delivery_tasks t on t.employee_id = e.id
       where e.status = 'ACTIVE' group by e.id) s), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(m order by m->>'month') from (
       select jsonb_build_object('month', to_char(gs, 'YYYY-MM'),
         'delivered', (select count(*) from delivery_tasks t where t.status = 'DELIVERED' and date_trunc('month', t.completed_at at time zone _tz) = gs),
         'failed', (select count(*) from delivery_tasks t where t.status = 'FAILED' and date_trunc('month', t.completed_at at time zone _tz) = gs),
         'cans', (select coalesce(sum(di.delivered_qty), 0) from delivery_items di join delivery_tasks t on t.id = di.task_id where t.status = 'DELIVERED' and di.product_kind = 'FILLED_CAN' and date_trunc('month', t.completed_at at time zone _tz) = gs),
         'packets', (select coalesce(sum(di.delivered_qty), 0) from delivery_items di join delivery_tasks t on t.id = di.task_id where t.status = 'DELIVERED' and di.product_kind = 'PACKET' and date_trunc('month', t.completed_at at time zone _tz) = gs)) as m
       from generate_series(date_trunc('month', now() at time zone _tz) - interval '5 months', date_trunc('month', now() at time zone _tz), interval '1 month') gs) s), '[]'::jsonb)
  ) into _r;
  return _r;
end; $$;

-- ===== Reports =====
create or replace function public.delivery_report(_from date, _to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _tz text := public.business_tz(); _r jsonb;
begin
  perform public.require_admin();
  if _from is null or _to is null or _from > _to then raise exception 'Choose a valid date range'; end if;
  with t as (
    select * from delivery_tasks
    where coalesce((completed_at at time zone _tz)::date, (created_at at time zone _tz)::date) between _from and _to
  ), d as (
    select t.*, di.product_kind, di.delivered_qty from t join delivery_items di on di.task_id = t.id where t.status = 'DELIVERED'
  )
  select jsonb_build_object(
    'total', (select count(*) from t),
    'delivered', (select count(*) from t where status = 'DELIVERED'),
    'failed', (select count(*) from t where status = 'FAILED'),
    'pending', (select count(*) from t where status in ('PENDING', 'IN_PROGRESS', 'ON_HOLD')),
    'cancelled', (select count(*) from t where status = 'CANCELLED'),
    'cans', (select coalesce(sum(delivered_qty), 0) from d where product_kind = 'FILLED_CAN'),
    'packets', (select coalesce(sum(delivered_qty), 0) from d where product_kind = 'PACKET'),
    'empty_returned', (select coalesce(sum(empty_cans_returned), 0) from t where status = 'DELIVERED'),
    'avg_minutes', (select round(avg(duration_seconds) / 60.0, 1) from t where status = 'DELIVERED'),
    'daily', coalesce((select jsonb_agg(x order by x->>'date') from (
        select jsonb_build_object('date', gs::date,
          'delivered', (select count(*) from t where status = 'DELIVERED' and (completed_at at time zone _tz)::date = gs::date),
          'failed', (select count(*) from t where status = 'FAILED' and (completed_at at time zone _tz)::date = gs::date),
          'cans', (select coalesce(sum(delivered_qty), 0) from d where product_kind = 'FILLED_CAN' and (completed_at at time zone _tz)::date = gs::date),
          'packets', (select coalesce(sum(delivered_qty), 0) from d where product_kind = 'PACKET' and (completed_at at time zone _tz)::date = gs::date)) as x
        from generate_series(_from, _to, interval '1 day') gs) s), '[]'::jsonb),
    'monthly', coalesce((select jsonb_agg(x order by x->>'month') from (
        select jsonb_build_object('month', to_char(gs, 'YYYY-MM'),
          'delivered', (select count(*) from t where status = 'DELIVERED' and date_trunc('month', completed_at at time zone _tz) = gs),
          'failed', (select count(*) from t where status = 'FAILED' and date_trunc('month', completed_at at time zone _tz) = gs),
          'cans', (select coalesce(sum(delivered_qty), 0) from d where product_kind = 'FILLED_CAN' and date_trunc('month', completed_at at time zone _tz) = gs),
          'packets', (select coalesce(sum(delivered_qty), 0) from d where product_kind = 'PACKET' and date_trunc('month', completed_at at time zone _tz) = gs)) as x
        from generate_series(date_trunc('month', _from::timestamp), date_trunc('month', _to::timestamp), interval '1 month') gs) s), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(x order by (x->>'deliveries')::int desc) from (
        select jsonb_build_object('code', c.customer_code, 'name', c.name,
          'deliveries', count(distinct t.id) filter (where t.status = 'DELIVERED'),
          'days', count(distinct (t.completed_at at time zone _tz)::date) filter (where t.status = 'DELIVERED'),
          'failed', count(distinct t.id) filter (where t.status = 'FAILED'),
          'cans', coalesce(sum(di.delivered_qty) filter (where t.status = 'DELIVERED' and di.product_kind = 'FILLED_CAN'), 0),
          'packets', coalesce(sum(di.delivered_qty) filter (where t.status = 'DELIVERED' and di.product_kind = 'PACKET'), 0),
          'amount', coalesce(sum(di.delivered_qty * di.unit_price) filter (where t.status = 'DELIVERED'), 0)) as x
        from customers c join t on t.customer_id = c.id left join delivery_items di on di.task_id = t.id
        group by c.id) s), '[]'::jsonb),
    'employees', coalesce((select jsonb_agg(x order by (x->>'delivered')::int desc) from (
        select jsonb_build_object('code', e.employee_code, 'name', e.name,
          'assigned', count(*), 'delivered', count(*) filter (where t.status = 'DELIVERED'),
          'failed', count(*) filter (where t.status = 'FAILED'),
          'avg_minutes', round(avg(t.duration_seconds) filter (where t.status = 'DELIVERED') / 60.0, 1),
          'fastest_minutes', round(min(t.duration_seconds) filter (where t.status = 'DELIVERED') / 60.0, 1),
          'slowest_minutes', round(max(t.duration_seconds) filter (where t.status = 'DELIVERED') / 60.0, 1)) as x
        from employees e join t on t.employee_id = e.id group by e.id) s), '[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(x order by x->>'name') from (
        select jsonb_build_object('name', p.name, 'unit', p.unit, 'kind', p.kind,
          'stock', p.available_quantity, 'min', p.min_stock_level, 'low', p.available_quantity <= p.min_stock_level and p.kind <> 'EMPTY_CAN',
          'in', coalesce(sum(it.quantity) filter (where it.quantity > 0), 0),
          'out', coalesce(-sum(it.quantity) filter (where it.quantity < 0), 0),
          'delivered', coalesce(-sum(it.quantity) filter (where it.txn_type = 'DELIVERY'), 0),
          'damaged', coalesce(-sum(it.quantity) filter (where it.txn_type = 'DAMAGE'), 0),
          'returned', coalesce(sum(it.quantity) filter (where it.txn_type = 'EMPTY_CAN_RETURN'), 0)) as x
        from products p left join inventory_transactions it on it.product_id = p.id
          and (it.created_at at time zone _tz)::date between _from and _to
        group by p.id) s), '[]'::jsonb)
  ) into _r;
  return _r;
end; $$;

-- ===== Function privileges =====
revoke execute on all functions in schema public from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.business_tz() to authenticated;
grant execute on function public.admin_exists() to anon, authenticated;
grant execute on function public.my_next_task_id() to authenticated;
grant execute on function public.create_delivery_task(uuid, uuid, int, jsonb, date, text) to authenticated;
grant execute on function public.cancel_delivery_task(uuid, text) to authenticated;
grant execute on function public.reassign_delivery_task(uuid, uuid, int) to authenticated;
grant execute on function public.set_task_priority(uuid, int) to authenticated;
grant execute on function public.resume_delivery_task(uuid) to authenticated;
grant execute on function public.start_delivery(uuid) to authenticated;
grant execute on function public.complete_delivery(uuid, jsonb, int, text) to authenticated;
grant execute on function public.fail_delivery(uuid, text) to authenticated;
grant execute on function public.hold_delivery(uuid, text) to authenticated;
grant execute on function public.create_product(text, text, public.product_kind, int, int) to authenticated;
grant execute on function public.record_stock_movement(uuid, public.txn_type, int, text) to authenticated;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.delivery_report(date, date) to authenticated;
grant execute on all functions in schema public to service_role;
