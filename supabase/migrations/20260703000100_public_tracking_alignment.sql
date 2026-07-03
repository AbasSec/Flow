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
    when target_order.service_status = 'CANCELLED' then 'UNAVAILABLE'
    when target_order.service_status in ('SERVED_OR_COLLECTED', 'COMPLETED') then 'ORDER_COMPLETE'
    when ticket_progress = 1 then 'ORDER_RECEIVED'
    when ticket_progress = 2 then 'ACCEPTED'
    when ticket_progress = 3 then 'PREPARING'
    when ticket_progress = 4 then 'READY'
    when ticket_progress = 5 then 'ORDER_COMPLETE'
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

revoke all on function public.flow_m4_public_order_status(text) from public;
revoke all on function public.flow_m4_public_order_status(text) from anon;
revoke all on function public.flow_m4_public_order_status(text) from authenticated;
grant execute on function public.flow_m4_public_order_status(text) to anon, authenticated;
