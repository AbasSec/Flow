create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  language text not null default 'en',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status public.platform_admin_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger platform_admins_set_updated_at
before update on public.platform_admins
for each row execute function public.set_updated_at();

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  timezone text not null default 'Asia/Kuala_Lumpur',
  currency text not null default 'MYR',
  owner_user_id uuid references public.profiles(id),
  is_active boolean not null default true,
  communication_policy_version integer not null default 1 check (communication_policy_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organisations_set_updated_at
before update on public.organisations
for each row execute function public.set_updated_at();

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(name)) stored,
  site_type text not null default 'outlet',
  timezone text not null default 'Asia/Kuala_Lumpur',
  address jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index sites_org_normalized_name_active_key
on public.sites (org_id, normalized_name)
where is_active;

create trigger sites_set_updated_at
before update on public.sites
for each row execute function public.set_updated_at();

alter table public.sites add constraint sites_id_org_key unique (id, org_id);

create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  site_id uuid not null unique references public.sites(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (lower(name)) stored,
  currency text not null default 'MYR',
  service_charge_bps integer not null default 0 check (service_charge_bps between 0 and 10000),
  tax_bps integer not null default 0 check (tax_bps between 0 and 10000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outlets_site_org_consistency unique (id, org_id),
  constraint outlets_site_id_org_key unique (site_id, org_id)
);

create unique index outlets_org_normalized_name_active_key
on public.outlets (org_id, normalized_name)
where is_active;

create trigger outlets_set_updated_at
before update on public.outlets
for each row execute function public.set_updated_at();

create table public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.org_role not null,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index org_memberships_active_user_key
on public.org_memberships (org_id, user_id)
where deactivated_at is null;

create index org_memberships_user_active_idx
on public.org_memberships (user_id, org_id)
where deactivated_at is null;

create trigger org_memberships_set_updated_at
before update on public.org_memberships
for each row execute function public.set_updated_at();

create table public.site_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.org_role not null,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_memberships_site_org_fk foreign key (site_id, org_id)
    references public.sites (id, org_id) on delete cascade
);

create unique index site_memberships_active_user_key
on public.site_memberships (org_id, site_id, user_id)
where deactivated_at is null;

create trigger site_memberships_set_updated_at
before update on public.site_memberships
for each row execute function public.set_updated_at();

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  name text not null,
  normalized_name text generated always as (lower(name)) stored,
  team_type text not null default 'operations',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index teams_org_site_name_active_key
on public.teams (org_id, site_id, normalized_name)
where is_active;

create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.room_member_role not null default 'member',
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index team_memberships_active_user_key
on public.team_memberships (org_id, team_id, user_id)
where left_at is null;

create trigger team_memberships_set_updated_at
before update on public.team_memberships
for each row execute function public.set_updated_at();

create table public.permission_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  subject_type public.permission_subject_type not null,
  subject_id uuid not null,
  permission text not null,
  granted_by_user_id uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint permission_grants_permission_not_blank check (length(btrim(permission)) > 0)
);

create unique index permission_grants_active_key
on public.permission_grants (org_id, subject_type, subject_id, permission)
where revoked_at is null;

create table public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  platform_admin_id uuid not null references public.platform_admins(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  purpose text not null check (length(btrim(purpose)) > 0),
  approved_by_org_owner_id uuid not null references public.profiles(id),
  scope jsonb not null default '{}'::jsonb,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_access_grants_valid_window check (expires_at > granted_at)
);

create index support_access_grants_active_idx
on public.support_access_grants (platform_admin_id, org_id, expires_at)
where revoked_at is null;

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_active_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_memberships om
    join public.profiles p on p.id = om.user_id
    join public.organisations o on o.id = om.org_id
    where om.org_id = target_org_id
      and om.user_id = auth.uid()
      and om.deactivated_at is null
      and p.is_active
      and o.is_active
  );
$$;

create or replace function public.current_org_role(target_org_id uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public
as $$
  select om.role
  from public.org_memberships om
  where om.org_id = target_org_id
    and om.user_id = auth.uid()
    and om.deactivated_at is null
  limit 1;
$$;

create or replace function public.has_org_permission(target_org_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_org_member(target_org_id)
    and (
      public.current_org_role(target_org_id) in ('organisation_owner', 'organisation_admin')
      or exists (
        select 1
        from public.permission_grants pg
        where pg.org_id = target_org_id
          and pg.permission = required_permission
          and pg.revoked_at is null
          and (
            (pg.subject_type = 'user' and pg.subject_id = auth.uid())
            or (pg.subject_type = 'team' and exists (
              select 1
              from public.team_memberships tm
              where tm.org_id = target_org_id
                and tm.team_id = pg.subject_id
                and tm.user_id = auth.uid()
                and tm.left_at is null
            ))
          )
      )
    );
$$;

create or replace function public.is_active_site_member(target_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sites s
    where s.id = target_site_id
      and public.is_active_org_member(s.org_id)
      and (
        not exists (
          select 1 from public.site_memberships sm
          where sm.site_id = target_site_id
            and sm.deactivated_at is null
        )
        or exists (
          select 1 from public.site_memberships sm
          where sm.site_id = target_site_id
            and sm.user_id = auth.uid()
            and sm.deactivated_at is null
        )
      )
  );
$$;

create or replace function public.is_active_outlet_member(target_outlet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.outlets o
    where o.id = target_outlet_id
      and public.is_active_org_member(o.org_id)
      and public.is_active_site_member(o.site_id)
  );
$$;

grant execute on function public.current_user_id() to authenticated;
grant execute on function public.is_active_org_member(uuid) to authenticated;
grant execute on function public.current_org_role(uuid) to authenticated;
grant execute on function public.has_org_permission(uuid, text) to authenticated;
grant execute on function public.is_active_site_member(uuid) to authenticated;
grant execute on function public.is_active_outlet_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.organisations enable row level security;
alter table public.sites enable row level security;
alter table public.outlets enable row level security;
alter table public.org_memberships enable row level security;
alter table public.site_memberships enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.permission_grants enable row level security;
alter table public.support_access_grants enable row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_own
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy platform_admins_select_own
on public.platform_admins for select
to authenticated
using (user_id = auth.uid());

create policy organisations_select_active_member
on public.organisations for select
to authenticated
using (public.is_active_org_member(id));

create policy sites_select_active_org_member
on public.sites for select
to authenticated
using (public.is_active_org_member(org_id));

create policy outlets_select_active_outlet_member
on public.outlets for select
to authenticated
using (public.is_active_outlet_member(id));

create policy org_memberships_select_active_org_member
on public.org_memberships for select
to authenticated
using (public.is_active_org_member(org_id));

create policy site_memberships_select_active_org_member
on public.site_memberships for select
to authenticated
using (public.is_active_org_member(org_id));

create policy teams_select_active_org_member
on public.teams for select
to authenticated
using (public.is_active_org_member(org_id));

create policy team_memberships_select_active_org_member
on public.team_memberships for select
to authenticated
using (public.is_active_org_member(org_id));

create policy permission_grants_select_active_org_member
on public.permission_grants for select
to authenticated
using (public.is_active_org_member(org_id));

create policy support_access_grants_select_approver_or_platform_admin
on public.support_access_grants for select
to authenticated
using (
  approved_by_org_owner_id = auth.uid()
  or exists (
    select 1 from public.platform_admins pa
    where pa.id = support_access_grants.platform_admin_id
      and pa.user_id = auth.uid()
      and pa.status = 'active'
  )
);
