
-- ===== Enums =====
create type public.app_role as enum ('admin', 'employee');
create type public.customer_type as enum ('HOME', 'SHOP', 'OFFICE');
create type public.record_status as enum ('ACTIVE', 'INACTIVE');
create type public.task_status as enum ('PENDING', 'IN_PROGRESS', 'DELIVERED', 'FAILED', 'ON_HOLD', 'CANCELLED');
create type public.product_kind as enum ('FILLED_CAN', 'PACKET', 'EMPTY_CAN', 'OTHER');
create type public.txn_type as enum ('OPENING_STOCK', 'STOCK_ADDED', 'DELIVERY', 'DAMAGE', 'ADJUSTMENT', 'EMPTY_CAN_RETURN', 'CORRECTION');

create sequence public.customer_code_seq;
create sequence public.employee_code_seq;
create sequence public.task_code_seq;
create sequence public.product_code_seq;
create sequence public.txn_code_seq;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ===== Roles =====
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- ===== Settings =====
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Water Plant',
  timezone text not null default 'Asia/Kolkata',
  late_threshold_minutes int not null default 60 check (late_threshold_minutes between 5 and 1440),
  default_priority int not null default 3 check (default_priority between 1 and 10),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);
grant select, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "Admins read settings" on public.app_settings for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins update settings" on public.app_settings for update to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger app_settings_touch before update on public.app_settings for each row execute function public.touch_updated_at();

create or replace function public.business_tz()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from public.app_settings where id = 1), 'Asia/Kolkata')
$$;

-- ===== Customers =====
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique default ('CUST' || lpad(nextval('public.customer_code_seq')::text, 4, '0')),
  name text not null check (length(btrim(name)) between 1 and 120),
  mobile text not null check (mobile ~ '^\+?[0-9]{10,13}$'),
  address text not null check (length(btrim(address)) between 3 and 500),
  customer_type public.customer_type not null default 'HOME',
  price_per_can numeric(10,2) not null default 0 check (price_per_can >= 0),
  price_per_packet numeric(10,2) not null default 0 check (price_per_packet >= 0),
  status public.record_status not null default 'ACTIVE',
  notes text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_status_idx on public.customers (status, customer_type);
create index customers_name_idx on public.customers (lower(name));
create index customers_mobile_idx on public.customers (mobile);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy "Admins manage customers" on public.customers for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();

-- ===== Employees =====
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique default ('EMP' || lpad(nextval('public.employee_code_seq')::text, 4, '0')),
  user_id uuid unique,
  name text not null check (length(btrim(name)) between 1 and 120),
  mobile text not null check (mobile ~ '^\+?[0-9]{10,13}$'),
  username text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  contact_email text,
  role_title text not null default 'Delivery Worker',
  status public.record_status not null default 'ACTIVE',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_status_idx on public.employees (status);
grant select, update on public.employees to authenticated;
grant all on public.employees to service_role;
alter table public.employees enable row level security;
create policy "Admins read employees" on public.employees for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Employees read self" on public.employees for select to authenticated using (user_id = auth.uid());
create policy "Admins update employees" on public.employees for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger employees_touch before update on public.employees for each row execute function public.touch_updated_at();

-- Protect identity columns from client-side edits (status changes go through the server so the login is also blocked)
revoke update on public.employees from authenticated;
grant update (name, mobile, contact_email) on public.employees to authenticated;

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() and status = 'ACTIVE'
$$;

create table public.employee_permissions (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  can_start_delivery boolean not null default true,
  can_complete_delivery boolean not null default true,
  can_report_failure boolean not null default true,
  can_hold_delivery boolean not null default true,
  can_view_history boolean not null default true,
  updated_at timestamptz not null default now()
);
grant select, update on public.employee_permissions to authenticated;
grant all on public.employee_permissions to service_role;
alter table public.employee_permissions enable row level security;
create policy "Admins read permissions" on public.employee_permissions for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Employees read own permissions" on public.employee_permissions for select to authenticated using (employee_id = public.current_employee_id());
create policy "Admins update permissions" on public.employee_permissions for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger employee_permissions_touch before update on public.employee_permissions for each row execute function public.touch_updated_at();

-- ===== Products =====
create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique default ('PRD' || lpad(nextval('public.product_code_seq')::text, 4, '0')),
  name text not null unique check (length(btrim(name)) between 1 and 80),
  unit text not null default 'unit' check (length(btrim(unit)) between 1 and 20),
  kind public.product_kind not null default 'OTHER',
  available_quantity int not null default 0 check (available_quantity >= 0),
  min_stock_level int not null default 0 check (min_stock_level >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.products to authenticated;
grant update (name, unit, min_stock_level, is_active) on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "Admins read products" on public.products for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins update products" on public.products for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

-- ===== Delivery tasks =====
create table public.delivery_tasks (
  id uuid primary key default gen_random_uuid(),
  task_code text not null unique default ('TSK' || lpad(nextval('public.task_code_seq')::text, 4, '0')),
  customer_id uuid not null references public.customers(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  customer_code text not null,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  priority int not null default 3 check (priority between 1 and 10),
  scheduled_date date,
  status public.task_status not null default 'PENDING',
  notes text,
  failure_reason text,
  hold_reason text,
  completion_notes text,
  empty_cans_returned int not null default 0 check (empty_cans_returned >= 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  updated_at timestamptz not null default now()
);
create index delivery_tasks_queue_idx on public.delivery_tasks (employee_id, status, priority, created_at);
create index delivery_tasks_customer_idx on public.delivery_tasks (customer_id, status);
create index delivery_tasks_status_idx on public.delivery_tasks (status);
create index delivery_tasks_created_idx on public.delivery_tasks (created_at desc);
create index delivery_tasks_completed_idx on public.delivery_tasks (completed_at desc);
create unique index delivery_tasks_one_active_per_employee on public.delivery_tasks (employee_id) where status = 'IN_PROGRESS';
grant select on public.delivery_tasks to authenticated;
grant all on public.delivery_tasks to service_role;
alter table public.delivery_tasks enable row level security;
create policy "Admins read tasks" on public.delivery_tasks for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Employees read own tasks" on public.delivery_tasks for select to authenticated using (employee_id = public.current_employee_id());
create trigger delivery_tasks_touch before update on public.delivery_tasks for each row execute function public.touch_updated_at();

create table public.delivery_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.delivery_tasks(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  product_kind public.product_kind not null,
  unit text not null,
  requested_qty int not null check (requested_qty > 0),
  delivered_qty int check (delivered_qty is null or delivered_qty >= 0),
  unit_price numeric(10,2) not null default 0 check (unit_price >= 0),
  unique (task_id, product_id)
);
create index delivery_items_task_idx on public.delivery_items (task_id);
create index delivery_items_product_idx on public.delivery_items (product_id);
grant select on public.delivery_items to authenticated;
grant all on public.delivery_items to service_role;
alter table public.delivery_items enable row level security;
create policy "Admins read items" on public.delivery_items for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Employees read own task items" on public.delivery_items for select to authenticated
  using (exists (select 1 from public.delivery_tasks t where t.id = task_id and t.employee_id = public.current_employee_id()));

create table public.delivery_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.delivery_tasks(id) on delete cascade,
  from_status public.task_status,
  to_status public.task_status not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index delivery_logs_task_idx on public.delivery_logs (task_id, created_at);
grant select on public.delivery_logs to authenticated;
grant all on public.delivery_logs to service_role;
alter table public.delivery_logs enable row level security;
create policy "Admins read logs" on public.delivery_logs for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Employees read own task logs" on public.delivery_logs for select to authenticated
  using (exists (select 1 from public.delivery_tasks t where t.id = task_id and t.employee_id = public.current_employee_id()));

-- ===== Inventory transactions (append-only) =====
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  txn_code text not null unique default ('TXN' || lpad(nextval('public.txn_code_seq')::text, 5, '0')),
  product_id uuid not null references public.products(id) on delete restrict,
  txn_type public.txn_type not null,
  quantity int not null check (quantity <> 0),
  previous_stock int not null,
  new_stock int not null check (new_stock >= 0),
  task_id uuid references public.delivery_tasks(id) on delete restrict,
  performed_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  check (new_stock = previous_stock + quantity)
);
create index inventory_txn_product_idx on public.inventory_transactions (product_id, created_at desc);
create index inventory_txn_created_idx on public.inventory_transactions (created_at desc);
-- A delivery can only ever move a given product once per transaction type
create unique index inventory_txn_task_once on public.inventory_transactions (task_id, product_id, txn_type) where task_id is not null;
grant select on public.inventory_transactions to authenticated;
grant all on public.inventory_transactions to service_role;
alter table public.inventory_transactions enable row level security;
create policy "Admins read transactions" on public.inventory_transactions for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create or replace function public.block_txn_changes()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Inventory transactions are permanent. Record a correction instead.'; end; $$;
create trigger inventory_txn_immutable before update or delete on public.inventory_transactions
  for each row execute function public.block_txn_changes();

-- ===== Realtime =====
alter publication supabase_realtime add table public.delivery_tasks;
alter publication supabase_realtime add table public.products;
