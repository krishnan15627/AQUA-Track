-- AquaTrack — Supabase (PostgreSQL) schema
-- Paste this entire file into the Supabase SQL Editor and click Run.
-- The Node server connects with the service-role key, which bypasses RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- Customer accounts (role = 'customer') are linked to their customer profile
-- by the unique email/phone they sign up with. The application keeps those
-- values in sync for self-service accounts.
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  phone         text not null,
  password_hash text not null,
  role          text not null default 'owner' check (role in ('owner', 'staff', 'customer')),
  is_active     boolean not null default true,
  last_login    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           text not null unique,
  name                  text not null,
  phone                 text not null,
  email                 text not null default '',
  address               text not null,
  area                  text not null,
  delivery_instructions text not null default '',
  regular_quantity      integer not null default 2 check (regular_quantity >= 1),
  frequency             text not null default 'daily'
                        check (frequency in ('daily', 'alternate_days', 'weekly', 'on_demand')),
  status                text not null default 'Active' check (status in ('Active', 'Inactive')),
  full_cans_delivered   integer not null default 0,
  empty_cans_returned   integer not null default 0,
  unreturned_cans       integer not null default 0 check (unreturned_cans >= 0),
  total_charges         numeric not null default 0,
  total_paid            numeric not null default 0,
  outstanding_balance   numeric not null default 0,
  price_per_can         numeric not null default 30,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                    uuid primary key default gen_random_uuid(),
  order_id              text not null unique,
  customer_ref          uuid not null references public.customers(id) on delete cascade,
  customer_name         text not null,
  customer_phone        text not null,
  area                  text not null,
  delivery_address      text not null,
  delivery_date         text not null,
  delivery_time_slot    text not null default '9:00 AM',
  cans_ordered          integer not null check (cans_ordered >= 1),
  expected_empty_returns integer not null default 0 check (expected_empty_returns >= 0),
  price_per_can         numeric not null default 30,
  total_amount          numeric not null default 60,
  status                text not null default 'Scheduled'
                        check (status in ('Scheduled', 'Out for Delivery', 'Delivered', 'Missed', 'Cancelled')),
  assigned_staff_id     uuid references public.users(id) on delete set null,
  staff_name            text not null default 'Unassigned',
  notes                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- deliveries
-- ---------------------------------------------------------------------------
create table if not exists public.deliveries (
  id                   uuid primary key default gen_random_uuid(),
  delivery_id          text not null unique,
  order_ref            uuid references public.orders(id) on delete set null,
  order_id             text,
  customer_ref         uuid not null references public.customers(id) on delete cascade,
  customer_name        text not null,
  customer_phone       text not null default '',
  delivery_address     text not null default '',
  area                 text not null,
  cans_to_deliver      integer not null check (cans_to_deliver >= 1),
  actual_cans_delivered integer not null default 0,
  empty_cans_collected integer not null default 0,
  status               text not null default 'Pending'
                       check (status in ('Pending', 'Out for Delivery', 'Delivered', 'Failed')),
  delivery_person      text not null default '-',
  delivery_person_id   uuid references public.users(id) on delete set null,
  delivery_date        text not null,
  failure_reason       text not null default '',
  completed_at         timestamptz,
  audit_trail          jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- inventory (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory (
  id                   integer primary key default 1 check (id = 1),
  full_cans_ready      integer not null default 0 check (full_cans_ready >= 0),
  empty_cans_refill    integer not null default 0 check (empty_cans_refill >= 0),
  with_delivery_staff  integer not null default 0 check (with_delivery_staff >= 0),
  damaged_unavailable  integer not null default 0 check (damaged_unavailable >= 0),
  total_cans           integer not null default 0,
  low_stock_threshold  integer not null default 25,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- stock_movements
-- ---------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  movement_id    text not null,
  category       text not null check (category in ('full', 'empty', 'staff', 'damaged')),
  action         text not null check (action in ('received', 'refilled', 'dispatched', 'returned', 'damaged', 'adjustment', 'add', 'remove')),
  quantity       integer not null,
  previous_count integer,
  new_count      integer,
  notes          text not null default '',
  performed_by   text not null default 'Admin Owner',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  payment_id        text not null unique,
  customer_ref      uuid not null references public.customers(id) on delete cascade,
  customer_id       text not null,
  customer_name     text not null,
  order_ref         uuid references public.orders(id) on delete set null,
  order_id          text,
  total_due         numeric not null,
  amount_paid       numeric not null check (amount_paid >= 0),
  remaining_balance numeric not null,
  payment_method    text not null default 'Cash' check (payment_method in ('Cash', 'UPI', 'Bank Transfer')),
  status            text not null default 'Pending' check (status in ('Paid', 'Pending', 'Partial', 'Failed')),
  payment_date      text not null,
  notes             text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_customers_area_status on public.customers (area, status);
create unique index if not exists idx_customers_email_unique
  on public.customers (lower(email)) where email <> '';
create unique index if not exists idx_customers_phone_unique on public.customers (phone);
create index if not exists idx_orders_date_status on public.orders (delivery_date, status);
create index if not exists idx_orders_customer on public.orders (customer_ref);
create index if not exists idx_deliveries_status_date on public.deliveries (status, delivery_date);
create index if not exists idx_deliveries_order on public.deliveries (order_ref);
create index if not exists idx_payments_customer_status on public.payments (customer_id, status);
create index if not exists idx_stock_movements_created on public.stock_movements (created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists trg_deliveries_updated_at on public.deliveries;
create trigger trg_deliveries_updated_at before update on public.deliveries
  for each row execute function public.set_updated_at();

drop trigger if exists trg_inventory_updated_at on public.inventory;
create trigger trg_inventory_updated_at before update on public.inventory
  for each row execute function public.set_updated_at();

drop trigger if exists trg_stock_movements_updated_at on public.stock_movements;
create trigger trg_stock_movements_updated_at before update on public.stock_movements
  for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: no policies are defined, so only the service-role key
-- (used by the Node backend) can read or write. The browser never talks to
-- Supabase directly.
-- ---------------------------------------------------------------------------
alter table public.users           enable row level security;
alter table public.customers       enable row level security;
alter table public.orders          enable row level security;
alter table public.deliveries      enable row level security;
alter table public.inventory       enable row level security;
alter table public.stock_movements enable row level security;
alter table public.payments        enable row level security;
