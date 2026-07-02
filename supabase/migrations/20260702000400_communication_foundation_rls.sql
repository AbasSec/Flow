create table public.communication_retention_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  policy_version integer not null check (policy_version > 0),
  retention_days integer not null default 365 check (retention_days > 0),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references public.profiles(id),
  constraint communication_retention_policies_org_version_key unique (org_id, policy_version)
);

create unique index communication_retention_policies_current_key
on public.communication_retention_policies (org_id)
where is_current;

create table public.communication_policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  policy_version integer not null check (policy_version > 0),
  acknowledged_at timestamptz not null default now(),
  acknowledgement_source text not null check (length(btrim(acknowledgement_source)) > 0),
  ip_hash text,
  constraint communication_policy_acknowledgements_key unique (org_id, user_id, policy_version)
);

create table public.communication_rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  room_type public.room_type not null,
  title text not null,
  normalized_title text generated always as (lower(title)) stored,
  participant_set_hash text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_rooms_direct_hash_required check (
    (room_type = 'DIRECT_WORK' and participant_set_hash is not null)
    or (room_type <> 'DIRECT_WORK' and participant_set_hash is null)
  )
);

create unique index communication_rooms_org_hub_active_key
on public.communication_rooms (org_id, room_type)
where archived_at is null and room_type = 'ORG_HUB';

create unique index communication_rooms_team_title_active_key
on public.communication_rooms (org_id, room_type, normalized_title)
where archived_at is null and room_type = 'TEAM_ROOM';

create unique index communication_rooms_direct_participants_active_key
on public.communication_rooms (org_id, room_type, participant_set_hash)
where archived_at is null and room_type = 'DIRECT_WORK';

create trigger communication_rooms_set_updated_at
before update on public.communication_rooms
for each row execute function public.set_updated_at();

create table public.room_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.communication_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.room_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  muted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index room_memberships_active_user_room_key
on public.room_memberships (org_id, room_id, user_id)
where left_at is null;

create index room_memberships_user_room_idx
on public.room_memberships (user_id, room_id)
where left_at is null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.communication_rooms(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  body_hash text,
  client_nonce text,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  message_state public.message_state not null default 'created',
  edited_at timestamptz,
  edited_by_user_id uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by_user_id uuid references public.profiles(id) on delete set null,
  delete_reason text,
  created_at timestamptz not null default now(),
  constraint messages_plain_text_length check (length(body) between 1 and 4000)
);

create index messages_room_created_idx
on public.messages (room_id, created_at desc)
where deleted_at is null;

create unique index messages_author_client_nonce_key
on public.messages (org_id, room_id, author_user_id, client_nonce)
where client_nonce is not null;

create index messages_org_author_created_idx
on public.messages (org_id, author_user_id, created_at desc);

create table public.message_reads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.communication_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_message_id uuid references public.messages(id) on delete set null,
  last_read_at timestamptz not null default now(),
  constraint message_reads_key unique (org_id, room_id, user_id)
);

create table public.work_item_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null unique references public.communication_rooms(id) on delete cascade,
  entity_type public.work_item_type not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  constraint work_item_threads_target_key unique (org_id, entity_type, entity_id)
);

create table public.communication_review_access_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.communication_rooms(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (length(btrim(reason)) > 0),
  policy_version integer not null check (policy_version > 0),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  revoked_at timestamptz,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  request_id text,
  support_access_grant_id uuid references public.support_access_grants(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint communication_review_access_grants_window check (expires_at > granted_at)
);

create index communication_review_access_grants_active_idx
on public.communication_review_access_grants (org_id, room_id, reviewer_user_id, expires_at)
where revoked_at is null;

create table public.communication_review_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  room_id uuid not null references public.communication_rooms(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id) on delete restrict,
  review_access_grant_id uuid not null references public.communication_review_access_grants(id) on delete restrict,
  reason text not null check (length(btrim(reason)) > 0),
  policy_version integer not null check (policy_version > 0),
  access_basis text not null default 'communication.audit.review',
  request_id text,
  support_access_grant_id uuid references public.support_access_grants(id) on delete set null,
  created_at timestamptz not null default now()
);

create index communication_review_events_org_created_idx
on public.communication_review_events (org_id, created_at desc);

create index communication_review_events_room_created_idx
on public.communication_review_events (room_id, created_at desc);

create or replace function public.is_active_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_memberships rm
    join public.communication_rooms cr on cr.id = rm.room_id
    where rm.room_id = target_room_id
      and rm.user_id = auth.uid()
      and rm.left_at is null
      and cr.archived_at is null
      and public.is_active_org_member(rm.org_id)
  );
$$;

create or replace function public.has_current_communication_policy_ack(target_org_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisations o
    join public.communication_policy_acknowledgements cpa
      on cpa.org_id = o.id
      and cpa.policy_version = o.communication_policy_version
    where o.id = target_org_id
      and cpa.user_id = target_user_id
  );
$$;

create or replace function public.has_active_review_access(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.communication_review_access_grants crag
    where crag.room_id = target_room_id
      and crag.reviewer_user_id = auth.uid()
      and crag.revoked_at is null
      and crag.granted_at <= now()
      and crag.expires_at > now()
      and public.is_active_org_member(crag.org_id)
  );
$$;

create or replace function public.can_read_room(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_room_member(target_room_id)
    or public.has_active_review_access(target_room_id);
$$;

create or replace function public.can_send_message_to_room(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.communication_rooms cr
    where cr.id = target_room_id
      and cr.archived_at is null
      and public.is_active_room_member(cr.id)
      and (
        cr.room_type <> 'DIRECT_WORK'
        or public.has_current_communication_policy_ack(cr.org_id, auth.uid())
      )
  );
$$;

grant execute on function public.is_active_room_member(uuid) to authenticated;
grant execute on function public.has_current_communication_policy_ack(uuid, uuid) to authenticated;
grant execute on function public.has_active_review_access(uuid) to authenticated;
grant execute on function public.can_read_room(uuid) to authenticated;
grant execute on function public.can_send_message_to_room(uuid) to authenticated;

alter table public.communication_retention_policies enable row level security;
alter table public.communication_policy_acknowledgements enable row level security;
alter table public.communication_rooms enable row level security;
alter table public.room_memberships enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.work_item_threads enable row level security;
alter table public.communication_review_access_grants enable row level security;
alter table public.communication_review_events enable row level security;

create policy communication_retention_policies_select_active_org_member
on public.communication_retention_policies for select
to authenticated
using (public.is_active_org_member(org_id));

create policy communication_policy_acknowledgements_select_own_or_admin
on public.communication_policy_acknowledgements for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_org_permission(org_id, 'communication.audit.review')
);

create policy communication_policy_acknowledgements_insert_own
on public.communication_policy_acknowledgements for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_active_org_member(org_id)
);

create policy communication_rooms_select_member_or_review_grant
on public.communication_rooms for select
to authenticated
using (public.can_read_room(id));

create policy room_memberships_select_room_reader
on public.room_memberships for select
to authenticated
using (public.can_read_room(room_id));

create policy messages_select_room_reader
on public.messages for select
to authenticated
using (public.can_read_room(room_id));

create policy messages_insert_current_room_member
on public.messages for insert
to authenticated
with check (
  author_user_id = auth.uid()
  and public.can_send_message_to_room(room_id)
  and exists (
    select 1
    from public.communication_rooms cr
    where cr.id = messages.room_id
      and cr.org_id = messages.org_id
  )
);

create policy message_reads_select_own
on public.message_reads for select
to authenticated
using (user_id = auth.uid() and public.can_read_room(room_id));

create policy message_reads_insert_own
on public.message_reads for insert
to authenticated
with check (user_id = auth.uid() and public.is_active_room_member(room_id));

create policy message_reads_update_own
on public.message_reads for update
to authenticated
using (user_id = auth.uid() and public.is_active_room_member(room_id))
with check (user_id = auth.uid() and public.is_active_room_member(room_id));

create policy work_item_threads_select_room_reader
on public.work_item_threads for select
to authenticated
using (public.can_read_room(room_id));

create policy communication_review_access_grants_select_reviewer_or_admin
on public.communication_review_access_grants for select
to authenticated
using (
  reviewer_user_id = auth.uid()
  or public.has_org_permission(org_id, 'communication.audit.review')
);

create policy communication_review_events_select_admin
on public.communication_review_events for select
to authenticated
using (public.has_org_permission(org_id, 'communication.audit.review'));
