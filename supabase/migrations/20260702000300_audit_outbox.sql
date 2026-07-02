create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  outlet_id uuid references public.outlets(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null check (length(btrim(action)) > 0),
  object_type text not null check (length(btrim(object_type)) > 0),
  object_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index audit_events_org_created_idx
on public.audit_events (org_id, created_at desc);

create index audit_events_object_idx
on public.audit_events (org_id, object_type, object_id);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  outlet_id uuid references public.outlets(id) on delete set null,
  room_id uuid,
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (length(btrim(event_type)) > 0),
  object_type text not null check (length(btrim(object_type)) > 0),
  object_id uuid,
  payload_summary jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  publish_attempts integer not null default 0 check (publish_attempts >= 0),
  last_error text
);

create unique index outbox_events_dedupe_key_idx
on public.outbox_events (org_id, dedupe_key)
where dedupe_key is not null;

create index outbox_events_unpublished_idx
on public.outbox_events (created_at)
where published_at is null;

alter table public.audit_events enable row level security;
alter table public.outbox_events enable row level security;

create policy audit_events_select_active_org_member
on public.audit_events for select
to authenticated
using (public.is_active_org_member(org_id));

create policy outbox_events_select_active_org_member
on public.outbox_events for select
to authenticated
using (public.is_active_org_member(org_id));
