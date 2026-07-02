create table public.kitchen_station_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  station_id uuid not null references public.kitchen_stations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint kitchen_station_memberships_active_key unique (org_id, outlet_id, station_id, user_id)
);

create index kitchen_station_memberships_user_idx
on public.kitchen_station_memberships (org_id, outlet_id, user_id)
where revoked_at is null;

alter table public.kitchen_station_memberships enable row level security;

create policy kitchen_station_memberships_select_active_outlet_member
on public.kitchen_station_memberships for select
to authenticated
using (public.is_active_outlet_member(outlet_id));

grant select, insert, update on table public.kitchen_station_memberships to service_role;
grant select on table public.kitchen_station_memberships to authenticated;

insert into public.table_sessions (org_id, outlet_id, table_label, status)
select o.id, out.id, table_label, 'AVAILABLE'::public.table_session_status
from public.organisations o
join public.outlets out on out.org_id = o.id
cross join (values ('T1'), ('T2'), ('T3'), ('Patio 1')) as labels(table_label)
where o.name = 'BrewBite Kitchen'
  and not exists (
    select 1
    from public.table_sessions ts
    where ts.org_id = o.id
      and ts.outlet_id = out.id
      and ts.table_label = labels.table_label
  );

insert into public.kitchen_station_memberships (org_id, outlet_id, station_id, user_id)
select ks.org_id, ks.outlet_id, ks.id, om.user_id
from public.kitchen_stations ks
join public.org_memberships om on om.org_id = ks.org_id
where om.role = 'kitchen'
  and om.deactivated_at is null
  and not exists (
    select 1
    from public.kitchen_station_memberships existing
    where existing.org_id = ks.org_id
      and existing.outlet_id = ks.outlet_id
      and existing.station_id = ks.id
      and existing.user_id = om.user_id
  );

create or replace function public.flow_m3_current_role(target_org_id uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public
as $$
  select om.role
  from public.org_memberships om
  join public.profiles p on p.id = om.user_id
  join public.organisations o on o.id = om.org_id
  where om.org_id = target_org_id
    and om.user_id = auth.uid()
    and om.deactivated_at is null
    and p.is_active
    and o.is_active
  limit 1;
$$;

create or replace function public.flow_m3_require_role(target_org_id uuid, allowed_roles public.org_role[])
returns public.org_role
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor_role public.org_role;
begin
  actor_role := public.flow_m3_current_role(target_org_id);

  if actor_role is null or not (actor_role = any(allowed_roles)) then
    raise exception 'Not authorised for this Flow operation' using errcode = '42501';
  end if;

  return actor_role;
end;
$$;

create or replace function public.flow_m3_available_quantity(target_outlet_id uuid, target_ingredient_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(il.quantity_delta), 0)
  from public.inventory_ledger il
  where il.outlet_id = target_outlet_id
    and il.ingredient_id = target_ingredient_id;
$$;

create or replace function public.flow_m3_create_table_order(
  target_table_session_id uuid,
  order_items jsonb,
  request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_table public.table_sessions%rowtype;
  actor_role public.org_role;
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

  if jsonb_typeof(order_items) <> 'array' or jsonb_array_length(order_items) = 0 then
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

  actor_role := public.flow_m3_require_role(
    target_table.org_id,
    array[
      'organisation_owner',
      'organisation_admin',
      'manager',
      'cashier',
      'waiter'
    ]::public.org_role[]
  );

  perform pg_advisory_xact_lock(hashtext(target_table.org_id::text || ':' || request_key));

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

  if exists (select 1 from flow_order_request where quantity <= 0) then
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
    created_by_user_id
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
    actor_id
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
    jsonb_build_object('total_sen', subtotal, 'item_count', item_count),
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
    jsonb_build_object('total_sen', subtotal),
    'order.created:' || new_order_id::text
  );

  return jsonb_build_object('order_id', new_order_id, 'thread_room_id', thread_room_id, 'idempotent', false);
end;
$$;

create or replace function public.flow_m3_transition_kitchen_ticket(
  target_ticket_id uuid,
  next_status public.kitchen_ticket_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
    set service_status = 'READY'
    where id = ticket.order_id;
  elsif next_status = 'COMPLETED' and not exists (
    select 1
    from public.kitchen_tickets kt
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

create or replace function public.flow_m3_demo_manual_settlement(target_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  perform public.flow_m3_require_role(
    target_order.org_id,
    array[
      'organisation_owner',
      'organisation_admin',
      'manager',
      'cashier'
    ]::public.org_role[]
  );

  if target_order.payment_status <> 'UNPAID' then
    raise exception 'Only unpaid orders can use demo manual settlement';
  end if;

  update public.orders
  set payment_status = 'PAID',
      service_status = case
        when service_status = 'SERVED_OR_COLLECTED' then 'COMPLETED'
        else service_status
      end
  where id = target_order.id;

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

  return jsonb_build_object('order_id', target_order.id, 'payment_status', 'PAID');
end;
$$;

create or replace function public.flow_m3_send_message(
  target_room_id uuid,
  message_body text,
  message_client_nonce text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_room public.communication_rooms%rowtype;
  new_message_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if message_body is null or length(btrim(message_body)) = 0 or length(message_body) > 4000 then
    raise exception 'Message must be plain text between 1 and 4000 characters';
  end if;

  if message_client_nonce is null or length(btrim(message_client_nonce)) = 0 then
    raise exception 'Message client nonce is required';
  end if;

  select *
  into target_room
  from public.communication_rooms
  where id = target_room_id
    and archived_at is null;

  if not found then
    raise exception 'Room not found';
  end if;

  if not public.can_send_message_to_room(target_room.id) then
    raise exception 'Not authorised to send to this room' using errcode = '42501';
  end if;

  insert into public.messages (
    org_id,
    room_id,
    author_user_id,
    body,
    client_nonce
  )
  values (
    target_room.org_id,
    target_room.id,
    actor_id,
    message_body,
    message_client_nonce
  )
  on conflict do nothing
  returning id into new_message_id;

  if new_message_id is null then
    select id
    into new_message_id
    from public.messages
    where org_id = target_room.org_id
      and room_id = target_room.id
      and author_user_id = actor_id
      and client_nonce = message_client_nonce
    limit 1;
  end if;

  insert into public.message_reads (
    org_id,
    room_id,
    user_id,
    last_read_message_id,
    last_read_at
  )
  values (
    target_room.org_id,
    target_room.id,
    actor_id,
    new_message_id,
    now()
  )
  on conflict (org_id, room_id, user_id)
  do update set last_read_message_id = excluded.last_read_message_id,
                last_read_at = excluded.last_read_at;

  insert into public.audit_events (
    org_id,
    actor_user_id,
    action,
    object_type,
    object_id,
    after_data
  )
  values (
    target_room.org_id,
    actor_id,
    'MESSAGE_CREATED',
    'messages',
    new_message_id,
    jsonb_build_object('room_id', target_room.id, 'room_type', target_room.room_type)
  );

  insert into public.outbox_events (
    org_id,
    room_id,
    user_id,
    event_type,
    object_type,
    object_id,
    payload_summary,
    dedupe_key
  )
  values (
    target_room.org_id,
    target_room.id,
    actor_id,
    'message.created',
    'messages',
    new_message_id,
    jsonb_build_object('room_id', target_room.id),
    'message.created:' || new_message_id::text
  )
  on conflict do nothing;

  return jsonb_build_object('message_id', new_message_id);
end;
$$;

grant execute on function public.flow_m3_current_role(uuid) to authenticated;
grant execute on function public.flow_m3_require_role(uuid, public.org_role[]) to authenticated;
grant execute on function public.flow_m3_available_quantity(uuid, uuid) to authenticated;
grant execute on function public.flow_m3_create_table_order(uuid, jsonb, text) to authenticated;
grant execute on function public.flow_m3_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) to authenticated;
grant execute on function public.flow_m3_demo_manual_settlement(uuid) to authenticated;
grant execute on function public.flow_m3_send_message(uuid, text, text) to authenticated;
