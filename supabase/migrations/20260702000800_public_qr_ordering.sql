alter table public.table_sessions
  add column public_table_token text,
  add column public_token_expires_at timestamptz;

alter table public.menu_items
  add column public_menu_token text;

alter table public.orders
  add column public_tracking_token text,
  add column public_tracking_expires_at timestamptz;

create unique index table_sessions_public_table_token_key
on public.table_sessions (public_table_token)
where public_table_token is not null;

create unique index menu_items_public_menu_token_key
on public.menu_items (public_menu_token)
where public_menu_token is not null;

create unique index orders_public_tracking_token_key
on public.orders (public_tracking_token)
where public_tracking_token is not null;

create index orders_public_tracking_active_idx
on public.orders (public_tracking_token, public_tracking_expires_at)
where public_tracking_token is not null;

update public.table_sessions
set public_table_token = encode(extensions.gen_random_bytes(24), 'hex'),
    public_token_expires_at = now() + interval '30 days'
where public_table_token is null;

update public.menu_items
set public_menu_token = encode(extensions.gen_random_bytes(24), 'hex')
where public_menu_token is null;

alter table public.table_sessions
  alter column public_table_token set default encode(extensions.gen_random_bytes(24), 'hex'),
  alter column public_token_expires_at set default (now() + interval '30 days');

alter table public.menu_items
  alter column public_menu_token set default encode(extensions.gen_random_bytes(24), 'hex');

alter table public.table_sessions
  add constraint table_sessions_public_table_token_length
  check (public_table_token is null or length(public_table_token) >= 32);

alter table public.menu_items
  add constraint menu_items_public_menu_token_length
  check (public_menu_token is null or length(public_menu_token) >= 32);

alter table public.orders
  add constraint orders_public_tracking_token_length
  check (public_tracking_token is null or length(public_tracking_token) >= 32);

create or replace function public.flow_m4_public_item_available(
  target_outlet_id uuid,
  target_menu_item_id uuid,
  requested_quantity integer
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(bool_and(
    public.flow_m3_available_quantity(target_outlet_id, required.ingredient_id)
      >= required.required_quantity
  ), false)
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
  ) required;
$$;

create or replace function public.flow_m4_public_menu(target_table_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  target_table public.table_sessions%rowtype;
  outlet_name text;
begin
  if target_table_token is null or length(btrim(target_table_token)) < 32 then
    return jsonb_build_object('found', false);
  end if;

  select *
  into target_table
  from public.table_sessions ts
  where ts.public_table_token = target_table_token
    and ts.public_token_expires_at is not null
    and ts.public_token_expires_at > now()
    and ts.status in ('AVAILABLE', 'OPEN')
  limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  select out.name
  into outlet_name
  from public.outlets out
  where out.id = target_table.outlet_id
    and out.is_active;

  if outlet_name is null then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'outlet_name', outlet_name,
    'table_label', target_table.table_label,
    'payment_label', 'Pay at counter',
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', category_group.category_name,
          'items', category_group.items
        )
        order by category_group.sort_order, category_group.category_name
      )
      from (
        select
          mc.name as category_name,
          mc.sort_order,
          jsonb_agg(
            jsonb_build_object(
              'public_menu_token', mi.public_menu_token,
              'name', mi.name,
              'description', mi.description,
              'price_sen', mi.price_sen,
              'available', public.flow_m4_public_item_available(target_table.outlet_id, mi.id, 1)
            )
            order by mi.name
          ) as items
        from public.menu_categories mc
        join public.menu_items mi on mi.category_id = mc.id
        where mc.org_id = target_table.org_id
          and mc.outlet_id = target_table.outlet_id
          and mc.is_active
          and mi.is_active
          and mi.is_public
          and mi.public_menu_token is not null
        group by mc.name, mc.sort_order
      ) category_group
    ), '[]'::jsonb)
  );
end;
$$;

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
  new_order_id uuid;
  new_ticket_id uuid;
  thread_room_id uuid;
  tracking_token text;
  subtotal bigint := 0;
  item_count integer := 0;
  line_record record;
  ingredient_record record;
  ticket_record record;
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

  if jsonb_array_length(order_items) = 0 then
    raise exception 'Invalid order request';
  end if;

  if jsonb_array_length(order_items) > 20 then
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
      'idempotent', true
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
    public_tracking_expires_at
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
    now() + interval '24 hours'
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

  insert into public.inventory_ledger (
    org_id,
    outlet_id,
    ingredient_id,
    entry_type,
    quantity_delta,
    reference_type,
    reference_id,
    reason
  )
  select
    target_table.org_id,
    target_table.outlet_id,
    ingredient_id,
    'reservation',
    -required_quantity,
    'order',
    new_order_id,
    'Public QR table order inventory reservation'
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
    'QR_TABLE_ORDER_CREATED',
    'orders',
    new_order_id,
    jsonb_build_object(
      'total_sen', subtotal,
      'item_count', item_count,
      'payment_status', 'UNPAID',
      'payment_label', 'Pay at counter'
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
    'order.qr_table_created',
    'orders',
    new_order_id,
    jsonb_build_object('total_sen', subtotal, 'payment_status', 'UNPAID'),
    'order.qr_table_created:' || new_order_id::text
  );

  return jsonb_build_object(
    'public_order_id', tracking_token,
    'idempotent', false,
    'payment_status', 'UNPAID',
    'payment_label', 'Pay at counter'
  );
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

  safe_status := case target_order.service_status
    when 'DRAFT' then 'ACCEPTED'
    when 'SUBMITTED' then 'ACCEPTED'
    when 'PREPARING' then 'PREPARING'
    when 'READY' then 'READY'
    when 'SERVED_OR_COLLECTED' then 'SERVED'
    when 'COMPLETED' then 'SERVED'
    when 'CANCELLED' then 'UNAVAILABLE'
    else 'ACCEPTED'
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

grant usage on schema public to anon;

revoke all on function public.set_updated_at() from public;
revoke all on function public.set_updated_at() from anon;
revoke all on function public.set_updated_at() from authenticated;

revoke all on function public.current_user_id() from public;
revoke all on function public.current_user_id() from anon;
revoke all on function public.current_user_id() from authenticated;
grant execute on function public.current_user_id() to authenticated;

revoke all on function public.is_active_org_member(uuid) from public;
revoke all on function public.is_active_org_member(uuid) from anon;
revoke all on function public.is_active_org_member(uuid) from authenticated;
grant execute on function public.is_active_org_member(uuid) to authenticated;

revoke all on function public.current_org_role(uuid) from public;
revoke all on function public.current_org_role(uuid) from anon;
revoke all on function public.current_org_role(uuid) from authenticated;
grant execute on function public.current_org_role(uuid) to authenticated;

revoke all on function public.has_org_permission(uuid, text) from public;
revoke all on function public.has_org_permission(uuid, text) from anon;
revoke all on function public.has_org_permission(uuid, text) from authenticated;
grant execute on function public.has_org_permission(uuid, text) to authenticated;

revoke all on function public.is_active_site_member(uuid) from public;
revoke all on function public.is_active_site_member(uuid) from anon;
revoke all on function public.is_active_site_member(uuid) from authenticated;
grant execute on function public.is_active_site_member(uuid) to authenticated;

revoke all on function public.is_active_outlet_member(uuid) from public;
revoke all on function public.is_active_outlet_member(uuid) from anon;
revoke all on function public.is_active_outlet_member(uuid) from authenticated;
grant execute on function public.is_active_outlet_member(uuid) to authenticated;

revoke all on function public.is_active_room_member(uuid) from public;
revoke all on function public.is_active_room_member(uuid) from anon;
revoke all on function public.is_active_room_member(uuid) from authenticated;
grant execute on function public.is_active_room_member(uuid) to authenticated;

revoke all on function public.has_current_communication_policy_ack(uuid, uuid) from public;
revoke all on function public.has_current_communication_policy_ack(uuid, uuid) from anon;
revoke all on function public.has_current_communication_policy_ack(uuid, uuid) from authenticated;
grant execute on function public.has_current_communication_policy_ack(uuid, uuid) to authenticated;

revoke all on function public.has_active_review_access(uuid) from public;
revoke all on function public.has_active_review_access(uuid) from anon;
revoke all on function public.has_active_review_access(uuid) from authenticated;
grant execute on function public.has_active_review_access(uuid) to authenticated;

revoke all on function public.can_read_room(uuid) from public;
revoke all on function public.can_read_room(uuid) from anon;
revoke all on function public.can_read_room(uuid) from authenticated;
grant execute on function public.can_read_room(uuid) to authenticated;

revoke all on function public.can_send_message_to_room(uuid) from public;
revoke all on function public.can_send_message_to_room(uuid) from anon;
revoke all on function public.can_send_message_to_room(uuid) from authenticated;
grant execute on function public.can_send_message_to_room(uuid) to authenticated;

revoke all on function public.prevent_inventory_ledger_mutation() from public;
revoke all on function public.prevent_inventory_ledger_mutation() from anon;
revoke all on function public.prevent_inventory_ledger_mutation() from authenticated;

revoke all on function public.flow_m3_current_role(uuid) from public;
revoke all on function public.flow_m3_current_role(uuid) from anon;
revoke all on function public.flow_m3_current_role(uuid) from authenticated;
grant execute on function public.flow_m3_current_role(uuid) to authenticated;

revoke all on function public.flow_m3_require_role(uuid, public.org_role[]) from public;
revoke all on function public.flow_m3_require_role(uuid, public.org_role[]) from anon;
revoke all on function public.flow_m3_require_role(uuid, public.org_role[]) from authenticated;
grant execute on function public.flow_m3_require_role(uuid, public.org_role[]) to authenticated;

revoke all on function public.flow_m3_available_quantity(uuid, uuid) from public;
revoke all on function public.flow_m3_available_quantity(uuid, uuid) from anon;
revoke all on function public.flow_m3_available_quantity(uuid, uuid) from authenticated;
grant execute on function public.flow_m3_available_quantity(uuid, uuid) to authenticated;

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

revoke all on function public.flow_m3_send_message(uuid, text, text) from public;
revoke all on function public.flow_m3_send_message(uuid, text, text) from anon;
revoke all on function public.flow_m3_send_message(uuid, text, text) from authenticated;
grant execute on function public.flow_m3_send_message(uuid, text, text) to authenticated;

revoke all on function public.flow_m4_public_item_available(uuid, uuid, integer) from public;
revoke all on function public.flow_m4_public_item_available(uuid, uuid, integer) from anon;
revoke all on function public.flow_m4_public_item_available(uuid, uuid, integer) from authenticated;

revoke all on function public.flow_m4_public_menu(text) from public;
revoke all on function public.flow_m4_public_menu(text) from anon;
revoke all on function public.flow_m4_public_menu(text) from authenticated;
grant execute on function public.flow_m4_public_menu(text) to anon, authenticated;

revoke all on function public.flow_m4_create_qr_table_order(text, jsonb, text) from public;
revoke all on function public.flow_m4_create_qr_table_order(text, jsonb, text) from anon;
revoke all on function public.flow_m4_create_qr_table_order(text, jsonb, text) from authenticated;
grant execute on function public.flow_m4_create_qr_table_order(text, jsonb, text) to anon, authenticated;

revoke all on function public.flow_m4_public_order_status(text) from public;
revoke all on function public.flow_m4_public_order_status(text) from anon;
revoke all on function public.flow_m4_public_order_status(text) from authenticated;
grant execute on function public.flow_m4_public_order_status(text) to anon, authenticated;
