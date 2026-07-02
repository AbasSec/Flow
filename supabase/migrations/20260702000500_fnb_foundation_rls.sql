create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(name)) stored,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index menu_categories_active_name_key
on public.menu_categories (org_id, outlet_id, normalized_name)
where is_active;

create trigger menu_categories_set_updated_at
before update on public.menu_categories
for each row execute function public.set_updated_at();

create table public.kitchen_stations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(name)) stored,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index kitchen_stations_active_name_key
on public.kitchen_stations (org_id, outlet_id, normalized_name)
where is_active;

create trigger kitchen_stations_set_updated_at
before update on public.kitchen_stations
for each row execute function public.set_updated_at();

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete restrict,
  station_id uuid references public.kitchen_stations(id) on delete set null,
  name text not null,
  normalized_name text generated always as (lower(name)) stored,
  description text,
  price_sen bigint not null check (price_sen >= 0),
  is_public boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index menu_items_active_name_key
on public.menu_items (org_id, outlet_id, category_id, normalized_name)
where is_active;

create trigger menu_items_set_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(name)) stored,
  unit text not null,
  low_stock_threshold numeric(12, 3) not null default 0 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ingredients_active_name_key
on public.ingredients (org_id, outlet_id, normalized_name)
where is_active;

create trigger ingredients_set_updated_at
before update on public.ingredients
for each row execute function public.set_updated_at();

create table public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  version integer not null check (version > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recipe_versions_item_version_key unique (org_id, outlet_id, menu_item_id, version)
);

create unique index recipe_versions_one_active_key
on public.recipe_versions (org_id, outlet_id, menu_item_id)
where is_active;

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  recipe_version_id uuid not null references public.recipe_versions(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(12, 3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  constraint recipe_lines_ingredient_once_key unique (org_id, outlet_id, recipe_version_id, ingredient_id)
);

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  lot_code text not null,
  received_quantity numeric(12, 3) not null check (received_quantity >= 0),
  expires_at date,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint stock_lots_code_key unique (org_id, outlet_id, ingredient_id, lot_code)
);

create index stock_lots_expiry_idx
on public.stock_lots (org_id, outlet_id, ingredient_id, expires_at);

create table public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  stock_lot_id uuid references public.stock_lots(id) on delete restrict,
  entry_type public.inventory_ledger_entry_type not null,
  quantity_delta numeric(12, 3) not null,
  reference_type text,
  reference_id uuid,
  reason text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index inventory_ledger_ingredient_created_idx
on public.inventory_ledger (org_id, ingredient_id, created_at desc);

create or replace function public.prevent_inventory_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'inventory_ledger is append-only';
end;
$$;

create trigger inventory_ledger_prevent_update
before update on public.inventory_ledger
for each row execute function public.prevent_inventory_ledger_mutation();

create trigger inventory_ledger_prevent_delete
before delete on public.inventory_ledger
for each row execute function public.prevent_inventory_ledger_mutation();

create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  table_label text not null,
  status public.table_session_status not null default 'AVAILABLE',
  opened_by_user_id uuid references public.profiles(id) on delete set null,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index table_sessions_outlet_status_idx
on public.table_sessions (org_id, outlet_id, status, created_at desc);

create trigger table_sessions_set_updated_at
before update on public.table_sessions
for each row execute function public.set_updated_at();

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  table_session_id uuid references public.table_sessions(id) on delete set null,
  order_channel public.order_channel not null,
  service_status public.order_service_status not null default 'DRAFT',
  payment_status public.payment_status not null default 'UNPAID',
  idempotency_key text,
  subtotal_sen bigint not null default 0 check (subtotal_sen >= 0),
  tax_sen bigint not null default 0 check (tax_sen >= 0),
  service_charge_sen bigint not null default 0 check (service_charge_sen >= 0),
  total_sen bigint not null default 0 check (total_sen >= 0),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index orders_idempotency_key_idx
on public.orders (org_id, outlet_id, idempotency_key)
where idempotency_key is not null;

create index orders_service_status_idx
on public.orders (org_id, outlet_id, service_status, created_at desc);

create index orders_payment_status_idx
on public.orders (org_id, outlet_id, payment_status, created_at desc);

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete restrict,
  recipe_version_id uuid references public.recipe_versions(id) on delete restrict,
  item_name_snapshot text not null,
  unit_price_sen bigint not null check (unit_price_sen >= 0),
  quantity integer not null check (quantity > 0),
  line_total_sen bigint not null check (line_total_sen >= 0),
  created_at timestamptz not null default now()
);

create index order_lines_order_idx
on public.order_lines (org_id, outlet_id, order_id);

create table public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  station_id uuid not null references public.kitchen_stations(id) on delete restrict,
  status public.kitchen_ticket_status not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kitchen_tickets_station_status_idx
on public.kitchen_tickets (org_id, outlet_id, station_id, status, created_at);

create trigger kitchen_tickets_set_updated_at
before update on public.kitchen_tickets
for each row execute function public.set_updated_at();

create table public.ticket_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  kitchen_ticket_id uuid not null references public.kitchen_tickets(id) on delete cascade,
  order_line_id uuid not null references public.order_lines(id) on delete cascade,
  status public.ticket_line_status not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ticket_lines_ticket_status_idx
on public.ticket_lines (org_id, outlet_id, kitchen_ticket_id, status);

create trigger ticket_lines_set_updated_at
before update on public.ticket_lines
for each row execute function public.set_updated_at();

alter table public.menu_categories enable row level security;
alter table public.kitchen_stations enable row level security;
alter table public.menu_items enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipe_versions enable row level security;
alter table public.recipe_lines enable row level security;
alter table public.stock_lots enable row level security;
alter table public.inventory_ledger enable row level security;
alter table public.table_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.kitchen_tickets enable row level security;
alter table public.ticket_lines enable row level security;

create policy menu_categories_select_outlet_member
on public.menu_categories for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy kitchen_stations_select_outlet_member
on public.kitchen_stations for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy menu_items_select_outlet_member
on public.menu_items for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy ingredients_select_outlet_member
on public.ingredients for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy recipe_versions_select_outlet_member
on public.recipe_versions for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy recipe_lines_select_outlet_member
on public.recipe_lines for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy stock_lots_select_outlet_member
on public.stock_lots for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy inventory_ledger_select_outlet_member
on public.inventory_ledger for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy table_sessions_select_outlet_member
on public.table_sessions for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy orders_select_outlet_member
on public.orders for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy order_lines_select_outlet_member
on public.order_lines for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy kitchen_tickets_select_outlet_member
on public.kitchen_tickets for select to authenticated
using (public.is_active_outlet_member(outlet_id));

create policy ticket_lines_select_outlet_member
on public.ticket_lines for select to authenticated
using (public.is_active_outlet_member(outlet_id));
