-- V3.3: Controlled Menu Management.
-- Adds is_sold_out / sold_out_reason to menu_items.
-- Extends public availability and order submission to gate on is_sold_out.
-- Adds authenticated management RPCs for Owner/Admin/Manager roles.
--
-- Non-regression guarantees:
--   Migrations 001-011 are not modified.
--   flow_v3_1_* functions are not modified.
--   order_lines, inventory_ledger, kitchen_tickets, public tokens are untouched.
--   Existing public_menu_token values are never regenerated.

-- ── 1. Extend menu_items ──────────────────────────────────────────────────────

alter table public.menu_items
  add column if not exists is_sold_out boolean not null default false,
  add column if not exists sold_out_reason text null;

-- ── 2. Extend public item availability (short-circuit on is_sold_out) ─────────
--    Converted from language sql to language plpgsql for early-return control flow.
--    CREATE OR REPLACE preserves existing anon/authenticated grants.

create or replace function public.flow_m4_public_item_available(
  target_outlet_id uuid,
  target_menu_item_id uuid,
  requested_quantity integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if exists (
    select 1
    from public.menu_items
    where id = target_menu_item_id
      and outlet_id = target_outlet_id
      and is_sold_out
  ) then
    return false;
  end if;

  return coalesce((
    select bool_and(
      public.flow_m3_available_quantity(target_outlet_id, required.ingredient_id)
        >= required.required_quantity
    )
    from (
      select
        rl.ingredient_id,
        sum(rl.quantity * requested_quantity)::numeric(12, 3) as required_quantity
      from public.recipe_versions rv
      join public.recipe_lines rl on rl.recipe_version_id = rv.id
      where rv.menu_item_id = target_menu_item_id
        and rv.outlet_id = target_outlet_id
        and rv.is_active
      group by rl.ingredient_id
    ) required
  ), false);
end;
$$;

revoke all on function public.flow_m4_public_item_available(uuid, uuid, integer) from public;
revoke all on function public.flow_m4_public_item_available(uuid, uuid, integer) from anon;
revoke all on function public.flow_m4_public_item_available(uuid, uuid, integer) from authenticated;
grant execute on function public.flow_m4_public_item_available(uuid, uuid, integer) to anon, authenticated;

-- ── 3. Gate public order submission on is_sold_out ────────────────────────────
--    Adds AND NOT mi.is_sold_out to the item lookup WHERE clause.
--    Full function body reproduced from V3.1 lifecycle kernel (migration 010).
--    flow_m4_create_outlet_qr_order (V3.2) delegates here; one fix covers both.

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

  -- V3.3: AND NOT mi.is_sold_out prevents ordering of sold-out items.
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
    and not mi.is_sold_out
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

revoke all on function public.flow_m4_create_qr_table_order(text, jsonb, text) from public;
revoke all on function public.flow_m4_create_qr_table_order(text, jsonb, text) from anon;
revoke all on function public.flow_m4_create_qr_table_order(text, jsonb, text) from authenticated;
grant execute on function public.flow_m4_create_qr_table_order(text, jsonb, text) to anon, authenticated;

-- ── 4. Management read RPC ────────────────────────────────────────────────────
--    Owner/Admin/Manager: returns all active categories with their active items,
--    station list, and all V3.3 management fields.

create or replace function public.flow_v3_3_get_outlet_menu(target_outlet_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  target_outlet public.outlets%rowtype;
begin
  if target_outlet_id is null then
    raise exception 'Outlet required' using errcode = '22023';
  end if;

  select * into target_outlet
  from public.outlets
  where id = target_outlet_id
    and is_active;

  if not found then
    raise exception 'Outlet not found' using errcode = '22023';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_outlet_id,
    array['organisation_owner', 'organisation_admin', 'manager']::public.org_role[]
  );

  return jsonb_build_object(
    'outlet_id', target_outlet.id,
    'stations', coalesce((
      select jsonb_agg(jsonb_build_object('id', ks.id, 'name', ks.name) order by ks.name)
      from public.kitchen_stations ks
      where ks.outlet_id = target_outlet_id
        and ks.is_active
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', mc.id,
          'name', mc.name,
          'sort_order', mc.sort_order,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', mi.id,
                'name', mi.name,
                'description', mi.description,
                'price_sen', mi.price_sen,
                'is_public', mi.is_public,
                'is_sold_out', mi.is_sold_out,
                'sold_out_reason', mi.sold_out_reason,
                'station_id', mi.station_id,
                'station_name', ks.name
              )
              order by mi.name
            )
            from public.menu_items mi
            left join public.kitchen_stations ks on ks.id = mi.station_id
            where mi.category_id = mc.id
              and mi.is_active
          ), '[]'::jsonb)
        )
        order by mc.sort_order, mc.name
      )
      from public.menu_categories mc
      where mc.outlet_id = target_outlet_id
        and mc.is_active
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.flow_v3_3_get_outlet_menu(uuid) from public;
revoke all on function public.flow_v3_3_get_outlet_menu(uuid) from anon;
revoke all on function public.flow_v3_3_get_outlet_menu(uuid) from authenticated;
grant execute on function public.flow_v3_3_get_outlet_menu(uuid) to authenticated;

-- ── 5. Create category (Owner/Admin) ─────────────────────────────────────────

create or replace function public.flow_v3_3_create_menu_category(
  target_outlet_id uuid,
  p_name text,
  p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_outlet public.outlets%rowtype;
  new_category_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Category name is required' using errcode = '22023';
  end if;

  if length(btrim(p_name)) > 100 then
    raise exception 'Category name is too long' using errcode = '22023';
  end if;

  select * into target_outlet
  from public.outlets
  where id = target_outlet_id and is_active;

  if not found then
    raise exception 'Outlet not found' using errcode = '22023';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_outlet_id,
    array['organisation_owner', 'organisation_admin']::public.org_role[]
  );

  insert into public.menu_categories (org_id, outlet_id, name, sort_order)
  values (target_outlet.org_id, target_outlet_id, btrim(p_name), coalesce(p_sort_order, 0))
  returning id into new_category_id;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, after_data
  )
  values (
    target_outlet.org_id,
    target_outlet_id,
    actor_id,
    'MENU_CATEGORY_CREATED',
    'menu_categories',
    new_category_id,
    jsonb_build_object('name', btrim(p_name), 'sort_order', coalesce(p_sort_order, 0))
  );

  return jsonb_build_object('category_id', new_category_id, 'name', btrim(p_name));
end;
$$;

revoke all on function public.flow_v3_3_create_menu_category(uuid, text, integer) from public;
revoke all on function public.flow_v3_3_create_menu_category(uuid, text, integer) from anon;
revoke all on function public.flow_v3_3_create_menu_category(uuid, text, integer) from authenticated;
grant execute on function public.flow_v3_3_create_menu_category(uuid, text, integer) to authenticated;

-- ── 6. Update category (Owner/Admin) ─────────────────────────────────────────

create or replace function public.flow_v3_3_update_menu_category(
  target_outlet_id uuid,
  target_category_id uuid,
  p_name text,
  p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_outlet public.outlets%rowtype;
  target_category public.menu_categories%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Category name is required' using errcode = '22023';
  end if;

  if length(btrim(p_name)) > 100 then
    raise exception 'Category name is too long' using errcode = '22023';
  end if;

  select * into target_outlet
  from public.outlets
  where id = target_outlet_id and is_active;

  if not found then
    raise exception 'Outlet not found' using errcode = '22023';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_outlet_id,
    array['organisation_owner', 'organisation_admin']::public.org_role[]
  );

  select * into target_category
  from public.menu_categories
  where id = target_category_id
    and outlet_id = target_outlet_id
    and is_active
  for update;

  if not found then
    raise exception 'Category not found' using errcode = '22023';
  end if;

  update public.menu_categories
  set name = btrim(p_name),
      sort_order = coalesce(p_sort_order, target_category.sort_order)
  where id = target_category_id;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, before_data, after_data
  )
  values (
    target_outlet.org_id,
    target_outlet_id,
    actor_id,
    'MENU_CATEGORY_UPDATED',
    'menu_categories',
    target_category_id,
    jsonb_build_object('name', target_category.name, 'sort_order', target_category.sort_order),
    jsonb_build_object('name', btrim(p_name), 'sort_order', coalesce(p_sort_order, target_category.sort_order))
  );

  return jsonb_build_object('category_id', target_category_id, 'name', btrim(p_name));
end;
$$;

revoke all on function public.flow_v3_3_update_menu_category(uuid, uuid, text, integer) from public;
revoke all on function public.flow_v3_3_update_menu_category(uuid, uuid, text, integer) from anon;
revoke all on function public.flow_v3_3_update_menu_category(uuid, uuid, text, integer) from authenticated;
grant execute on function public.flow_v3_3_update_menu_category(uuid, uuid, text, integer) to authenticated;

-- ── 7. Archive category (Owner/Admin; blocked if active items remain) ─────────

create or replace function public.flow_v3_3_archive_menu_category(
  target_outlet_id uuid,
  target_category_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_outlet public.outlets%rowtype;
  target_category public.menu_categories%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into target_outlet
  from public.outlets
  where id = target_outlet_id and is_active;

  if not found then
    raise exception 'Outlet not found' using errcode = '22023';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_outlet_id,
    array['organisation_owner', 'organisation_admin']::public.org_role[]
  );

  select * into target_category
  from public.menu_categories
  where id = target_category_id
    and outlet_id = target_outlet_id
    and is_active
  for update;

  if not found then
    raise exception 'Category not found' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.menu_items
    where category_id = target_category_id and is_active
  ) then
    raise exception 'Archive all active items before archiving this category' using errcode = '23000';
  end if;

  update public.menu_categories
  set is_active = false
  where id = target_category_id;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, before_data, after_data
  )
  values (
    target_outlet.org_id,
    target_outlet_id,
    actor_id,
    'MENU_CATEGORY_ARCHIVED',
    'menu_categories',
    target_category_id,
    jsonb_build_object('name', target_category.name, 'is_active', true),
    jsonb_build_object('name', target_category.name, 'is_active', false)
  );

  return jsonb_build_object('category_id', target_category_id, 'archived', true);
end;
$$;

revoke all on function public.flow_v3_3_archive_menu_category(uuid, uuid) from public;
revoke all on function public.flow_v3_3_archive_menu_category(uuid, uuid) from anon;
revoke all on function public.flow_v3_3_archive_menu_category(uuid, uuid) from authenticated;
grant execute on function public.flow_v3_3_archive_menu_category(uuid, uuid) to authenticated;

-- ── 8. Create item (Owner/Admin) ──────────────────────────────────────────────

create or replace function public.flow_v3_3_create_menu_item(
  target_outlet_id uuid,
  p_category_id uuid,
  p_name text,
  p_description text,
  p_price_sen bigint,
  p_is_public boolean,
  p_station_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_outlet public.outlets%rowtype;
  new_item_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Item name is required' using errcode = '22023';
  end if;

  if length(btrim(p_name)) > 200 then
    raise exception 'Item name is too long' using errcode = '22023';
  end if;

  if p_price_sen is null or p_price_sen < 0 then
    raise exception 'Price must be zero or positive' using errcode = '22023';
  end if;

  select * into target_outlet
  from public.outlets
  where id = target_outlet_id and is_active;

  if not found then
    raise exception 'Outlet not found' using errcode = '22023';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_outlet_id,
    array['organisation_owner', 'organisation_admin']::public.org_role[]
  );

  if not exists (
    select 1 from public.menu_categories
    where id = p_category_id
      and outlet_id = target_outlet_id
      and is_active
  ) then
    raise exception 'Category not found or not available' using errcode = '22023';
  end if;

  if p_station_id is not null and not exists (
    select 1 from public.kitchen_stations
    where id = p_station_id
      and outlet_id = target_outlet_id
      and is_active
  ) then
    raise exception 'Station not found or not available' using errcode = '22023';
  end if;

  insert into public.menu_items (
    org_id, outlet_id, category_id, station_id,
    name, description, price_sen, is_public
  )
  values (
    target_outlet.org_id,
    target_outlet_id,
    p_category_id,
    p_station_id,
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_price_sen,
    coalesce(p_is_public, true)
  )
  returning id into new_item_id;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, after_data
  )
  values (
    target_outlet.org_id,
    target_outlet_id,
    actor_id,
    'MENU_ITEM_CREATED',
    'menu_items',
    new_item_id,
    jsonb_build_object(
      'name', btrim(p_name),
      'price_sen', p_price_sen,
      'is_public', coalesce(p_is_public, true),
      'category_id', p_category_id
    )
  );

  return jsonb_build_object('item_id', new_item_id, 'name', btrim(p_name));
end;
$$;

revoke all on function public.flow_v3_3_create_menu_item(uuid, uuid, text, text, bigint, boolean, uuid) from public;
revoke all on function public.flow_v3_3_create_menu_item(uuid, uuid, text, text, bigint, boolean, uuid) from anon;
revoke all on function public.flow_v3_3_create_menu_item(uuid, uuid, text, text, bigint, boolean, uuid) from authenticated;
grant execute on function public.flow_v3_3_create_menu_item(uuid, uuid, text, text, bigint, boolean, uuid) to authenticated;

-- ── 9. Update item (Owner/Admin; all editable fields) ────────────────────────

create or replace function public.flow_v3_3_update_menu_item(
  target_outlet_id uuid,
  target_item_id uuid,
  p_name text,
  p_description text,
  p_price_sen bigint,
  p_is_public boolean,
  p_station_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_outlet public.outlets%rowtype;
  target_item public.menu_items%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Item name is required' using errcode = '22023';
  end if;

  if length(btrim(p_name)) > 200 then
    raise exception 'Item name is too long' using errcode = '22023';
  end if;

  if p_price_sen is null or p_price_sen < 0 then
    raise exception 'Price must be zero or positive' using errcode = '22023';
  end if;

  select * into target_outlet
  from public.outlets
  where id = target_outlet_id and is_active;

  if not found then
    raise exception 'Outlet not found' using errcode = '22023';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_outlet_id,
    array['organisation_owner', 'organisation_admin']::public.org_role[]
  );

  select * into target_item
  from public.menu_items
  where id = target_item_id
    and outlet_id = target_outlet_id
    and is_active
  for update;

  if not found then
    raise exception 'Item not found' using errcode = '22023';
  end if;

  if p_station_id is not null and not exists (
    select 1 from public.kitchen_stations
    where id = p_station_id
      and outlet_id = target_outlet_id
      and is_active
  ) then
    raise exception 'Station not found or not available' using errcode = '22023';
  end if;

  update public.menu_items
  set name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      price_sen = p_price_sen,
      is_public = coalesce(p_is_public, target_item.is_public),
      station_id = p_station_id
  where id = target_item_id;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, before_data, after_data
  )
  values (
    target_outlet.org_id,
    target_outlet_id,
    actor_id,
    'MENU_ITEM_UPDATED',
    'menu_items',
    target_item_id,
    jsonb_build_object(
      'name', target_item.name,
      'description', target_item.description,
      'price_sen', target_item.price_sen,
      'is_public', target_item.is_public,
      'station_id', target_item.station_id
    ),
    jsonb_build_object(
      'name', btrim(p_name),
      'description', nullif(btrim(coalesce(p_description, '')), ''),
      'price_sen', p_price_sen,
      'is_public', coalesce(p_is_public, target_item.is_public),
      'station_id', p_station_id
    )
  );

  return jsonb_build_object('item_id', target_item_id, 'name', btrim(p_name));
end;
$$;

revoke all on function public.flow_v3_3_update_menu_item(uuid, uuid, text, text, bigint, boolean, uuid) from public;
revoke all on function public.flow_v3_3_update_menu_item(uuid, uuid, text, text, bigint, boolean, uuid) from anon;
revoke all on function public.flow_v3_3_update_menu_item(uuid, uuid, text, text, bigint, boolean, uuid) from authenticated;
grant execute on function public.flow_v3_3_update_menu_item(uuid, uuid, text, text, bigint, boolean, uuid) to authenticated;

-- ── 10. Set item availability (Owner/Admin/Manager) ──────────────────────────
--     Manager may call this; cannot call any other mutation RPC.
--     When marking available, sold_out_reason is always cleared.

create or replace function public.flow_v3_3_set_item_availability(
  target_outlet_id uuid,
  target_item_id uuid,
  p_sold_out boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_outlet public.outlets%rowtype;
  target_item public.menu_items%rowtype;
  new_reason text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_sold_out is null then
    raise exception 'sold_out flag is required' using errcode = '22023';
  end if;

  select * into target_outlet
  from public.outlets
  where id = target_outlet_id and is_active;

  if not found then
    raise exception 'Outlet not found' using errcode = '22023';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_outlet_id,
    array['organisation_owner', 'organisation_admin', 'manager']::public.org_role[]
  );

  select * into target_item
  from public.menu_items
  where id = target_item_id
    and outlet_id = target_outlet_id
    and is_active
  for update;

  if not found then
    raise exception 'Item not found' using errcode = '22023';
  end if;

  new_reason := case
    when p_sold_out then nullif(btrim(coalesce(p_reason, '')), '')
    else null
  end;

  update public.menu_items
  set is_sold_out = p_sold_out,
      sold_out_reason = new_reason
  where id = target_item_id;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id,
    before_data, after_data, reason
  )
  values (
    target_outlet.org_id,
    target_outlet_id,
    actor_id,
    case when p_sold_out then 'MENU_ITEM_MARKED_SOLD_OUT' else 'MENU_ITEM_MARKED_AVAILABLE' end,
    'menu_items',
    target_item_id,
    jsonb_build_object('is_sold_out', target_item.is_sold_out, 'sold_out_reason', target_item.sold_out_reason),
    jsonb_build_object('is_sold_out', p_sold_out, 'sold_out_reason', new_reason),
    new_reason
  );

  return jsonb_build_object('item_id', target_item_id, 'is_sold_out', p_sold_out);
end;
$$;

revoke all on function public.flow_v3_3_set_item_availability(uuid, uuid, boolean, text) from public;
revoke all on function public.flow_v3_3_set_item_availability(uuid, uuid, boolean, text) from anon;
revoke all on function public.flow_v3_3_set_item_availability(uuid, uuid, boolean, text) from authenticated;
grant execute on function public.flow_v3_3_set_item_availability(uuid, uuid, boolean, text) to authenticated;

-- ── 11. Archive item (Owner/Admin) ────────────────────────────────────────────
--     Soft-delete only: is_active = false. menu_item_id FK ON DELETE RESTRICT
--     in order_lines prevents hard deletion; existing snapshots are preserved.

create or replace function public.flow_v3_3_archive_menu_item(
  target_outlet_id uuid,
  target_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  target_outlet public.outlets%rowtype;
  target_item public.menu_items%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into target_outlet
  from public.outlets
  where id = target_outlet_id and is_active;

  if not found then
    raise exception 'Outlet not found' using errcode = '22023';
  end if;

  perform public.flow_v3_1_require_outlet_role(
    target_outlet_id,
    array['organisation_owner', 'organisation_admin']::public.org_role[]
  );

  select * into target_item
  from public.menu_items
  where id = target_item_id
    and outlet_id = target_outlet_id
    and is_active
  for update;

  if not found then
    raise exception 'Item not found' using errcode = '22023';
  end if;

  update public.menu_items
  set is_active = false,
      is_sold_out = false,
      sold_out_reason = null
  where id = target_item_id;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, before_data, after_data
  )
  values (
    target_outlet.org_id,
    target_outlet_id,
    actor_id,
    'MENU_ITEM_ARCHIVED',
    'menu_items',
    target_item_id,
    jsonb_build_object('name', target_item.name, 'is_active', true),
    jsonb_build_object('name', target_item.name, 'is_active', false)
  );

  return jsonb_build_object('item_id', target_item_id, 'archived', true);
end;
$$;

revoke all on function public.flow_v3_3_archive_menu_item(uuid, uuid) from public;
revoke all on function public.flow_v3_3_archive_menu_item(uuid, uuid) from anon;
revoke all on function public.flow_v3_3_archive_menu_item(uuid, uuid) from authenticated;
grant execute on function public.flow_v3_3_archive_menu_item(uuid, uuid) to authenticated;
