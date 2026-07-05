-- V3.2: One outlet QR with customer table selection.
-- Adds public_outlet_token to outlets and creates flow_m4_public_outlet_menu.
--
-- flow_m4_public_menu, flow_m4_create_qr_table_order, flow_m4_public_order_status,
-- and all flow_v3_1_* functions are not modified by this migration.

-- 1. Opaque permanent public token for each outlet.

alter table public.outlets
  add column public_outlet_token text;

update public.outlets
  set public_outlet_token = encode(extensions.gen_random_bytes(24), 'hex')
  where public_outlet_token is null;

alter table public.outlets
  alter column public_outlet_token set not null,
  alter column public_outlet_token set default encode(extensions.gen_random_bytes(24), 'hex'),
  add constraint outlets_public_outlet_token_min_length
    check (length(public_outlet_token) >= 32);

create unique index if not exists outlets_public_outlet_token_idx
  on public.outlets (public_outlet_token);

-- 2. Public outlet menu RPC.
--    Returns: outlet display name, eligible table list (label + opaque table token only),
--    and menu categories/items (same safe projection as flow_m4_public_menu).
--    Never returns: outlet UUID, org UUID, site UUID, table session UUIDs, menu item IDs,
--    staff data, payment data, internal lifecycle fields, or raw errors.

create or replace function public.flow_m4_public_outlet_menu(outlet_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  target_outlet public.outlets%rowtype;
begin
  if outlet_token is null or length(btrim(outlet_token)) < 32 then
    return jsonb_build_object('found', false);
  end if;

  select *
  into target_outlet
  from public.outlets o
  where o.public_outlet_token = outlet_token
    and o.is_active
  limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'outlet_name', target_outlet.name,
    'payment_label', 'Pay at counter',
    'tables', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'table_label', ts.table_label,
          'public_table_token', ts.public_table_token
        )
        order by ts.table_label
      )
      from public.table_sessions ts
      where ts.outlet_id = target_outlet.id
        and ts.status in ('AVAILABLE', 'OPEN')
        and ts.public_table_token is not null
        and ts.public_token_expires_at is not null
        and ts.public_token_expires_at > now()
    ), '[]'::jsonb),
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
              'available', public.flow_m4_public_item_available(target_outlet.id, mi.id, 1)
            )
            order by mi.name
          ) as items
        from public.menu_categories mc
        join public.menu_items mi on mi.category_id = mc.id
        where mc.org_id = target_outlet.org_id
          and mc.outlet_id = target_outlet.id
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

revoke all on function public.flow_m4_public_outlet_menu(text) from public;
revoke all on function public.flow_m4_public_outlet_menu(text) from anon;
revoke all on function public.flow_m4_public_outlet_menu(text) from authenticated;
grant execute on function public.flow_m4_public_outlet_menu(text) to anon, authenticated;

-- 3. Outlet-aware QR order submission wrapper.
--    Validates: outlet token → active outlet; table token → active non-expired
--    table session belonging to that exact outlet.  Only after both are proven
--    does it delegate to flow_m4_create_qr_table_order, preserving all V3.1/LEGACY
--    lifecycle, inventory, idempotency, and audit behaviour without duplication.
--
--    The Decision Lock §8 requires: "The server validates that the table is active,
--    belongs to the outlet represented by the outlet QR."  This function is that
--    server-side proof.  flow_m4_create_qr_table_order is never called directly
--    from the /o/ route; it is only reached through this outlet-scoped gate.

create or replace function public.flow_m4_create_outlet_qr_order(
  outlet_token        text,
  target_table_token  text,
  order_items         jsonb,
  request_key         text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  target_outlet  public.outlets%rowtype;
  target_table   public.table_sessions%rowtype;
begin
  -- Minimum safe length for both tokens (matches application-layer regex floor).
  if outlet_token is null or length(btrim(outlet_token)) < 32 then
    raise exception 'Outlet ordering link is unavailable';
  end if;

  if target_table_token is null or length(btrim(target_table_token)) < 32 then
    raise exception 'Table link is unavailable';
  end if;

  -- Resolve active outlet from the scanned opaque outlet token.
  select *
  into target_outlet
  from public.outlets o
  where o.public_outlet_token = outlet_token
    and o.is_active
  limit 1;

  if not found then
    raise exception 'Outlet ordering link is unavailable';
  end if;

  -- Confirm the submitted table token belongs to this exact resolved outlet
  -- and is currently eligible for ordering.
  select *
  into target_table
  from public.table_sessions ts
  where ts.public_table_token = target_table_token
    and ts.outlet_id = target_outlet.id
    and ts.public_token_expires_at is not null
    and ts.public_token_expires_at > now()
    and ts.status in ('AVAILABLE', 'OPEN')
  limit 1;

  if not found then
    raise exception 'Table link is unavailable';
  end if;

  -- Outlet/table relationship is proven.  Delegate to the existing validated
  -- order-creation function with its full lifecycle branching, idempotency,
  -- inventory reservation, audit, and outbox logic.
  return public.flow_m4_create_qr_table_order(
    target_table_token,
    order_items,
    request_key
  );
end;
$$;

revoke all on function public.flow_m4_create_outlet_qr_order(text, text, jsonb, text) from public;
revoke all on function public.flow_m4_create_outlet_qr_order(text, text, jsonb, text) from anon;
revoke all on function public.flow_m4_create_outlet_qr_order(text, text, jsonb, text) from authenticated;
grant execute on function public.flow_m4_create_outlet_qr_order(text, text, jsonb, text) to anon, authenticated;
