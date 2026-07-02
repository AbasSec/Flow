set check_function_bodies = off;

create extension if not exists pgcrypto with schema extensions;

create type public.org_role as enum (
  'organisation_owner',
  'organisation_admin',
  'manager',
  'cashier',
  'waiter',
  'kitchen',
  'storekeeper'
);

create type public.platform_admin_status as enum ('active', 'suspended');
create type public.permission_subject_type as enum ('user', 'role', 'team');

create type public.room_type as enum (
  'ORG_HUB',
  'TEAM_ROOM',
  'DIRECT_WORK',
  'WORK_ITEM_THREAD'
);

create type public.room_member_role as enum ('member', 'room_manager');
create type public.message_state as enum ('created', 'edited', 'soft_deleted');
create type public.work_item_type as enum ('ORDER', 'KITCHEN_TICKET');

create type public.order_channel as enum ('table', 'counter', 'qr', 'online_pickup');
create type public.order_service_status as enum (
  'DRAFT',
  'SUBMITTED',
  'PREPARING',
  'READY',
  'SERVED_OR_COLLECTED',
  'COMPLETED',
  'CANCELLED'
);
create type public.payment_status as enum (
  'UNPAID',
  'PENDING',
  'PAID',
  'FAILED',
  'EXPIRED',
  'REFUND_REQUESTED',
  'REFUNDED'
);
create type public.table_session_status as enum (
  'AVAILABLE',
  'OPEN',
  'BILL_REQUESTED',
  'SETTLED',
  'CLOSED',
  'CANCELLED'
);
create type public.kitchen_ticket_status as enum (
  'NEW',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'HELD',
  'HELD_UNAVAILABLE'
);
create type public.ticket_line_status as enum (
  'NEW',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'HELD',
  'HELD_UNAVAILABLE'
);
create type public.inventory_ledger_entry_type as enum (
  'receipt',
  'reservation',
  'reservation_release',
  'consumption',
  'waste',
  'adjustment'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
