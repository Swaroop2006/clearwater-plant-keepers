-- ===== Enums & sequences =====
create type public.empty_can_txn_type as enum ('OPENING_BALANCE', 'EMPTY_CANS_COLLECTED', 'EMPTY_CANS_ISSUED', 'BALANCE_ADJUSTMENT');
create type public.payment_method as enum ('CASH', 'UPI', 'BANK_TRANSFER', 'OTHER');
create sequence public.empty_can_txn_code_seq;
create sequence public.bill_code_seq;
create sequence public.payment_code_seq;

-- ===== Customers: custom type + empty-can balance =====
alter table public.customers add column custom_type text check (custom_type is null or length(btrim(custom_type)) between 1 and 60);
alter table public.customers add column empty_cans_balance int not null default 0 check (empty_cans_balance >= 0);
alter table public.customers add constraint customers_custom_type_required check (customer_type <> 'CUSTOM' or custom_type is not null);
comment on column public.customers.price_per_can is 'DEPRECATED: replaced by customer_items';
comment on column public.customers.price_per_packet is 'DEPRECATED: replaced by customer_items';
-- Customer create/edit goes through save_customer(); the client may only toggle status.
revoke insert, update on public.customers from authenticated;
grant update (status) on public.customers to authenticated;

-- ===== Customer-specific items & prices =====
create table public.customer_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  item_name text not null check (length(btrim(item_name)) between 1 and 80),
  unit text not null check (length(btrim(unit)) between 1 and 20),
  price numeric(10,2) not null check (price >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customer_items_name_uq on public.customer_items (customer_id, lower(btrim(item_name)));
create unique index customer_items_product_uq on public.customer_items (customer_id, product_id);
grant select on public.customer_items to authenticated;
grant all on public.customer_items to service_role;
alter table public.customer_items enable row level security;
create policy "Admins read customer items" on public.customer_items for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create trigger customer_items_touch before update on public.customer_items for each row execute function public.touch_updated_at();

alter table public.delivery_items add column customer_item_id uuid references public.customer_items(id) on delete set null;
alter table public.delivery_items add column line_total numeric(12,2) check (line_total is null or line_total >= 0);
create index delivery_items_customer_item_idx on public.delivery_items (customer_item_id);

-- ===== Empty-can ledger per customer (append-only) =====
create table public.customer_empty_can_txns (
  id uuid primary key default gen_random_uuid(),
  txn_code text not null unique default ('ECT' || lpad(nextval('public.empty_can_txn_code_seq')::text, 5, '0')),
  customer_id uuid not null references public.customers(id) on delete cascade,
  txn_type public.empty_can_txn_type not null,
  quantity int not null,
  previous_balance int not null,
  new_balance int not null check (new_balance >= 0),
  task_id uuid references public.delivery_tasks(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete set null,
  performed_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  check (new_balance = previous_balance + quantity),
  check (quantity <> 0 or txn_type = 'OPENING_BALANCE')
);
create index customer_empty_can_txns_customer_idx on public.customer_empty_can_txns (customer_id, created_at desc);
create unique index customer_empty_can_txns_task_once on public.customer_empty_can_txns (task_id, txn_type) where task_id is not null;
grant select on public.customer_empty_can_txns to authenticated;
grant all on public.customer_empty_can_txns to service_role;
alter table public.customer_empty_can_txns enable row level security;
create policy "Admins read empty can txns" on public.customer_empty_can_txns for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ===== Bills, payments, allocations (append-only) =====
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  bill_code text not null unique default ('BILL' || lpad(nextval('public.bill_code_seq')::text, 5, '0')),
  customer_id uuid not null references public.customers(id) on delete restrict,
  task_id uuid not null unique references public.delivery_tasks(id) on delete restrict,
  bill_date timestamptz not null default now(),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index bills_customer_idx on public.bills (customer_id, bill_date);
grant select on public.bills to authenticated;
grant all on public.bills to service_role;
alter table public.bills enable row level security;
create policy "Admins read bills" on public.bills for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Employees read own task bills" on public.bills for select to authenticated
  using (exists (select 1 from public.delivery_tasks t where t.id = task_id and t.employee_id = public.current_employee_id()));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_code text not null unique default ('PAY' || lpad(nextval('public.payment_code_seq')::text, 5, '0')),
  customer_id uuid not null references public.customers(id) on delete restrict,
  task_id uuid references public.delivery_tasks(id) on delete restrict,
  amount numeric(12,2) not null check (amount <> 0),
  method public.payment_method not null,
  reference_no text,
  notes text,
  paid_at timestamptz not null default now(),
  collected_by uuid,
  employee_id uuid references public.employees(id) on delete set null,
  reverses_payment_id uuid unique references public.payments(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((reverses_payment_id is null) = (amount > 0))
);
create index payments_customer_idx on public.payments (customer_id, paid_at);
create index payments_employee_idx on public.payments (employee_id, paid_at);
create unique index payments_task_once on public.payments (task_id) where task_id is not null and reverses_payment_id is null;
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "Admins read payments" on public.payments for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Employees read own collections" on public.payments for select to authenticated using (employee_id = public.current_employee_id());

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  bill_id uuid not null references public.bills(id) on delete restrict,
  amount numeric(12,2) not null check (amount <> 0),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index payment_allocations_bill_idx on public.payment_allocations (bill_id);
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
grant select on public.payment_allocations to authenticated;
grant all on public.payment_allocations to service_role;
alter table public.payment_allocations enable row level security;
create policy "Admins read allocations" on public.payment_allocations for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Employees read own allocations" on public.payment_allocations for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id and p.employee_id = public.current_employee_id()));

-- ===== Settings: UPI / QR =====
alter table public.app_settings add column upi_id text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$');
alter table public.app_settings add column qr_image_path text;

-- ===== Backfill from existing data =====
-- Customer items from the old per-can / per-packet prices
insert into public.customer_items (customer_id, product_id, item_name, unit, price, sort_order)
select c.id, p.id, p.name, p.unit, c.price_per_can, 0
from public.customers c
cross join lateral (select * from public.products where kind = 'FILLED_CAN' and is_active order by created_at limit 1) p;
insert into public.customer_items (customer_id, product_id, item_name, unit, price, sort_order)
select c.id, p.id, p.name, p.unit, c.price_per_packet, 1
from public.customers c
cross join lateral (select * from public.products where kind = 'PACKET' and is_active order by created_at limit 1) p;

update public.delivery_items di set customer_item_id = ci.id
from public.delivery_tasks t, public.customer_items ci
where t.id = di.task_id and ci.customer_id = t.customer_id and ci.product_id = di.product_id;

update public.delivery_items di set line_total = round(coalesce(di.delivered_qty, 0) * di.unit_price, 2)
from public.delivery_tasks t where t.id = di.task_id and t.status = 'DELIVERED';

insert into public.bills (customer_id, task_id, bill_date, total_amount, created_by)
select t.customer_id, t.id, coalesce(t.completed_at, t.updated_at),
  coalesce((select sum(di.line_total) from public.delivery_items di where di.task_id = t.id), 0), null
from public.delivery_tasks t where t.status = 'DELIVERED'
order by coalesce(t.completed_at, t.updated_at);

insert into public.customer_empty_can_txns (customer_id, txn_type, quantity, previous_balance, new_balance, task_id, employee_id, notes, created_at)
select customer_id, 'EMPTY_CANS_COLLECTED', empty_cans_returned, running - empty_cans_returned, running, id, employee_id, 'Collected on ' || task_code, completed_at
from (
  select t.*, sum(t.empty_cans_returned) over (partition by t.customer_id order by t.completed_at, t.task_code) as running
  from public.delivery_tasks t where t.status = 'DELIVERED' and t.empty_cans_returned > 0
) s
order by completed_at;

update public.customers c set empty_cans_balance = s.total
from (select customer_id, sum(quantity)::int as total from public.customer_empty_can_txns group by customer_id) s
where s.customer_id = c.id;

-- ===== Append-only protection =====
create or replace function public.block_ledger_changes()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Allow rows to go only when their customer is being deleted (cascade).
  if tg_op = 'DELETE' and tg_table_name = 'customer_empty_can_txns'
     and not exists (select 1 from public.customers where id = old.customer_id) then
    return old;
  end if;
  raise exception 'Financial and empty-can records are permanent. Record a correction or reversal instead.';
end; $$;
create trigger bills_immutable before update or delete on public.bills for each row execute function public.block_ledger_changes();
create trigger payments_immutable before update or delete on public.payments for each row execute function public.block_ledger_changes();
create trigger payment_allocations_immutable before update or delete on public.payment_allocations for each row execute function public.block_ledger_changes();
create trigger customer_empty_can_txns_immutable before update or delete on public.customer_empty_can_txns for each row execute function public.block_ledger_changes();

-- ===== Balance views (respect caller RLS) =====
create or replace view public.bill_balances with (security_invoker = on) as
select b.id as bill_id, b.bill_code, b.customer_id, b.task_id, b.bill_date, b.total_amount,
  coalesce(a.paid, 0)::numeric(12,2) as amount_paid,
  (b.total_amount - coalesce(a.paid, 0))::numeric(12,2) as outstanding,
  case when b.total_amount - coalesce(a.paid, 0) <= 0 then 'PAID'
       when coalesce(a.paid, 0) > 0 then 'PARTIALLY_PAID'
       else 'UNPAID' end as payment_status
from public.bills b
left join (select bill_id, sum(amount) as paid from public.payment_allocations group by bill_id) a on a.bill_id = b.id;
grant select on public.bill_balances to authenticated;

create or replace view public.payment_balances with (security_invoker = on) as
select p.id as payment_id, p.payment_code, p.customer_id, p.task_id, p.amount, p.method, p.paid_at, p.reverses_payment_id,
  coalesce(a.allocated, 0)::numeric(12,2) as allocated,
  (p.amount - coalesce(a.allocated, 0))::numeric(12,2) as unapplied,
  exists (select 1 from public.payments r where r.reverses_payment_id = p.id) as is_reversed
from public.payments p
left join (select payment_id, sum(amount) as allocated from public.payment_allocations group by payment_id) a on a.payment_id = p.id;
grant select on public.payment_balances to authenticated;

create or replace view public.customer_balances with (security_invoker = on) as
select c.id as customer_id, c.empty_cans_balance,
  coalesce(bb.billed, 0)::numeric(12,2) as total_billed,
  coalesce(bb.paid, 0)::numeric(12,2) as total_allocated,
  coalesce(pp.received, 0)::numeric(12,2) as total_received,
  coalesce(bb.outstanding, 0)::numeric(12,2) as outstanding,
  coalesce(pp.unapplied, 0)::numeric(12,2) as unapplied_credit,
  coalesce(bb.bills, 0)::int as bill_count,
  coalesce(bb.unpaid, 0)::int as unpaid_bills,
  coalesce(bb.partial, 0)::int as partial_bills,
  pp.last_payment_at,
  coalesce(ec.collected, 0)::int as empty_collected,
  coalesce(ec.issued, 0)::int as empty_issued
from public.customers c
left join (
  select customer_id, sum(total_amount) as billed, sum(amount_paid) as paid, sum(outstanding) as outstanding, count(*) as bills,
    count(*) filter (where payment_status = 'UNPAID') as unpaid, count(*) filter (where payment_status = 'PARTIALLY_PAID') as partial
  from public.bill_balances group by customer_id) bb on bb.customer_id = c.id
left join (
  select customer_id, sum(amount) as received, sum(unapplied) as unapplied,
    max(paid_at) filter (where amount > 0 and not is_reversed) as last_payment_at
  from public.payment_balances group by customer_id) pp on pp.customer_id = c.id
left join (
  select customer_id, sum(quantity) filter (where txn_type = 'EMPTY_CANS_COLLECTED') as collected,
    -sum(quantity) filter (where txn_type = 'EMPTY_CANS_ISSUED') as issued
  from public.customer_empty_can_txns group by customer_id) ec on ec.customer_id = c.id;
grant select on public.customer_balances to authenticated;

-- ===== Storage policies for the payment QR image (admin only) =====
create policy "Admins read payment QR" on storage.objects for select to authenticated
  using (bucket_id = 'payment-qr' and public.has_role(auth.uid(), 'admin'));
create policy "Admins upload payment QR" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-qr' and public.has_role(auth.uid(), 'admin'));
create policy "Admins update payment QR" on storage.objects for update to authenticated
  using (bucket_id = 'payment-qr' and public.has_role(auth.uid(), 'admin'));
create policy "Admins delete payment QR" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-qr' and public.has_role(auth.uid(), 'admin'));

alter publication supabase_realtime add table public.bills;
alter publication supabase_realtime add table public.payments;