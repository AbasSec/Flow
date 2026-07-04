create type public.order_release_policy as enum (
  'RELEASE_ON_SUBMIT',
  'RELEASE_ON_VERIFIED_PAYMENT',
  'RELEASE_BY_AUTHORISED_STAFF'
);

create type public.order_release_state as enum (
  'NOT_RELEASED',
  'RELEASED',
  'HELD',
  'CANCELLED'
);

create type public.order_fulfilment_state as enum (
  'NOT_RELEASED',
  'RELEASED',
  'READY_FOR_HANDOFF',
  'SERVED',
  'COLLECTED',
  'CANCELLED'
);

create type public.order_closure_state as enum (
  'OPEN',
  'COMPLETE',
  'CANCELLED',
  'ARCHIVED'
);

-- Progressive rollout mode per outlet. LEGACY preserves pre-V3.1 QR behaviour
-- (kitchen tickets created immediately on submission). V3_1 enforces the full
-- release-policy gate: QR orders are held until authorised staff confirm
-- settlement and explicitly release to kitchen.
create type public.outlet_lifecycle_mode as enum (
  'LEGACY',
  'V3_1'
);

alter table public.orders
  add column release_policy public.order_release_policy,
  add column release_state public.order_release_state,
  add column released_at timestamptz,
  add column released_by_user_id uuid references public.profiles(id) on delete set null,
  add column fulfilment_state public.order_fulfilment_state,
  add column ready_for_handoff_at timestamptz,
  add column fulfilled_at timestamptz,
  add column fulfilled_by_user_id uuid references public.profiles(id) on delete set null,
  add column closure_state public.order_closure_state,
  add column closed_at timestamptz,
  add column closed_by_user_id uuid references public.profiles(id) on delete set null,
  add column closure_reason text,
  add column lifecycle_version integer not null default 1 check (lifecycle_version > 0);

-- All existing outlets default to LEGACY mode so the currently deployed
-- application continues to work without any staff UI change. The owner or
-- admin can switch an outlet to V3_1 once the matching application version
-- with the release-action UI is deployed.
alter table public.outlets
  add column lifecycle_mode public.outlet_lifecycle_mode not null default 'LEGACY';

create index orders_release_state_idx
on public.orders (org_id, outlet_id, release_state, created_at desc)
where release_state is not null;

create index orders_fulfilment_state_idx
on public.orders (org_id, outlet_id, fulfilment_state, created_at desc)
where fulfilment_state is not null;

create index orders_closure_state_idx
on public.orders (org_id, outlet_id, closure_state, created_at desc)
where closure_state is not null;

create table public.order_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (length(btrim(event_type)) > 0),
  from_state text,
  to_state text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create index order_lifecycle_events_order_created_idx
on public.order_lifecycle_events (org_id, order_id, created_at desc);

create unique index order_lifecycle_events_idempotency_key_idx
on public.order_lifecycle_events (org_id, order_id, idempotency_key)
where idempotency_key is not null;

alter table public.order_lifecycle_events enable row level security;

create policy order_lifecycle_events_select_outlet_member
on public.order_lifecycle_events for select
to authenticated
using (public.is_active_outlet_member(outlet_id));

grant select, insert, update on table public.order_lifecycle_events to service_role;
grant select on table public.order_lifecycle_events to authenticated;

-- Backfill existing orders into compatible V3.1 lifecycle states.
-- QR orders that already have kitchen tickets existed before V3.1 and were
-- released on submit; treat them as RELEASE_ON_SUBMIT so the staff UI shows
-- no spurious release button.
-- Backfills must not invent served, collected, payment, refund, payroll, or cost truth.
update public.orders o
set
  release_policy = case
    when o.order_channel = 'qr' and exists (
      select 1 from public.kitchen_tickets kt
      where kt.org_id = o.org_id and kt.order_id = o.id
    ) then 'RELEASE_ON_SUBMIT'::public.order_release_policy
    when o.order_channel = 'qr' then 'RELEASE_BY_AUTHORISED_STAFF'::public.order_release_policy
    when o.order_channel = 'online_pickup' then 'RELEASE_ON_VERIFIED_PAYMENT'::public.order_release_policy
    else 'RELEASE_ON_SUBMIT'::public.order_release_policy
  end,
  release_state = case
    when exists (
      select 1 from public.kitchen_tickets kt
      where kt.org_id = o.org_id and kt.order_id = o.id
    ) then 'RELEASED'::public.order_release_state
    else null
  end,
  released_at = case
    when exists (
      select 1 from public.kitchen_tickets kt
      where kt.org_id = o.org_id and kt.order_id = o.id
    ) then o.created_at
    else null
  end,
  fulfilment_state = case
    when o.service_status = 'READY' then 'READY_FOR_HANDOFF'::public.order_fulfilment_state
    when o.service_status in ('SUBMITTED', 'PREPARING') and exists (
      select 1 from public.kitchen_tickets kt
      where kt.org_id = o.org_id and kt.order_id = o.id
    ) then 'RELEASED'::public.order_fulfilment_state
    when o.service_status = 'CANCELLED' then 'CANCELLED'::public.order_fulfilment_state
    else null
  end,
  ready_for_handoff_at = case
    when o.service_status = 'READY' then o.updated_at
    else null
  end,
  closure_state = case
    when o.service_status = 'CANCELLED' then 'CANCELLED'::public.order_closure_state
    else 'OPEN'::public.order_closure_state
  end
where o.release_policy is null;

create or replace function public.flow_v3_1_record_lifecycle_event(
  target_order_id uuid,
  event_name text,
  from_state text,
  to_state text,
  event_reason text,
  event_metadata jsonb,
  event_idempotency_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  target_order public.orders%rowtype;
begin
  select *
  into target_order
  from public.orders
  where id = target_order_id;

  if not found then
    raise exception 'Order not found';
  end if;

  insert into public.order_lifecycle_events (
    org_id,
    outlet_id,
    order_id,
    actor_user_id,
    event_type,
    from_state,
    to_state,
    reason,
    metadata,
    idempotency_key
  )
  values (
    target_order.org_id,
    target_order.outlet_id,
    target_order.id,
    auth.uid(),
    event_name,
    from_state,
    to_state,
    event_reason,
    coalesce(event_metadata, '{}'::jsonb),
    event_idempotency_key
  )
  on conflict do nothing;
end;
$$;

create or replace function public.flow_v3_1_require_outlet_role(
  target_outlet_id uuid,
  allowed_roles public.org_role[]
)
returns public.org_role
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_outlet record;
  actor_role public.org_role;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select o.id, o.org_id, o.site_id
  into target_outlet
  from public.outlets o
  join public.sites s on s.id = o.site_id and s.org_id = o.org_id
  where o.id = target_outlet_id
    and o.is_active
    and s.is_active;

  if not found then
    raise exception 'Outlet access denied' using errcode = '42501';
  end if;

  actor_role := public.flow_m3_require_role(target_outlet.org_id, allowed_roles);

  if actor_role in ('organisation_owner', 'organisation_admin') then
    return actor_role;
  end if;

  if not public.is_active_site_member(target_outlet.site_id) then
    raise exception 'Outlet access denied' using errcode = '42501';
  end if;

  return actor_role;
end;
$$;

create or replace function public.flow_v3_1_create_table_order(
  target_table_session_id uuid,
  order_items jsonb,
  request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_table public.table_sessions%rowtype;
  new_order_id uuid;
  new_ticket_id uuid;
  thread_room_id uuid;
  subtotal bigint := 0;
  item_count integer := 0;
  line_record record;
  ingredient_record record;
  ticket_record record;
  existing_order public.orders%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if request_key is null or length(btrim(request_key)) = 0 then
    raise exception 'Order idempotency key is required';
  end if;

  if order_items is null or jsonb_typeof(order_items) <> 'array' or jsonb_array_length(order_items) = 0 then
    raise exception 'Order requires at least one item';
  end if;

  select *
  into target_table
  from public.table_sessions
  where id = target_table_session_id
  for update;

  if not found then
    raise exception 'Table session not found';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_table.outlet_id,
    array[
      'organisation_owner',
      'organisation_admin',
      'manager',
      'cashier',
      'waiter'
    ]::public.org_role[]
  );

  perform pg_advisory_xact_lock(hashtext(target_table.org_id::text || ':v3-table:' || request_key));

  select *
  into existing_order
  from public.orders
  where org_id = target_table.org_id
    and outlet_id = target_table.outlet_id
    and idempotency_key = request_key
  limit 1;

  if found then
    return jsonb_build_object('order_id', existing_order.id, 'idempotent', true);
  end if;

  create temporary table flow_order_request (
    menu_item_id uuid not null,
    quantity integer not null
  ) on commit drop;

  insert into flow_order_request (menu_item_id, quantity)
  select (item ->> 'menu_item_id')::uuid, (item ->> 'quantity')::integer
  from jsonb_array_elements(order_items) as item;

  if exists (select 1 from flow_order_request where quantity <= 0 or quantity > 20) then
    raise exception 'Order quantities must be positive';
  end if;

  create temporary table flow_order_lines on commit drop as
  select
    mi.id as menu_item_id,
    mi.name as item_name,
    mi.price_sen,
    mi.station_id,
    rv.id as recipe_version_id,
    sum(req.quantity)::integer as quantity
  from flow_order_request req
  join public.menu_items mi on mi.id = req.menu_item_id
  join public.recipe_versions rv on rv.menu_item_id = mi.id and rv.is_active
  where mi.org_id = target_table.org_id
    and mi.outlet_id = target_table.outlet_id
    and mi.is_active
  group by mi.id, mi.name, mi.price_sen, mi.station_id, rv.id;

  select coalesce(sum(quantity), 0)
  into item_count
  from flow_order_lines;

  if item_count <> (select coalesce(sum(quantity), 0) from flow_order_request) then
    raise exception 'One or more menu items are unavailable';
  end if;

  create temporary table flow_required_ingredients on commit drop as
  select
    rl.ingredient_id,
    sum(rl.quantity * fol.quantity)::numeric(12, 3) as required_quantity
  from flow_order_lines fol
  join public.recipe_lines rl on rl.recipe_version_id = fol.recipe_version_id
  group by rl.ingredient_id;

  for ingredient_record in
    select ingredient_id, required_quantity
    from flow_required_ingredients
  loop
    if public.flow_m3_available_quantity(target_table.outlet_id, ingredient_record.ingredient_id) < ingredient_record.required_quantity then
      raise exception 'Insufficient stock for ingredient %', ingredient_record.ingredient_id;
    end if;
  end loop;

  select coalesce(sum(price_sen * quantity), 0)
  into subtotal
  from flow_order_lines;

  insert into public.orders (
    org_id,
    outlet_id,
    table_session_id,
    order_channel,
    service_status,
    payment_status,
    idempotency_key,
    subtotal_sen,
    total_sen,
    created_by_user_id,
    release_policy,
    release_state,
    released_at,
    released_by_user_id,
    fulfilment_state,
    closure_state,
    lifecycle_version
  )
  values (
    target_table.org_id,
    target_table.outlet_id,
    target_table.id,
    'table',
    'SUBMITTED',
    'UNPAID',
    request_key,
    subtotal,
    subtotal,
    actor_id,
    'RELEASE_ON_SUBMIT',
    'RELEASED',
    now(),
    actor_id,
    'RELEASED',
    'OPEN',
    3
  )
  returning id into new_order_id;

  for line_record in
    select *
    from flow_order_lines
  loop
    insert into public.order_lines (
      org_id,
      outlet_id,
      order_id,
      menu_item_id,
      recipe_version_id,
      item_name_snapshot,
      unit_price_sen,
      quantity,
      line_total_sen
    )
    values (
      target_table.org_id,
      target_table.outlet_id,
      new_order_id,
      line_record.menu_item_id,
      line_record.recipe_version_id,
      line_record.item_name,
      line_record.price_sen,
      line_record.quantity,
      line_record.price_sen * line_record.quantity
    );
  end loop;

  insert into public.inventory_ledger (
    org_id,
    outlet_id,
    ingredient_id,
    entry_type,
    quantity_delta,
    reference_type,
    reference_id,
    reason,
    created_by_user_id
  )
  select
    target_table.org_id,
    target_table.outlet_id,
    ingredient_id,
    'reservation',
    -required_quantity,
    'order',
    new_order_id,
    'Order inventory reservation',
    actor_id
  from flow_required_ingredients;

  for ticket_record in
    select station_id
    from flow_order_lines
    where station_id is not null
    group by station_id
  loop
    insert into public.kitchen_tickets (
      org_id,
      outlet_id,
      order_id,
      station_id,
      status
    )
    values (
      target_table.org_id,
      target_table.outlet_id,
      new_order_id,
      ticket_record.station_id,
      'NEW'
    )
    returning id into new_ticket_id;

    insert into public.ticket_lines (
      org_id,
      outlet_id,
      kitchen_ticket_id,
      order_line_id,
      status
    )
    select
      target_table.org_id,
      target_table.outlet_id,
      new_ticket_id,
      ol.id,
      'NEW'
    from public.order_lines ol
    join flow_order_lines fol on fol.menu_item_id = ol.menu_item_id
    where ol.order_id = new_order_id
      and fol.station_id = ticket_record.station_id;
  end loop;

  update public.table_sessions
  set status = 'OPEN',
      opened_by_user_id = coalesce(opened_by_user_id, actor_id),
      opened_at = coalesce(opened_at, now())
  where id = target_table.id
    and status = 'AVAILABLE';

  insert into public.communication_rooms (
    org_id,
    site_id,
    room_type,
    title,
    created_by_user_id
  )
  select
    target_table.org_id,
    out.site_id,
    'WORK_ITEM_THREAD',
    'Order ' || left(new_order_id::text, 8),
    actor_id
  from public.outlets out
  where out.id = target_table.outlet_id
  returning id into thread_room_id;

  insert into public.work_item_threads (org_id, room_id, entity_type, entity_id)
  values (target_table.org_id, thread_room_id, 'ORDER', new_order_id);

  insert into public.room_memberships (org_id, room_id, user_id, role)
  select target_table.org_id, thread_room_id, om.user_id, 'member'
  from public.org_memberships om
  where om.org_id = target_table.org_id
    and om.deactivated_at is null
  on conflict do nothing;

  perform public.flow_v3_1_record_lifecycle_event(
    new_order_id,
    'ORDER_RELEASED',
    'NOT_RELEASED',
    'RELEASED',
    'Release on submit for table-service staff order',
    jsonb_build_object('release_policy', 'RELEASE_ON_SUBMIT'),
    'order.released:' || new_order_id::text
  );

  insert into public.audit_events (
    org_id,
    outlet_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    after_data,
    request_id
  )
  values (
    target_table.org_id,
    target_table.outlet_id,
    actor_id,
    'ORDER_CREATED',
    'orders',
    new_order_id,
    jsonb_build_object(
      'total_sen', subtotal,
      'item_count', item_count,
      'release_policy', 'RELEASE_ON_SUBMIT',
      'release_state', 'RELEASED'
    ),
    request_key
  );

  insert into public.outbox_events (
    org_id,
    outlet_id,
    room_id,
    user_id,
    event_type,
    object_type,
    object_id,
    payload_summary,
    dedupe_key
  )
  values (
    target_table.org_id,
    target_table.outlet_id,
    thread_room_id,
    actor_id,
    'order.created',
    'orders',
    new_order_id,
    jsonb_build_object('total_sen', subtotal, 'release_state', 'RELEASED'),
    'order.created:' || new_order_id::text
  );

  return jsonb_build_object('order_id', new_order_id, 'thread_room_id', thread_room_id, 'idempotent', false);
end;
$$;

-- Public QR order creation with outlet-level lifecycle mode branching.
--
-- LEGACY mode (default for all existing outlets):
--   Kitchen tickets and inventory reservation are created immediately on
--   submission, preserving pre-V3.1 behaviour. The deployed application
--   without the V3.1 release UI continues to work without change.
--
-- V3_1 mode (opt-in per outlet after matching app version is deployed):
--   No kitchen tickets or inventory reservation are created at submission.
--   The order waits for authorised staff to confirm settlement and then
--   explicitly release it to kitchen via flow_v3_1_release_order_to_kitchen.
--
-- Activate V3.1 mode for an outlet with flow_v3_1_enable_outlet_v3_1 once the
-- release-action UI is live for that outlet. This is one-way: LEGACY → V3_1 only.
create or replace function public.flow_m4_create_qr_table_order(
  target_table_token text,
  order_items jsonb,
  request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  target_table public.table_sessions%rowtype;
  outlet_mode public.outlet_lifecycle_mode;
  new_order_id uuid;
  thread_room_id uuid;
  tracking_token text;
  subtotal bigint := 0;
  item_count integer := 0;
  line_record record;
  ingredient_record record;
  ticket_record record;
  new_ticket_id uuid;
  existing_order public.orders%rowtype;
begin
  if target_table_token is null or length(btrim(target_table_token)) < 32 then
    raise exception 'Table link is unavailable';
  end if;

  if request_key is null or length(btrim(request_key)) < 8 then
    raise exception 'Order idempotency key is required';
  end if;

  if order_items is null then
    raise exception 'Invalid order request';
  end if;

  if jsonb_typeof(order_items) <> 'array' then
    raise exception 'Invalid order request';
  end if;

  if jsonb_array_length(order_items) = 0 or jsonb_array_length(order_items) > 20 then
    raise exception 'Invalid order request';
  end if;

  select *
  into target_table
  from public.table_sessions ts
  where ts.public_table_token = target_table_token
    and ts.public_token_expires_at is not null
    and ts.public_token_expires_at > now()
    and ts.status in ('AVAILABLE', 'OPEN')
  for update;

  if not found then
    raise exception 'Table link is unavailable';
  end if;

  -- Resolve outlet lifecycle mode; default to LEGACY for safety if missing.
  select o.lifecycle_mode into outlet_mode
  from public.outlets o
  where o.id = target_table.outlet_id;

  if not found then
    outlet_mode := 'LEGACY';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_table.org_id::text || ':public-qr:' || request_key));

  select *
  into existing_order
  from public.orders
  where org_id = target_table.org_id
    and outlet_id = target_table.outlet_id
    and idempotency_key = 'qr:' || target_table.public_table_token || ':' || request_key
  limit 1;

  if found then
    return jsonb_build_object(
      'public_order_id', existing_order.public_tracking_token,
      'idempotent', true,
      'release_state', existing_order.release_state,
      'payment_label', 'Pay at counter'
    );
  end if;

  create temporary table flow_public_order_request (
    menu_token text not null,
    quantity integer not null
  ) on commit drop;

  if exists (
    with submitted as (
      select item.value
      from jsonb_array_elements(order_items) as item(value)
    ),
    object_items as (
      select value
      from submitted
      where jsonb_typeof(value) = 'object'
    )
    select 1
    from submitted
    where jsonb_typeof(value) <> 'object'
    union all
    select 1
    from object_items oi
    where not (oi.value ? 'public_menu_token')
      or not (oi.value ? 'quantity')
      or (
        select count(*)
        from jsonb_object_keys(oi.value)
      ) <> 2
      or exists (
        select 1
        from jsonb_object_keys(oi.value) as fields(field_name)
        where fields.field_name not in ('public_menu_token', 'quantity')
      )
      or jsonb_typeof(oi.value -> 'public_menu_token') <> 'string'
      or jsonb_typeof(oi.value -> 'quantity') not in ('number', 'string')
      or length(btrim(oi.value ->> 'public_menu_token')) < 32
      or length(btrim(oi.value ->> 'public_menu_token')) > 128
      or (oi.value ->> 'quantity') !~ '^[0-9]+$'
  ) then
    raise exception 'Invalid order request';
  end if;

  if exists (
    select 1
    from (
      select item.value ->> 'public_menu_token' as menu_token
      from jsonb_array_elements(order_items) as item(value)
      group by item.value ->> 'public_menu_token'
      having count(*) > 1
    ) duplicated_items
  ) then
    raise exception 'Invalid order request';
  end if;

  insert into flow_public_order_request (menu_token, quantity)
  select btrim(item.value ->> 'public_menu_token'), (item.value ->> 'quantity')::integer
  from jsonb_array_elements(order_items) as item(value);

  if exists (
    select 1
    from flow_public_order_request
    where quantity <= 0 or quantity > 20 or length(btrim(menu_token)) < 32
  ) then
    raise exception 'Invalid order request';
  end if;

  if (select coalesce(sum(quantity), 0) from flow_public_order_request) > 50 then
    raise exception 'Invalid order request';
  end if;

  create temporary table flow_public_order_lines on commit drop as
  select
    mi.id as menu_item_id,
    mi.name as item_name,
    mi.price_sen,
    mi.station_id,
    rv.id as recipe_version_id,
    sum(req.quantity)::integer as quantity
  from flow_public_order_request req
  join public.menu_items mi on mi.public_menu_token = req.menu_token
  join public.recipe_versions rv on rv.menu_item_id = mi.id and rv.is_active
  where mi.org_id = target_table.org_id
    and mi.outlet_id = target_table.outlet_id
    and mi.is_active
    and mi.is_public
  group by mi.id, mi.name, mi.price_sen, mi.station_id, rv.id;

  select coalesce(sum(quantity), 0)
  into item_count
  from flow_public_order_lines;

  if item_count <> (select coalesce(sum(quantity), 0) from flow_public_order_request) then
    raise exception 'Invalid order request';
  end if;

  create temporary table flow_public_required_ingredients on commit drop as
  select
    rl.ingredient_id,
    sum(rl.quantity * fol.quantity)::numeric(12, 3) as required_quantity
  from flow_public_order_lines fol
  join public.recipe_lines rl on rl.recipe_version_id = fol.recipe_version_id
  group by rl.ingredient_id;

  for ingredient_record in
    select ingredient_id, required_quantity
    from flow_public_required_ingredients
  loop
    if public.flow_m3_available_quantity(target_table.outlet_id, ingredient_record.ingredient_id) < ingredient_record.required_quantity then
      raise exception 'Invalid order request';
    end if;
  end loop;

  select coalesce(sum(price_sen * quantity), 0)
  into subtotal
  from flow_public_order_lines;

  tracking_token := encode(extensions.gen_random_bytes(24), 'hex');

  -- Insert order with release columns set per outlet lifecycle mode.
  -- V3_1: held until authorised settlement and release.
  -- LEGACY: treated as released on submit (kitchen tickets created below).
  insert into public.orders (
    org_id,
    outlet_id,
    table_session_id,
    order_channel,
    service_status,
    payment_status,
    idempotency_key,
    subtotal_sen,
    total_sen,
    public_tracking_token,
    public_tracking_expires_at,
    release_policy,
    release_state,
    released_at,
    fulfilment_state,
    closure_state,
    lifecycle_version
  )
  values (
    target_table.org_id,
    target_table.outlet_id,
    target_table.id,
    'qr',
    'SUBMITTED',
    'UNPAID',
    'qr:' || target_table.public_table_token || ':' || request_key,
    subtotal,
    subtotal,
    tracking_token,
    now() + interval '24 hours',
    case when outlet_mode = 'V3_1'
      then 'RELEASE_BY_AUTHORISED_STAFF'::public.order_release_policy
      else 'RELEASE_ON_SUBMIT'::public.order_release_policy
    end,
    case when outlet_mode = 'V3_1'
      then 'NOT_RELEASED'::public.order_release_state
      else 'RELEASED'::public.order_release_state
    end,
    case when outlet_mode = 'V3_1' then null else now() end,
    case when outlet_mode = 'V3_1'
      then 'NOT_RELEASED'::public.order_fulfilment_state
      else 'RELEASED'::public.order_fulfilment_state
    end,
    'OPEN',
    3
  )
  returning id into new_order_id;

  for line_record in
    select *
    from flow_public_order_lines
  loop
    insert into public.order_lines (
      org_id,
      outlet_id,
      order_id,
      menu_item_id,
      recipe_version_id,
      item_name_snapshot,
      unit_price_sen,
      quantity,
      line_total_sen
    )
    values (
      target_table.org_id,
      target_table.outlet_id,
      new_order_id,
      line_record.menu_item_id,
      line_record.recipe_version_id,
      line_record.item_name,
      line_record.price_sen,
      line_record.quantity,
      line_record.price_sen * line_record.quantity
    );
  end loop;

  -- LEGACY MODE: create inventory reservation and kitchen tickets immediately.
  -- This preserves pre-V3.1 QR behaviour for outlets not yet switched to V3_1.
  if outlet_mode = 'LEGACY' then
    insert into public.inventory_ledger (
      org_id,
      outlet_id,
      ingredient_id,
      entry_type,
      quantity_delta,
      reference_type,
      reference_id,
      reason,
      created_by_user_id
    )
    select
      target_table.org_id,
      target_table.outlet_id,
      ingredient_id,
      'reservation',
      -required_quantity,
      'order',
      new_order_id,
      'QR order inventory reservation (LEGACY outlet mode)',
      null
    from flow_public_required_ingredients;

    for ticket_record in
      select station_id
      from flow_public_order_lines
      where station_id is not null
      group by station_id
    loop
      insert into public.kitchen_tickets (
        org_id,
        outlet_id,
        order_id,
        station_id,
        status
      )
      values (
        target_table.org_id,
        target_table.outlet_id,
        new_order_id,
        ticket_record.station_id,
        'NEW'
      )
      returning id into new_ticket_id;

      insert into public.ticket_lines (
        org_id,
        outlet_id,
        kitchen_ticket_id,
        order_line_id,
        status
      )
      select
        target_table.org_id,
        target_table.outlet_id,
        new_ticket_id,
        ol.id,
        'NEW'
      from public.order_lines ol
      join flow_public_order_lines fol on fol.menu_item_id = ol.menu_item_id
      where ol.order_id = new_order_id
        and fol.station_id = ticket_record.station_id;
    end loop;
  end if;
  -- V3_1 MODE: no kitchen tickets or inventory reservation until authorised release.

  update public.table_sessions
  set status = 'OPEN',
      opened_at = coalesce(opened_at, now())
  where id = target_table.id
    and status = 'AVAILABLE';

  insert into public.communication_rooms (
    org_id,
    site_id,
    room_type,
    title
  )
  select
    target_table.org_id,
    out.site_id,
    'WORK_ITEM_THREAD',
    'QR Order ' || left(new_order_id::text, 8)
  from public.outlets out
  where out.id = target_table.outlet_id
  returning id into thread_room_id;

  insert into public.work_item_threads (org_id, room_id, entity_type, entity_id)
  values (target_table.org_id, thread_room_id, 'ORDER', new_order_id);

  insert into public.room_memberships (org_id, room_id, user_id, role)
  select target_table.org_id, thread_room_id, om.user_id, 'member'
  from public.org_memberships om
  where om.org_id = target_table.org_id
    and om.deactivated_at is null
  on conflict do nothing;

  if outlet_mode = 'V3_1' then
    perform public.flow_v3_1_record_lifecycle_event(
      new_order_id,
      'ORDER_RECEIVED_NOT_RELEASED',
      null,
      'NOT_RELEASED',
      'QR pay-at-counter order received; awaiting verified manual settlement and authorised release',
      jsonb_build_object('release_policy', 'RELEASE_BY_AUTHORISED_STAFF'),
      'order.received:' || new_order_id::text
    );
  else
    perform public.flow_v3_1_record_lifecycle_event(
      new_order_id,
      'ORDER_RELEASED',
      'NOT_RELEASED',
      'RELEASED',
      'QR order released on submit (LEGACY outlet mode)',
      jsonb_build_object('release_policy', 'RELEASE_ON_SUBMIT', 'outlet_mode', 'LEGACY'),
      'order.released:' || new_order_id::text
    );
  end if;

  insert into public.audit_events (
    org_id,
    outlet_id,
    action,
    object_type,
    object_id,
    after_data,
    request_id
  )
  values (
    target_table.org_id,
    target_table.outlet_id,
    'QR_TABLE_ORDER_RECEIVED',
    'orders',
    new_order_id,
    jsonb_build_object(
      'total_sen', subtotal,
      'item_count', item_count,
      'payment_status', 'UNPAID',
      'payment_label', 'Pay at counter',
      'release_policy', case when outlet_mode = 'V3_1' then 'RELEASE_BY_AUTHORISED_STAFF' else 'RELEASE_ON_SUBMIT' end,
      'release_state', case when outlet_mode = 'V3_1' then 'NOT_RELEASED' else 'RELEASED' end,
      'kitchen_work_created', outlet_mode = 'LEGACY',
      'outlet_mode', outlet_mode
    ),
    request_key
  );

  insert into public.outbox_events (
    org_id,
    outlet_id,
    room_id,
    event_type,
    object_type,
    object_id,
    payload_summary,
    dedupe_key
  )
  values (
    target_table.org_id,
    target_table.outlet_id,
    thread_room_id,
    'order.qr_table_received',
    'orders',
    new_order_id,
    jsonb_build_object(
      'total_sen', subtotal,
      'payment_status', 'UNPAID',
      'release_state', case when outlet_mode = 'V3_1' then 'NOT_RELEASED' else 'RELEASED' end
    ),
    'order.qr_table_received:' || new_order_id::text
  );

  return jsonb_build_object(
    'public_order_id', tracking_token,
    'idempotent', false,
    'payment_status', 'UNPAID',
    'release_state', case when outlet_mode = 'V3_1' then 'NOT_RELEASED' else 'RELEASED' end,
    'payment_label', 'Pay at counter'
  );
end;
$$;

create or replace function public.flow_v3_1_confirm_manual_settlement(target_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_order public.orders%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into target_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_order.outlet_id,
    array[
      'organisation_owner',
      'organisation_admin',
      'manager',
      'cashier'
    ]::public.org_role[]
  );

  if target_order.payment_status = 'PAID' then
    return jsonb_build_object('order_id', target_order.id, 'payment_status', 'PAID', 'idempotent', true);
  end if;

  if target_order.payment_status <> 'UNPAID' then
    raise exception 'Only unpaid orders can use demo manual settlement';
  end if;

  update public.orders
  set payment_status = 'PAID'
  where id = target_order.id;

  perform public.flow_v3_1_record_lifecycle_event(
    target_order.id,
    'MANUAL_EXTERNAL_SETTLEMENT_CONFIRMED',
    target_order.payment_status::text,
    'PAID',
    'Competition demo manual settlement; not a payment gateway integration',
    jsonb_build_object('payment_owner', 'authorised_cashier_manual_external_settlement'),
    'order.manual_settlement:' || target_order.id::text
  );

  insert into public.audit_events (
    org_id,
    outlet_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    before_data,
    after_data,
    reason
  )
  values (
    target_order.org_id,
    target_order.outlet_id,
    actor_id,
    'DEMO_MANUAL_SETTLEMENT',
    'orders',
    target_order.id,
    jsonb_build_object('payment_status', target_order.payment_status),
    jsonb_build_object('payment_status', 'PAID'),
    'Competition demo manual settlement; not a payment gateway integration'
  );

  insert into public.outbox_events (
    org_id,
    outlet_id,
    user_id,
    event_type,
    object_type,
    object_id,
    payload_summary,
    dedupe_key
  )
  values (
    target_order.org_id,
    target_order.outlet_id,
    actor_id,
    'order.demo_manual_settled',
    'orders',
    target_order.id,
    jsonb_build_object('total_sen', target_order.total_sen),
    'order.demo_manual_settled:' || target_order.id::text
  )
  on conflict do nothing;

  return jsonb_build_object('order_id', target_order.id, 'payment_status', 'PAID', 'idempotent', false);
end;
$$;

create or replace function public.flow_v3_1_release_order_to_kitchen(target_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_order public.orders%rowtype;
  line_record record;
  ingredient_record record;
  ticket_record record;
  new_ticket_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into target_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_order.outlet_id,
    array[
      'organisation_owner',
      'organisation_admin',
      'manager',
      'cashier'
    ]::public.org_role[]
  );

  if target_order.release_state = 'RELEASED' then
    return jsonb_build_object('order_id', target_order.id, 'release_state', 'RELEASED', 'idempotent', true);
  end if;

  if target_order.release_policy <> 'RELEASE_BY_AUTHORISED_STAFF' then
    raise exception 'Order does not require authorised staff release';
  end if;

  if target_order.payment_status <> 'PAID' then
    raise exception 'Manual settlement must be confirmed before kitchen release';
  end if;

  if exists (
    select 1 from public.kitchen_tickets kt
    where kt.org_id = target_order.org_id
      and kt.order_id = target_order.id
  ) then
    update public.orders
    set release_state = 'RELEASED',
        released_at = coalesce(released_at, now()),
        released_by_user_id = coalesce(released_by_user_id, actor_id),
        fulfilment_state = case
          when fulfilment_state is null or fulfilment_state = 'NOT_RELEASED' then 'RELEASED'
          else fulfilment_state
        end
    where id = target_order.id;

    return jsonb_build_object('order_id', target_order.id, 'release_state', 'RELEASED', 'idempotent', true);
  end if;

  create temporary table flow_release_order_lines on commit drop as
  select
    ol.id as order_line_id,
    ol.menu_item_id,
    ol.recipe_version_id,
    ol.quantity,
    mi.station_id
  from public.order_lines ol
  join public.menu_items mi on mi.id = ol.menu_item_id
  where ol.org_id = target_order.org_id
    and ol.outlet_id = target_order.outlet_id
    and ol.order_id = target_order.id;

  if not exists (select 1 from flow_release_order_lines) then
    raise exception 'Order has no lines to release';
  end if;

  create temporary table flow_release_required_ingredients on commit drop as
  select
    rl.ingredient_id,
    sum(rl.quantity * fol.quantity)::numeric(12, 3) as required_quantity
  from flow_release_order_lines fol
  join public.recipe_lines rl on rl.recipe_version_id = fol.recipe_version_id
  group by rl.ingredient_id;

  for ingredient_record in
    select ingredient_id, required_quantity
    from flow_release_required_ingredients
  loop
    if public.flow_m3_available_quantity(target_order.outlet_id, ingredient_record.ingredient_id) < ingredient_record.required_quantity then
      raise exception 'Insufficient stock for kitchen release';
    end if;
  end loop;

  insert into public.inventory_ledger (
    org_id,
    outlet_id,
    ingredient_id,
    entry_type,
    quantity_delta,
    reference_type,
    reference_id,
    reason,
    created_by_user_id
  )
  select
    target_order.org_id,
    target_order.outlet_id,
    ingredient_id,
    'reservation',
    -required_quantity,
    'order',
    target_order.id,
    'Order inventory reservation at authorised release',
    actor_id
  from flow_release_required_ingredients;

  for ticket_record in
    select station_id
    from flow_release_order_lines
    where station_id is not null
    group by station_id
  loop
    insert into public.kitchen_tickets (
      org_id,
      outlet_id,
      order_id,
      station_id,
      status
    )
    values (
      target_order.org_id,
      target_order.outlet_id,
      target_order.id,
      ticket_record.station_id,
      'NEW'
    )
    returning id into new_ticket_id;

    insert into public.ticket_lines (
      org_id,
      outlet_id,
      kitchen_ticket_id,
      order_line_id,
      status
    )
    select
      target_order.org_id,
      target_order.outlet_id,
      new_ticket_id,
      fol.order_line_id,
      'NEW'
    from flow_release_order_lines fol
    where fol.station_id = ticket_record.station_id;
  end loop;

  update public.orders
  set release_state = 'RELEASED',
      released_at = now(),
      released_by_user_id = actor_id,
      fulfilment_state = 'RELEASED'
  where id = target_order.id;

  perform public.flow_v3_1_record_lifecycle_event(
    target_order.id,
    'ORDER_RELEASED_TO_KITCHEN',
    coalesce(target_order.release_state::text, 'NOT_RELEASED'),
    'RELEASED',
    'Authorised staff released QR pay-at-counter order after manual settlement',
    jsonb_build_object('release_policy', target_order.release_policy),
    'order.released_to_kitchen:' || target_order.id::text
  );

  insert into public.audit_events (
    org_id,
    outlet_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    before_data,
    after_data,
    reason
  )
  values (
    target_order.org_id,
    target_order.outlet_id,
    actor_id,
    'ORDER_RELEASED_TO_KITCHEN',
    'orders',
    target_order.id,
    jsonb_build_object('release_state', target_order.release_state),
    jsonb_build_object('release_state', 'RELEASED'),
    'Authorised release after manual external settlement'
  );

  insert into public.outbox_events (
    org_id,
    outlet_id,
    user_id,
    event_type,
    object_type,
    object_id,
    payload_summary,
    dedupe_key
  )
  values (
    target_order.org_id,
    target_order.outlet_id,
    actor_id,
    'order.released_to_kitchen',
    'orders',
    target_order.id,
    jsonb_build_object('release_state', 'RELEASED'),
    'order.released_to_kitchen:' || target_order.id::text
  )
  on conflict do nothing;

  return jsonb_build_object('order_id', target_order.id, 'release_state', 'RELEASED', 'idempotent', false);
end;
$$;

create or replace function public.flow_v3_1_transition_kitchen_ticket(
  target_ticket_id uuid,
  next_status public.kitchen_ticket_status
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  ticket public.kitchen_tickets%rowtype;
  target_order public.orders%rowtype;
  actor_role public.org_role;
  current_rank integer;
  next_rank integer;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if next_status not in ('ACCEPTED', 'PREPARING', 'READY') then
    raise exception 'Kitchen stops at READY for V3 lifecycle records';
  end if;

  select *
  into ticket
  from public.kitchen_tickets
  where id = target_ticket_id
  for update;

  if not found then
    raise exception 'Kitchen ticket not found';
  end if;

  select *
  into target_order
  from public.orders
  where id = ticket.order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if target_order.release_state is not null and target_order.release_state <> 'RELEASED' then
    raise exception 'Order has not been released to kitchen';
  end if;

  actor_role := public.flow_v3_1_require_outlet_role(
    ticket.outlet_id,
    array[
      'organisation_owner',
      'organisation_admin',
      'manager',
      'kitchen'
    ]::public.org_role[]
  );

  if actor_role = 'kitchen' and not exists (
    select 1
    from public.kitchen_station_memberships ksm
    where ksm.org_id = ticket.org_id
      and ksm.outlet_id = ticket.outlet_id
      and ksm.station_id = ticket.station_id
      and ksm.user_id = actor_id
      and ksm.revoked_at is null
  ) then
    raise exception 'Kitchen station access denied' using errcode = '42501';
  end if;

  current_rank := case ticket.status
    when 'NEW' then 1
    when 'ACCEPTED' then 2
    when 'PREPARING' then 3
    when 'READY' then 4
    else 0
  end;

  next_rank := case next_status
    when 'ACCEPTED' then 2
    when 'PREPARING' then 3
    when 'READY' then 4
    else 0
  end;

  if next_rank <> current_rank + 1 then
    raise exception 'Invalid kitchen ticket transition from % to %', ticket.status, next_status;
  end if;

  if next_status = 'PREPARING' and not exists (
    select 1
    from public.inventory_ledger il
    where il.reference_type = 'kitchen_ticket'
      and il.reference_id = ticket.id
      and il.entry_type = 'consumption'
  ) then
    insert into public.inventory_ledger (
      org_id,
      outlet_id,
      ingredient_id,
      entry_type,
      quantity_delta,
      reference_type,
      reference_id,
      reason,
      created_by_user_id
    )
    select
      ticket.org_id,
      ticket.outlet_id,
      rl.ingredient_id,
      'reservation_release',
      sum(rl.quantity * ol.quantity)::numeric(12, 3),
      'kitchen_ticket',
      ticket.id,
      'Release order reservation for preparation',
      actor_id
    from public.ticket_lines tl
    join public.order_lines ol on ol.id = tl.order_line_id
    join public.recipe_lines rl on rl.recipe_version_id = ol.recipe_version_id
    where tl.kitchen_ticket_id = ticket.id
    group by rl.ingredient_id;

    insert into public.inventory_ledger (
      org_id,
      outlet_id,
      ingredient_id,
      entry_type,
      quantity_delta,
      reference_type,
      reference_id,
      reason,
      created_by_user_id
    )
    select
      ticket.org_id,
      ticket.outlet_id,
      rl.ingredient_id,
      'consumption',
      -sum(rl.quantity * ol.quantity)::numeric(12, 3),
      'kitchen_ticket',
      ticket.id,
      'Consume recipe ingredients for preparation',
      actor_id
    from public.ticket_lines tl
    join public.order_lines ol on ol.id = tl.order_line_id
    join public.recipe_lines rl on rl.recipe_version_id = ol.recipe_version_id
    where tl.kitchen_ticket_id = ticket.id
    group by rl.ingredient_id;
  end if;

  update public.kitchen_tickets
  set status = next_status
  where id = ticket.id;

  update public.ticket_lines
  set status = next_status::text::public.ticket_line_status
  where kitchen_ticket_id = ticket.id;

  if next_status = 'PREPARING' then
    update public.orders
    set service_status = 'PREPARING'
    where id = ticket.order_id
      and service_status in ('SUBMITTED', 'PREPARING');
  elsif next_status = 'READY' and not exists (
    select 1
    from public.kitchen_tickets kt
    where kt.order_id = ticket.order_id
      and kt.id <> ticket.id
      and kt.status not in ('READY', 'COMPLETED')
  ) then
    update public.orders
    set service_status = 'READY',
        fulfilment_state = 'READY_FOR_HANDOFF',
        ready_for_handoff_at = coalesce(ready_for_handoff_at, now())
    where id = ticket.order_id;

    perform public.flow_v3_1_record_lifecycle_event(
      ticket.order_id,
      'READY_FOR_HANDOFF',
      coalesce(target_order.fulfilment_state::text, 'RELEASED'),
      'READY_FOR_HANDOFF',
      'All required kitchen work is READY',
      jsonb_build_object('ticket_id', ticket.id),
      'order.ready_for_handoff:' || ticket.order_id::text
    );
  end if;

  insert into public.audit_events (
    org_id,
    outlet_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    before_data,
    after_data
  )
  values (
    ticket.org_id,
    ticket.outlet_id,
    actor_id,
    'KITCHEN_TICKET_STATUS_CHANGED',
    'kitchen_tickets',
    ticket.id,
    jsonb_build_object('status', ticket.status),
    jsonb_build_object('status', next_status)
  );

  insert into public.outbox_events (
    org_id,
    outlet_id,
    user_id,
    event_type,
    object_type,
    object_id,
    payload_summary,
    dedupe_key
  )
  values (
    ticket.org_id,
    ticket.outlet_id,
    actor_id,
    'kitchen_ticket.status_changed',
    'kitchen_tickets',
    ticket.id,
    jsonb_build_object('status', next_status, 'order_id', ticket.order_id),
    'kitchen_ticket.status_changed:' || ticket.id::text || ':' || next_status::text
  )
  on conflict do nothing;

  return jsonb_build_object('ticket_id', ticket.id, 'status', next_status, 'order_id', ticket.order_id);
end;
$$;

create or replace function public.flow_v3_1_mark_order_served(target_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_order public.orders%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into target_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_order.outlet_id,
    array[
      'organisation_owner',
      'organisation_admin',
      'manager',
      'waiter'
    ]::public.org_role[]
  );

  if target_order.fulfilment_state = 'SERVED' then
    return jsonb_build_object('order_id', target_order.id, 'fulfilment_state', 'SERVED', 'closure_state', target_order.closure_state, 'idempotent', true);
  end if;

  if target_order.order_channel not in ('table', 'qr') then
    raise exception 'Served fulfilment is only available for dine-in table service';
  end if;

  if target_order.fulfilment_state <> 'READY_FOR_HANDOFF' then
    raise exception 'Order is not ready for handoff';
  end if;

  if exists (
    select 1
    from public.kitchen_tickets kt
    where kt.org_id = target_order.org_id
      and kt.order_id = target_order.id
      and kt.status not in ('READY', 'COMPLETED')
  ) then
    raise exception 'All kitchen work must be READY before service';
  end if;

  update public.orders
  set fulfilment_state = 'SERVED',
      fulfilled_at = now(),
      fulfilled_by_user_id = actor_id,
      service_status = 'SERVED_OR_COLLECTED',
      closure_state = 'COMPLETE',
      closed_at = now(),
      closed_by_user_id = actor_id,
      closure_reason = 'Closed after dine-in served fulfilment'
  where id = target_order.id;

  perform public.flow_v3_1_record_lifecycle_event(
    target_order.id,
    'ORDER_SERVED',
    target_order.fulfilment_state::text,
    'SERVED',
    'Dine-in order served by authorised front-of-house user',
    jsonb_build_object('closure_state', 'COMPLETE'),
    'order.served:' || target_order.id::text
  );

  insert into public.audit_events (
    org_id,
    outlet_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    before_data,
    after_data,
    reason
  )
  values (
    target_order.org_id,
    target_order.outlet_id,
    actor_id,
    'ORDER_SERVED',
    'orders',
    target_order.id,
    jsonb_build_object('fulfilment_state', target_order.fulfilment_state, 'closure_state', target_order.closure_state),
    jsonb_build_object('fulfilment_state', 'SERVED', 'closure_state', 'COMPLETE'),
    'Dine-in fulfilment completed by front-of-house'
  );

  insert into public.outbox_events (
    org_id,
    outlet_id,
    user_id,
    event_type,
    object_type,
    object_id,
    payload_summary,
    dedupe_key
  )
  values (
    target_order.org_id,
    target_order.outlet_id,
    actor_id,
    'order.served',
    'orders',
    target_order.id,
    jsonb_build_object('fulfilment_state', 'SERVED', 'closure_state', 'COMPLETE'),
    'order.served:' || target_order.id::text
  )
  on conflict do nothing;

  return jsonb_build_object('order_id', target_order.id, 'fulfilment_state', 'SERVED', 'closure_state', 'COMPLETE', 'idempotent', false);
end;
$$;

create or replace function public.flow_v3_1_mark_order_collected(target_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_order public.orders%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into target_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_order.outlet_id,
    array[
      'organisation_owner',
      'organisation_admin',
      'manager',
      'cashier',
      'waiter'
    ]::public.org_role[]
  );

  if target_order.fulfilment_state = 'COLLECTED' then
    return jsonb_build_object('order_id', target_order.id, 'fulfilment_state', 'COLLECTED', 'closure_state', target_order.closure_state, 'idempotent', true);
  end if;

  if target_order.order_channel not in ('counter', 'online_pickup') then
    raise exception 'Collected fulfilment is only available for takeaway or pickup channels';
  end if;

  if target_order.fulfilment_state <> 'READY_FOR_HANDOFF' then
    raise exception 'Order is not ready for collection';
  end if;

  update public.orders
  set fulfilment_state = 'COLLECTED',
      fulfilled_at = now(),
      fulfilled_by_user_id = actor_id,
      service_status = 'SERVED_OR_COLLECTED',
      closure_state = 'COMPLETE',
      closed_at = now(),
      closed_by_user_id = actor_id,
      closure_reason = 'Closed after takeaway/pickup collection'
  where id = target_order.id;

  perform public.flow_v3_1_record_lifecycle_event(
    target_order.id,
    'ORDER_COLLECTED',
    target_order.fulfilment_state::text,
    'COLLECTED',
    'Takeaway or pickup order collected by authorised user',
    jsonb_build_object('closure_state', 'COMPLETE'),
    'order.collected:' || target_order.id::text
  );

  insert into public.audit_events (
    org_id,
    outlet_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    before_data,
    after_data,
    reason
  )
  values (
    target_order.org_id,
    target_order.outlet_id,
    actor_id,
    'ORDER_COLLECTED',
    'orders',
    target_order.id,
    jsonb_build_object('fulfilment_state', target_order.fulfilment_state, 'closure_state', target_order.closure_state),
    jsonb_build_object('fulfilment_state', 'COLLECTED', 'closure_state', 'COMPLETE'),
    'Takeaway/pickup fulfilment completed by authorised front-of-house'
  );

  insert into public.outbox_events (
    org_id,
    outlet_id,
    user_id,
    event_type,
    object_type,
    object_id,
    payload_summary,
    dedupe_key
  )
  values (
    target_order.org_id,
    target_order.outlet_id,
    actor_id,
    'order.collected',
    'orders',
    target_order.id,
    jsonb_build_object('fulfilment_state', 'COLLECTED', 'closure_state', 'COMPLETE'),
    'order.collected:' || target_order.id::text
  )
  on conflict do nothing;

  return jsonb_build_object('order_id', target_order.id, 'fulfilment_state', 'COLLECTED', 'closure_state', 'COMPLETE', 'idempotent', false);
end;
$$;

create or replace function public.flow_m4_public_order_status(public_order_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  target_order public.orders%rowtype;
  safe_status text;
  table_label text;
  ticket_progress integer;
begin
  if public_order_token is null or length(btrim(public_order_token)) < 32 then
    return jsonb_build_object('found', false);
  end if;

  select *
  into target_order
  from public.orders o
  where o.public_tracking_token = public_order_token
    and o.public_tracking_expires_at > now()
  limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select min(
    case kt.status
      when 'NEW' then 1
      when 'ACCEPTED' then 2
      when 'PREPARING' then 3
      when 'READY' then 4
      when 'COMPLETED' then 5
      else 1
    end
  )
  into ticket_progress
  from public.kitchen_tickets kt
  where kt.org_id = target_order.org_id
    and kt.order_id = target_order.id;

  safe_status := case
    when target_order.service_status = 'CANCELLED' or target_order.closure_state = 'CANCELLED' then 'UNAVAILABLE'
    when target_order.fulfilment_state in ('SERVED', 'COLLECTED') or target_order.closure_state = 'COMPLETE' then 'ORDER_COMPLETE'
    when target_order.release_state = 'NOT_RELEASED' then 'ORDER_RECEIVED'
    when ticket_progress = 1 then 'ORDER_RECEIVED'
    when ticket_progress = 2 then 'ACCEPTED'
    when ticket_progress = 3 then 'PREPARING'
    when ticket_progress = 4 then 'READY'
    when target_order.lifecycle_version = 1 and target_order.service_status in ('SERVED_OR_COLLECTED', 'COMPLETED') then 'ORDER_COMPLETE'
    when target_order.lifecycle_version = 1 and ticket_progress = 5 then 'ORDER_COMPLETE'
    when target_order.service_status = 'PREPARING' then 'PREPARING'
    when target_order.service_status = 'READY' then 'READY'
    else 'ORDER_RECEIVED'
  end;

  select ts.table_label
  into table_label
  from public.table_sessions ts
  where ts.id = target_order.table_session_id;

  return jsonb_build_object(
    'found', true,
    'status', safe_status,
    'table_label', table_label,
    'submitted_at', target_order.created_at,
    'payment_label', 'Pay at counter'
  );
end;
$$;

-- Only Organisation Owner may activate V3.1 lifecycle mode for an outlet.
-- Organisation Admin is explicitly excluded: activating V3_1 alters
-- customer-facing order handling behaviour and billing/compliance exposure
-- for the entire outlet. This is a principal-level decision reserved for
-- the registered owner of the organisation.
-- This function is intentionally ONE-WAY: LEGACY → V3_1 only.
-- "Lifecycle mode cannot be downgraded after V3.1 activation."
-- A future remediation path would require a separate, explicitly designed RPC.
create or replace function public.flow_v3_1_enable_outlet_v3_1(
  target_outlet_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.org_role;
  current_mode public.outlet_lifecycle_mode;
  target_org_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- flow_m3_require_role rejects any role not in the array, so passing only
  -- organisation_owner here means admins receive "Not authorised" before
  -- reaching this function body.
  actor_role := public.flow_v3_1_require_outlet_role(
    target_outlet_id,
    array['organisation_owner']::public.org_role[]
  );

  -- Defence in depth: lifecycle mode activation is Organisation Owner authority only.
  -- Organisation Admin is denied even if the helper were later extended.
  if actor_role <> 'organisation_owner' then
    raise exception 'Lifecycle mode activation requires Organisation Owner authority'
      using errcode = '42501';
  end if;

  select lifecycle_mode, org_id
  into current_mode, target_org_id
  from public.outlets
  where id = target_outlet_id;

  if not found then
    raise exception 'Outlet not found';
  end if;

  -- Already V3_1: idempotent — no duplicate audit event.
  if current_mode = 'V3_1' then
    return jsonb_build_object(
      'outlet_id', target_outlet_id,
      'mode', 'V3_1',
      'changed', false
    );
  end if;

  -- One-way activation: LEGACY → V3_1 only.
  -- The function accepts no mode argument, so downgrade is a compile-time
  -- impossibility. The former two-argument mode-switch RPC has been removed;
  -- this is the sole activation path.
  update public.outlets
  set lifecycle_mode = 'V3_1'
  where id = target_outlet_id;

  insert into public.audit_events (
    org_id,
    outlet_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    before_data,
    after_data,
    reason
  )
  values (
    target_org_id,
    target_outlet_id,
    actor_id,
    'OUTLET_LIFECYCLE_MODE_CHANGED',
    'outlets',
    target_outlet_id,
    jsonb_build_object('lifecycle_mode', 'LEGACY'),
    jsonb_build_object('lifecycle_mode', 'V3_1'),
    'Organisation Owner activated V3.1 lifecycle kernel for this outlet'
  );

  return jsonb_build_object(
    'outlet_id', target_outlet_id,
    'mode', 'V3_1',
    'changed', true
  );
end;
$$;

create or replace function public.flow_m3_create_table_order(
  target_table_session_id uuid,
  order_items jsonb,
  request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return public.flow_v3_1_create_table_order(target_table_session_id, order_items, request_key);
end;
$$;

-- Internal compatibility function: preserves the migration-007 kitchen ticket
-- transition behaviour for LEGACY outlets and pre-V3.1 lifecycle records.
-- Allows READY → COMPLETED so the currently deployed app can drain active legacy
-- tickets safely during the migration-to-deploy window.
-- NOT callable externally — no execute grant is issued to any role.
create or replace function public.flow_m3_legacy_transition_kitchen_ticket_v1(
  target_ticket_id uuid,
  next_status public.kitchen_ticket_status
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  ticket public.kitchen_tickets%rowtype;
  actor_role public.org_role;
  current_rank integer;
  next_rank integer;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into ticket
  from public.kitchen_tickets
  where id = target_ticket_id
  for update;

  if not found then
    raise exception 'Kitchen ticket not found';
  end if;

  actor_role := public.flow_m3_require_role(
    ticket.org_id,
    array[
      'organisation_owner',
      'organisation_admin',
      'manager',
      'kitchen'
    ]::public.org_role[]
  );

  if actor_role = 'kitchen' and not exists (
    select 1
    from public.kitchen_station_memberships ksm
    where ksm.org_id = ticket.org_id
      and ksm.outlet_id = ticket.outlet_id
      and ksm.station_id = ticket.station_id
      and ksm.user_id = actor_id
      and ksm.revoked_at is null
  ) then
    raise exception 'Kitchen station access denied' using errcode = '42501';
  end if;

  current_rank := case ticket.status
    when 'NEW' then 1
    when 'ACCEPTED' then 2
    when 'PREPARING' then 3
    when 'READY' then 4
    when 'COMPLETED' then 5
    else 0
  end;

  next_rank := case next_status
    when 'NEW' then 1
    when 'ACCEPTED' then 2
    when 'PREPARING' then 3
    when 'READY' then 4
    when 'COMPLETED' then 5
    else 0
  end;

  if next_rank <> current_rank + 1 then
    raise exception 'Invalid kitchen ticket transition from % to %', ticket.status, next_status;
  end if;

  if next_status = 'PREPARING' and not exists (
    select 1
    from public.inventory_ledger il
    where il.reference_type = 'kitchen_ticket'
      and il.reference_id = ticket.id
      and il.entry_type = 'consumption'
  ) then
    insert into public.inventory_ledger (
      org_id, outlet_id, ingredient_id, entry_type,
      quantity_delta, reference_type, reference_id, reason, created_by_user_id
    )
    select
      ticket.org_id, ticket.outlet_id, rl.ingredient_id,
      'reservation_release',
      sum(rl.quantity * ol.quantity)::numeric(12, 3),
      'kitchen_ticket', ticket.id,
      'Release order reservation for preparation', actor_id
    from public.ticket_lines tl
    join public.order_lines ol on ol.id = tl.order_line_id
    join public.recipe_lines rl on rl.recipe_version_id = ol.recipe_version_id
    where tl.kitchen_ticket_id = ticket.id
    group by rl.ingredient_id;

    insert into public.inventory_ledger (
      org_id, outlet_id, ingredient_id, entry_type,
      quantity_delta, reference_type, reference_id, reason, created_by_user_id
    )
    select
      ticket.org_id, ticket.outlet_id, rl.ingredient_id,
      'consumption',
      -sum(rl.quantity * ol.quantity)::numeric(12, 3),
      'kitchen_ticket', ticket.id,
      'Consume recipe ingredients for preparation', actor_id
    from public.ticket_lines tl
    join public.order_lines ol on ol.id = tl.order_line_id
    join public.recipe_lines rl on rl.recipe_version_id = ol.recipe_version_id
    where tl.kitchen_ticket_id = ticket.id
    group by rl.ingredient_id;
  end if;

  update public.kitchen_tickets
  set status = next_status
  where id = ticket.id;

  update public.ticket_lines
  set status = next_status::text::public.ticket_line_status
  where kitchen_ticket_id = ticket.id;

  if next_status = 'PREPARING' then
    update public.orders
    set service_status = 'PREPARING'
    where id = ticket.order_id
      and service_status in ('SUBMITTED', 'PREPARING');
  elsif next_status = 'READY' and not exists (
    select 1 from public.kitchen_tickets kt
    where kt.order_id = ticket.order_id
      and kt.id <> ticket.id
      and kt.status not in ('READY', 'COMPLETED')
  ) then
    update public.orders
    set service_status = 'READY'
    where id = ticket.order_id;
  elsif next_status = 'COMPLETED' and not exists (
    select 1 from public.kitchen_tickets kt
    where kt.order_id = ticket.order_id
      and kt.id <> ticket.id
      and kt.status <> 'COMPLETED'
  ) then
    update public.orders
    set service_status = 'SERVED_OR_COLLECTED'
    where id = ticket.order_id
      and service_status <> 'COMPLETED';
  end if;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, before_data, after_data
  )
  values (
    ticket.org_id, ticket.outlet_id, actor_id,
    'KITCHEN_TICKET_STATUS_CHANGED', 'kitchen_tickets', ticket.id,
    jsonb_build_object('status', ticket.status),
    jsonb_build_object('status', next_status)
  );

  insert into public.outbox_events (
    org_id, outlet_id, user_id, event_type, object_type, object_id, payload_summary, dedupe_key
  )
  values (
    ticket.org_id, ticket.outlet_id, actor_id,
    'kitchen_ticket.status_changed', 'kitchen_tickets', ticket.id,
    jsonb_build_object('status', next_status, 'order_id', ticket.order_id),
    'kitchen_ticket.status_changed:' || ticket.id::text || ':' || next_status::text
  )
  on conflict do nothing;

  return jsonb_build_object('ticket_id', ticket.id, 'status', next_status, 'order_id', ticket.order_id);
end;
$$;

-- Routes to the appropriate implementation based on outlet lifecycle mode and
-- the order's lifecycle_version. Both checks are required: a V3_1 outlet can
-- still have pre-V3.1 orders (created before activation) that must be allowed
-- to reach COMPLETED under the legacy path.
--
-- LEGACY outlet OR lifecycle_version < 3  → flow_m3_legacy_transition_kitchen_ticket_v1
--   Preserves migration-007 behaviour: READY → COMPLETED allowed.
-- V3_1 outlet AND lifecycle_version >= 3  → flow_v3_1_transition_kitchen_ticket
--   Enforces V3.1 policy: kitchen stops at READY; COMPLETED rejected.
create or replace function public.flow_m3_transition_kitchen_ticket(
  target_ticket_id uuid,
  next_status public.kitchen_ticket_status
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  outlet_mode public.outlet_lifecycle_mode;
  ticket_lifecycle_version integer;
begin
  select o.lifecycle_mode, ord.lifecycle_version
  into outlet_mode, ticket_lifecycle_version
  from public.kitchen_tickets kt
  join public.outlets o on o.id = kt.outlet_id
  join public.orders ord on ord.id = kt.order_id
  where kt.id = target_ticket_id;

  if outlet_mode = 'V3_1' and ticket_lifecycle_version >= 3 then
    return public.flow_v3_1_transition_kitchen_ticket(target_ticket_id, next_status);
  end if;

  return public.flow_m3_legacy_transition_kitchen_ticket_v1(target_ticket_id, next_status);
end;
$$;

create or replace function public.flow_m3_demo_manual_settlement(target_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return public.flow_v3_1_confirm_manual_settlement(target_order_id);
end;
$$;

revoke all on function public.flow_v3_1_record_lifecycle_event(uuid, text, text, text, text, jsonb, text) from public;
revoke all on function public.flow_v3_1_record_lifecycle_event(uuid, text, text, text, text, jsonb, text) from anon;
revoke all on function public.flow_v3_1_record_lifecycle_event(uuid, text, text, text, text, jsonb, text) from authenticated;

revoke all on function public.flow_v3_1_require_outlet_role(uuid, public.org_role[]) from public;
revoke all on function public.flow_v3_1_require_outlet_role(uuid, public.org_role[]) from anon;
revoke all on function public.flow_v3_1_require_outlet_role(uuid, public.org_role[]) from authenticated;

revoke all on function public.flow_v3_1_create_table_order(uuid, jsonb, text) from public;
revoke all on function public.flow_v3_1_create_table_order(uuid, jsonb, text) from anon;
revoke all on function public.flow_v3_1_create_table_order(uuid, jsonb, text) from authenticated;
grant execute on function public.flow_v3_1_create_table_order(uuid, jsonb, text) to authenticated;

revoke all on function public.flow_v3_1_confirm_manual_settlement(uuid) from public;
revoke all on function public.flow_v3_1_confirm_manual_settlement(uuid) from anon;
revoke all on function public.flow_v3_1_confirm_manual_settlement(uuid) from authenticated;
grant execute on function public.flow_v3_1_confirm_manual_settlement(uuid) to authenticated;

revoke all on function public.flow_v3_1_release_order_to_kitchen(uuid) from public;
revoke all on function public.flow_v3_1_release_order_to_kitchen(uuid) from anon;
revoke all on function public.flow_v3_1_release_order_to_kitchen(uuid) from authenticated;
grant execute on function public.flow_v3_1_release_order_to_kitchen(uuid) to authenticated;

revoke all on function public.flow_v3_1_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) from public;
revoke all on function public.flow_v3_1_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) from anon;
revoke all on function public.flow_v3_1_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) from authenticated;
grant execute on function public.flow_v3_1_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) to authenticated;

revoke all on function public.flow_v3_1_mark_order_served(uuid) from public;
revoke all on function public.flow_v3_1_mark_order_served(uuid) from anon;
revoke all on function public.flow_v3_1_mark_order_served(uuid) from authenticated;
grant execute on function public.flow_v3_1_mark_order_served(uuid) to authenticated;

revoke all on function public.flow_v3_1_mark_order_collected(uuid) from public;
revoke all on function public.flow_v3_1_mark_order_collected(uuid) from anon;
revoke all on function public.flow_v3_1_mark_order_collected(uuid) from authenticated;
grant execute on function public.flow_v3_1_mark_order_collected(uuid) to authenticated;

revoke all on function public.flow_v3_1_enable_outlet_v3_1(uuid) from public;
revoke all on function public.flow_v3_1_enable_outlet_v3_1(uuid) from anon;
revoke all on function public.flow_v3_1_enable_outlet_v3_1(uuid) from authenticated;
grant execute on function public.flow_v3_1_enable_outlet_v3_1(uuid) to authenticated;

revoke all on function public.flow_m3_legacy_transition_kitchen_ticket_v1(uuid, public.kitchen_ticket_status) from public;
revoke all on function public.flow_m3_legacy_transition_kitchen_ticket_v1(uuid, public.kitchen_ticket_status) from anon;
revoke all on function public.flow_m3_legacy_transition_kitchen_ticket_v1(uuid, public.kitchen_ticket_status) from authenticated;

revoke all on function public.flow_m3_create_table_order(uuid, jsonb, text) from public;
revoke all on function public.flow_m3_create_table_order(uuid, jsonb, text) from anon;
revoke all on function public.flow_m3_create_table_order(uuid, jsonb, text) from authenticated;
grant execute on function public.flow_m3_create_table_order(uuid, jsonb, text) to authenticated;

revoke all on function public.flow_m3_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) from public;
revoke all on function public.flow_m3_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) from anon;
revoke all on function public.flow_m3_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) from authenticated;
grant execute on function public.flow_m3_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) to authenticated;

revoke all on function public.flow_m3_demo_manual_settlement(uuid) from public;
revoke all on function public.flow_m3_demo_manual_settlement(uuid) from anon;
revoke all on function public.flow_m3_demo_manual_settlement(uuid) from authenticated;
grant execute on function public.flow_m3_demo_manual_settlement(uuid) to authenticated;

revoke all on function public.flow_m4_create_qr_table_order(text, jsonb, text) from public;
revoke all on function public.flow_m4_create_qr_table_order(text, jsonb, text) from anon;
revoke all on function public.flow_m4_create_qr_table_order(text, jsonb, text) from authenticated;
grant execute on function public.flow_m4_create_qr_table_order(text, jsonb, text) to anon, authenticated;

revoke all on function public.flow_m4_public_order_status(text) from public;
revoke all on function public.flow_m4_public_order_status(text) from anon;
revoke all on function public.flow_m4_public_order_status(text) from authenticated;
grant execute on function public.flow_m4_public_order_status(text) to anon, authenticated;
