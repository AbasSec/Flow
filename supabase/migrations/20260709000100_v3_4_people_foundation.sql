-- V3.4: People Foundation.
-- Adds controlled staff/member management for Flow.
-- Operates on existing tables: org_memberships, site_memberships,
-- kitchen_station_memberships, profiles, outlets, sites,
-- kitchen_stations, audit_events. No new tables.
--
-- Non-regression guarantee:
--   Does not modify any flow_v3_1_*, flow_v3_3_*, flow_m3_*, or flow_m4_* functions.
--   Does not alter any existing table schemas or constraints.
--   Migrations 001-012 are not modified.
--
-- Corrections applied (per owner review 2026-07-09):
--   1. actor_role := flow_m3_require_role(...) in RPC 2 (not perform)
--   2. Station target must have kitchen role + outlet assignment (no owner/admin exception)
--   3. Manager removed from RPC 6 and RPC 7 allowed roles
--   4. Audit inserts match real public.audit_events column set exactly
--   5. org_memberships partial unique index respected; kitchen_station_memberships full constraint respected

-- ── RPC 1: flow_v3_4_list_org_staff ─────────────────────────────────────────────
-- Read-only. Returns org staff roster scoped by actor role.
-- Manager path is fail-closed: empty roster if actor has no active site_memberships.

create or replace function public.flow_v3_4_list_org_staff(target_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.org_role;
  actor_site_ids uuid[];
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  actor_role := public.flow_m3_require_role(
    target_org_id,
    array['organisation_owner','organisation_admin','manager']::public.org_role[]
  );

  -- Manager path: fail-closed on site scope
  if actor_role = 'manager' then
    select array_agg(sm.site_id)
    into actor_site_ids
    from public.site_memberships sm
    where sm.org_id = target_org_id
      and sm.user_id = actor_id
      and sm.deactivated_at is null;

    if actor_site_ids is null or cardinality(actor_site_ids) = 0 then
      return jsonb_build_object(
        'members', '[]'::jsonb,
        'scoped', true,
        'reason', 'no_outlet_assignment'
      );
    end if;

    -- Return only active members who share a site with the actor; no email exposed
    return jsonb_build_object(
      'members', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'user_id', m.user_id,
            'full_name', p.full_name,
            'email', null,
            'org_role', m.role,
            'is_active', true,
            'outlet_assignments', coalesce((
              select jsonb_agg(jsonb_build_object(
                'outlet_id', o.id,
                'outlet_name', o.name,
                'site_id', sm2.site_id,
                'role', sm2.role
              ))
              from public.site_memberships sm2
              join public.outlets o on o.site_id = sm2.site_id and o.org_id = sm2.org_id
              where sm2.org_id = target_org_id
                and sm2.user_id = m.user_id
                and sm2.deactivated_at is null
                and sm2.site_id = any(actor_site_ids)
            ), '[]'::jsonb),
            'station_assignments', coalesce((
              select jsonb_agg(jsonb_build_object(
                'station_id', ksm.station_id,
                'station_name', ks.name,
                'outlet_id', ksm.outlet_id,
                'is_revoked', false
              ))
              from public.kitchen_station_memberships ksm
              join public.kitchen_stations ks on ks.id = ksm.station_id
              join public.outlets o2 on o2.id = ksm.outlet_id
              where ksm.org_id = target_org_id
                and ksm.user_id = m.user_id
                and ksm.revoked_at is null
                and o2.site_id = any(actor_site_ids)
            ), '[]'::jsonb)
          )
        )
        from public.org_memberships m
        join public.profiles p on p.id = m.user_id
        where m.org_id = target_org_id
          and m.deactivated_at is null
          and exists (
            select 1
            from public.site_memberships sm_check
            where sm_check.org_id = target_org_id
              and sm_check.user_id = m.user_id
              and sm_check.deactivated_at is null
              and sm_check.site_id = any(actor_site_ids)
          )
      ), '[]'::jsonb),
      'scoped', true
    );
  end if;

  -- Owner/Admin path: full roster including inactive members
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', m.user_id,
          'full_name', p.full_name,
          'email', p.email,
          'org_role', m.role,
          'is_active', (m.deactivated_at is null),
          'outlet_assignments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'outlet_id', o.id,
              'outlet_name', o.name,
              'site_id', sm2.site_id,
              'role', sm2.role
            ))
            from public.site_memberships sm2
            join public.outlets o on o.site_id = sm2.site_id and o.org_id = sm2.org_id
            where sm2.org_id = target_org_id
              and sm2.user_id = m.user_id
              and sm2.deactivated_at is null
          ), '[]'::jsonb),
          'station_assignments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'station_id', ksm.station_id,
              'station_name', ks.name,
              'outlet_id', ksm.outlet_id,
              'is_revoked', (ksm.revoked_at is not null)
            ))
            from public.kitchen_station_memberships ksm
            join public.kitchen_stations ks on ks.id = ksm.station_id
            where ksm.org_id = target_org_id
              and ksm.user_id = m.user_id
          ), '[]'::jsonb)
        )
      )
      from public.org_memberships m
      join public.profiles p on p.id = m.user_id
      where m.org_id = target_org_id
    ), '[]'::jsonb),
    'scoped', false
  );
end;
$$;

-- ── RPC 2: flow_v3_4_add_member ─────────────────────────────────────────────────
-- Links an existing Flow profile to the org by email. Not an invitation.
-- Correction 1: actor_role := flow_m3_require_role(...) to enable admin ceiling check.

create or replace function public.flow_v3_4_add_member(
  target_org_id uuid,
  target_email text,
  new_role public.org_role
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.org_role;
  normalized_email text;
  target_user_id uuid;
  existing_membership public.org_memberships%rowtype;
  new_membership_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Correction 1: assign return value to check actor_role for admin ceiling
  actor_role := public.flow_m3_require_role(
    target_org_id,
    array['organisation_owner','organisation_admin']::public.org_role[]
  );

  -- Admin ceiling: cannot assign organisation_owner role
  if actor_role = 'organisation_admin' and new_role = 'organisation_owner' then
    raise exception 'Admins cannot assign the Organisation Owner role.' using errcode = '42501';
  end if;

  -- Normalise email (correction 3 of revised spec)
  normalized_email := lower(trim(target_email));

  if normalized_email is null or length(normalized_email) = 0 then
    raise exception 'Email address is required.';
  end if;

  -- Profile lookup
  select id into target_user_id
  from public.profiles
  where lower(trim(email)) = normalized_email
  limit 1;

  if not found then
    raise exception 'No existing Flow account was found for that email.' using errcode = 'P0002';
  end if;

  -- No self-add
  if target_user_id = actor_id then
    raise exception 'You cannot add yourself via this form.' using errcode = '42501';
  end if;

  -- Check for existing membership (partial unique index: only one active row, but
  -- multiple deactivated rows may exist; take the most recent)
  select * into existing_membership
  from public.org_memberships
  where org_id = target_org_id
    and user_id = target_user_id
  order by created_at desc
  limit 1;

  -- Active membership: idempotent
  if found and existing_membership.deactivated_at is null then
    return jsonb_build_object('ok', true, 'status', 'already_active', 'user_id', target_user_id);
  end if;

  -- Deactivated membership: reactivate and update role
  if found and existing_membership.deactivated_at is not null then
    update public.org_memberships
    set deactivated_at = null,
        role = new_role
    where id = existing_membership.id;

    insert into public.audit_events (
      org_id, actor_user_id, action, object_type, object_id,
      before_data, after_data
    ) values (
      target_org_id, actor_id,
      'STAFF_MEMBER_REACTIVATED', 'org_memberships', existing_membership.id,
      jsonb_build_object('is_active', false, 'role', existing_membership.role),
      jsonb_build_object('is_active', true, 'role', new_role)
    );

    return jsonb_build_object('ok', true, 'status', 'reactivated', 'user_id', target_user_id);
  end if;

  -- New membership
  insert into public.org_memberships (org_id, user_id, role)
  values (target_org_id, target_user_id, new_role)
  returning id into new_membership_id;

  insert into public.audit_events (
    org_id, actor_user_id, action, object_type, object_id, after_data
  ) values (
    target_org_id, actor_id,
    'STAFF_MEMBER_ADDED', 'org_memberships', new_membership_id,
    jsonb_build_object('email', normalized_email, 'role', new_role)
  );

  return jsonb_build_object('ok', true, 'status', 'added', 'user_id', target_user_id);
end;
$$;

-- ── RPC 3: flow_v3_4_update_member_role ─────────────────────────────────────────
-- Changes an active member's org role. Enforces lockout guard and admin ceiling.

create or replace function public.flow_v3_4_update_member_role(
  target_org_id uuid,
  target_user_id uuid,
  new_role public.org_role
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.org_role;
  target_membership public.org_memberships%rowtype;
  remaining_admins integer;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  actor_role := public.flow_m3_require_role(
    target_org_id,
    array['organisation_owner','organisation_admin']::public.org_role[]
  );

  -- No self-modification
  if actor_id = target_user_id then
    raise exception 'You cannot change your own role.' using errcode = '42501';
  end if;

  select * into target_membership
  from public.org_memberships
  where org_id = target_org_id
    and user_id = target_user_id
    and deactivated_at is null;

  if not found then
    raise exception 'Active membership not found for this user in the organisation.' using errcode = 'P0002';
  end if;

  -- Admin ceiling
  if actor_role = 'organisation_admin' then
    if new_role = 'organisation_owner' then
      raise exception 'Admins cannot assign the Organisation Owner role.' using errcode = '42501';
    end if;
    if target_membership.role = 'organisation_owner' then
      raise exception 'Admins cannot change an Organisation Owner''s role.' using errcode = '42501';
    end if;
  end if;

  -- Lockout guard: only fires when changing away from an authority role
  if target_membership.role in ('organisation_owner','organisation_admin') then
    select count(*)::integer into remaining_admins
    from public.org_memberships
    where org_id = target_org_id
      and role in ('organisation_owner','organisation_admin')
      and deactivated_at is null
      and user_id <> target_user_id;

    if remaining_admins = 0 then
      raise exception 'This change would remove the last active administrator. At least one Owner or Admin must remain active.' using errcode = '42501';
    end if;
  end if;

  update public.org_memberships
  set role = new_role
  where id = target_membership.id;

  insert into public.audit_events (
    org_id, actor_user_id, action, object_type, object_id,
    before_data, after_data
  ) values (
    target_org_id, actor_id,
    'STAFF_ROLE_UPDATED', 'org_memberships', target_membership.id,
    jsonb_build_object('role', target_membership.role),
    jsonb_build_object('role', new_role)
  );

  return jsonb_build_object(
    'ok', true,
    'user_id', target_user_id,
    'old_role', target_membership.role,
    'new_role', new_role
  );
end;
$$;

-- ── RPC 4: flow_v3_4_assign_member_outlet ───────────────────────────────────────
-- Assigns a staff member to an outlet via site_memberships.
-- Owner/Admin targets return org_wide_access no-op without writing an audit event.

create or replace function public.flow_v3_4_assign_member_outlet(
  target_org_id uuid,
  target_user_id uuid,
  target_outlet_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  outlet_site_id uuid;
  outlet_name text;
  target_member_role public.org_role;
  existing_sm public.site_memberships%rowtype;
  new_sm_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform public.flow_m3_require_role(
    target_org_id,
    array['organisation_owner','organisation_admin']::public.org_role[]
  );

  -- Outlet must belong to org
  select o.site_id, o.name into outlet_site_id, outlet_name
  from public.outlets o
  where o.id = target_outlet_id
    and o.org_id = target_org_id
    and o.is_active;

  if not found then
    raise exception 'Outlet not found or does not belong to this organisation.' using errcode = 'P0002';
  end if;

  -- Target user must have active org membership
  select role into target_member_role
  from public.org_memberships
  where org_id = target_org_id
    and user_id = target_user_id
    and deactivated_at is null;

  if not found then
    raise exception 'Target user does not have an active membership in this organisation.' using errcode = 'P0002';
  end if;

  -- Owner/Admin have org-wide access: no-op, no audit event written
  if target_member_role in ('organisation_owner','organisation_admin') then
    return jsonb_build_object(
      'ok', true,
      'status', 'org_wide_access',
      'message', 'This user already has organisation-wide outlet access.'
    );
  end if;

  -- Check for existing site_membership
  select * into existing_sm
  from public.site_memberships
  where org_id = target_org_id
    and site_id = outlet_site_id
    and user_id = target_user_id
  order by created_at desc
  limit 1;

  -- Already actively assigned: idempotent
  if found and existing_sm.deactivated_at is null then
    return jsonb_build_object('ok', true, 'status', 'already_assigned');
  end if;

  if found and existing_sm.deactivated_at is not null then
    -- Reactivate deactivated assignment
    update public.site_memberships
    set deactivated_at = null
    where id = existing_sm.id;
    new_sm_id := existing_sm.id;
  else
    -- New assignment
    insert into public.site_memberships (org_id, site_id, user_id, role)
    values (target_org_id, outlet_site_id, target_user_id, target_member_role)
    returning id into new_sm_id;
  end if;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, after_data
  ) values (
    target_org_id, target_outlet_id, actor_id,
    'STAFF_OUTLET_ASSIGNED', 'site_memberships', new_sm_id,
    jsonb_build_object('outlet_id', target_outlet_id, 'outlet_name', outlet_name, 'site_id', outlet_site_id)
  );

  return jsonb_build_object('ok', true, 'status', 'assigned');
end;
$$;

-- ── RPC 5: flow_v3_4_remove_member_outlet ───────────────────────────────────────
-- Soft-removes an outlet assignment. Owner/Admin targets return no-op.

create or replace function public.flow_v3_4_remove_member_outlet(
  target_org_id uuid,
  target_user_id uuid,
  target_outlet_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  outlet_site_id uuid;
  outlet_name text;
  target_member_role public.org_role;
  existing_sm public.site_memberships%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform public.flow_m3_require_role(
    target_org_id,
    array['organisation_owner','organisation_admin']::public.org_role[]
  );

  -- No self-removal of own outlet access
  if actor_id = target_user_id then
    raise exception 'You cannot remove your own outlet access.' using errcode = '42501';
  end if;

  -- Outlet must belong to org
  select o.site_id, o.name into outlet_site_id, outlet_name
  from public.outlets o
  where o.id = target_outlet_id
    and o.org_id = target_org_id;

  if not found then
    raise exception 'Outlet not found or does not belong to this organisation.' using errcode = 'P0002';
  end if;

  -- Target user must have active org membership
  select role into target_member_role
  from public.org_memberships
  where org_id = target_org_id
    and user_id = target_user_id
    and deactivated_at is null;

  if not found then
    raise exception 'Target user does not have an active membership in this organisation.' using errcode = 'P0002';
  end if;

  -- Owner/Admin have org-wide access: no-op, no audit event
  if target_member_role in ('organisation_owner','organisation_admin') then
    return jsonb_build_object(
      'ok', true,
      'status', 'org_wide_access',
      'message', 'This user has organisation-wide outlet access; no site assignment to remove.'
    );
  end if;

  -- Find active site_membership
  select * into existing_sm
  from public.site_memberships
  where org_id = target_org_id
    and site_id = outlet_site_id
    and user_id = target_user_id
    and deactivated_at is null;

  if not found then
    raise exception 'No active outlet assignment found for this user.' using errcode = 'P0002';
  end if;

  update public.site_memberships
  set deactivated_at = now()
  where id = existing_sm.id;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, before_data
  ) values (
    target_org_id, target_outlet_id, actor_id,
    'STAFF_OUTLET_REMOVED', 'site_memberships', existing_sm.id,
    jsonb_build_object('outlet_id', target_outlet_id, 'outlet_name', outlet_name, 'site_id', outlet_site_id)
  );

  return jsonb_build_object('ok', true, 'status', 'removed');
end;
$$;

-- ── RPC 6: flow_v3_4_assign_kitchen_station ─────────────────────────────────────
-- Assigns a kitchen staff member to a station.
-- Correction 2: target must have kitchen role and active outlet assignment; no owner/admin exception.
-- Correction 3: owner/admin only — manager removed from allowed roles in V3.4.

create or replace function public.flow_v3_4_assign_kitchen_station(
  target_org_id uuid,
  target_outlet_id uuid,
  target_station_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  outlet_site_id uuid;
  station_name text;
  target_member_role public.org_role;
  existing_ksm public.kitchen_station_memberships%rowtype;
  ksm_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Correction 3: owner/admin only in V3.4; manager station-write deferred to V3.4.1
  perform public.flow_m3_require_role(
    target_org_id,
    array['organisation_owner','organisation_admin']::public.org_role[]
  );

  -- Outlet must belong to org
  select o.site_id into outlet_site_id
  from public.outlets o
  where o.id = target_outlet_id
    and o.org_id = target_org_id
    and o.is_active;

  if not found then
    raise exception 'Outlet not found or does not belong to this organisation.' using errcode = 'P0002';
  end if;

  -- Station must belong to this outlet and org
  select ks.name into station_name
  from public.kitchen_stations ks
  where ks.id = target_station_id
    and ks.outlet_id = target_outlet_id
    and ks.org_id = target_org_id
    and ks.is_active;

  if not found then
    raise exception 'Station does not belong to this outlet.' using errcode = 'P0002';
  end if;

  -- Target user must have active org membership
  select role into target_member_role
  from public.org_memberships
  where org_id = target_org_id
    and user_id = target_user_id
    and deactivated_at is null;

  if not found then
    raise exception 'Target user does not have an active membership in this organisation.' using errcode = 'P0002';
  end if;

  -- Correction 2: target must have kitchen role; no exception for owner/admin targets
  if target_member_role <> 'kitchen' then
    raise exception 'Station assignments are only available for kitchen role staff.' using errcode = '42501';
  end if;

  -- Target must have active outlet/site assignment for this station's outlet
  if not exists (
    select 1
    from public.site_memberships sm
    where sm.org_id = target_org_id
      and sm.site_id = outlet_site_id
      and sm.user_id = target_user_id
      and sm.deactivated_at is null
  ) then
    raise exception 'Target staff member is not assigned to this outlet.' using errcode = '42501';
  end if;

  -- Upsert: kitchen_station_memberships has a full unique constraint (not partial)
  -- so there is at most one row per (org_id, outlet_id, station_id, user_id)
  select * into existing_ksm
  from public.kitchen_station_memberships
  where org_id = target_org_id
    and outlet_id = target_outlet_id
    and station_id = target_station_id
    and user_id = target_user_id;

  if found then
    if existing_ksm.revoked_at is null then
      return jsonb_build_object('ok', true, 'status', 'already_assigned');
    end if;
    -- Reactivate revoked assignment
    update public.kitchen_station_memberships
    set revoked_at = null
    where id = existing_ksm.id;
    ksm_id := existing_ksm.id;
  else
    insert into public.kitchen_station_memberships (org_id, outlet_id, station_id, user_id)
    values (target_org_id, target_outlet_id, target_station_id, target_user_id)
    returning id into ksm_id;
  end if;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, after_data
  ) values (
    target_org_id, target_outlet_id, actor_id,
    'STAFF_STATION_ASSIGNED', 'kitchen_station_memberships', ksm_id,
    jsonb_build_object('station_id', target_station_id, 'station_name', station_name, 'outlet_id', target_outlet_id)
  );

  return jsonb_build_object('ok', true, 'status', 'assigned');
end;
$$;

-- ── RPC 7: flow_v3_4_revoke_kitchen_station ─────────────────────────────────────
-- Revokes a kitchen station assignment.
-- Correction 3: owner/admin only in V3.4.

create or replace function public.flow_v3_4_revoke_kitchen_station(
  target_org_id uuid,
  target_outlet_id uuid,
  target_station_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  station_name text;
  existing_ksm public.kitchen_station_memberships%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Correction 3: owner/admin only in V3.4
  perform public.flow_m3_require_role(
    target_org_id,
    array['organisation_owner','organisation_admin']::public.org_role[]
  );

  -- Outlet must belong to org
  if not exists (
    select 1
    from public.outlets o
    where o.id = target_outlet_id
      and o.org_id = target_org_id
  ) then
    raise exception 'Outlet not found or does not belong to this organisation.' using errcode = 'P0002';
  end if;

  -- Station must belong to this outlet and org
  select ks.name into station_name
  from public.kitchen_stations ks
  where ks.id = target_station_id
    and ks.outlet_id = target_outlet_id
    and ks.org_id = target_org_id;

  if not found then
    raise exception 'Station does not belong to this outlet.' using errcode = 'P0002';
  end if;

  -- Target user must have active org membership
  if not exists (
    select 1
    from public.org_memberships
    where org_id = target_org_id
      and user_id = target_user_id
      and deactivated_at is null
  ) then
    raise exception 'Target user does not have an active membership in this organisation.' using errcode = 'P0002';
  end if;

  -- Find active station membership
  select * into existing_ksm
  from public.kitchen_station_memberships
  where org_id = target_org_id
    and outlet_id = target_outlet_id
    and station_id = target_station_id
    and user_id = target_user_id
    and revoked_at is null;

  if not found then
    raise exception 'No active station assignment found for this user.' using errcode = 'P0002';
  end if;

  update public.kitchen_station_memberships
  set revoked_at = now()
  where id = existing_ksm.id;

  insert into public.audit_events (
    org_id, outlet_id, actor_user_id, action, object_type, object_id, before_data
  ) values (
    target_org_id, target_outlet_id, actor_id,
    'STAFF_STATION_REVOKED', 'kitchen_station_memberships', existing_ksm.id,
    jsonb_build_object('station_id', target_station_id, 'station_name', station_name, 'outlet_id', target_outlet_id)
  );

  return jsonb_build_object('ok', true, 'status', 'revoked');
end;
$$;

-- ── RPC 8: flow_v3_4_deactivate_member ──────────────────────────────────────────
-- Soft-deactivates an org membership. Cascades to site_memberships.
-- Lockout guard protects against removing the last active administrator.

create or replace function public.flow_v3_4_deactivate_member(
  target_org_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.org_role;
  target_membership public.org_memberships%rowtype;
  remaining_admins integer;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  actor_role := public.flow_m3_require_role(
    target_org_id,
    array['organisation_owner','organisation_admin']::public.org_role[]
  );

  -- No self-deactivation
  if actor_id = target_user_id then
    raise exception 'You cannot deactivate yourself.' using errcode = '42501';
  end if;

  select * into target_membership
  from public.org_memberships
  where org_id = target_org_id
    and user_id = target_user_id
    and deactivated_at is null;

  if not found then
    raise exception 'Active membership not found for this user in the organisation.' using errcode = 'P0002';
  end if;

  -- Admin cannot deactivate owner
  if actor_role = 'organisation_admin' and target_membership.role = 'organisation_owner' then
    raise exception 'Admins cannot deactivate an Organisation Owner.' using errcode = '42501';
  end if;

  -- Lockout guard: at least one active owner/admin must remain
  select count(*)::integer into remaining_admins
  from public.org_memberships
  where org_id = target_org_id
    and role in ('organisation_owner','organisation_admin')
    and deactivated_at is null
    and user_id <> target_user_id;

  if remaining_admins = 0 then
    raise exception 'This action would remove the last active administrator. At least one Owner or Admin must remain active.' using errcode = '42501';
  end if;

  update public.org_memberships
  set deactivated_at = now()
  where id = target_membership.id;

  -- Cascade: deactivate all active site_memberships for this user in this org
  update public.site_memberships
  set deactivated_at = now()
  where org_id = target_org_id
    and user_id = target_user_id
    and deactivated_at is null;

  insert into public.audit_events (
    org_id, actor_user_id, action, object_type, object_id,
    before_data, after_data
  ) values (
    target_org_id, actor_id,
    'STAFF_MEMBER_DEACTIVATED', 'org_memberships', target_membership.id,
    jsonb_build_object('is_active', true, 'role', target_membership.role),
    jsonb_build_object('is_active', false)
  );

  return jsonb_build_object('ok', true, 'user_id', target_user_id, 'status', 'deactivated');
end;
$$;

-- ── RPC 9: flow_v3_4_reactivate_member ──────────────────────────────────────────
-- Clears deactivated_at on an org membership. Site memberships must be
-- explicitly re-assigned after reactivation to prevent stale assignments.

create or replace function public.flow_v3_4_reactivate_member(
  target_org_id uuid,
  target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.org_role;
  target_membership public.org_memberships%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  actor_role := public.flow_m3_require_role(
    target_org_id,
    array['organisation_owner','organisation_admin']::public.org_role[]
  );

  if actor_id = target_user_id then
    raise exception 'You cannot reactivate yourself via this form.' using errcode = '42501';
  end if;

  -- Find most recent deactivated membership
  select * into target_membership
  from public.org_memberships
  where org_id = target_org_id
    and user_id = target_user_id
    and deactivated_at is not null
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'No deactivated membership found for this user.' using errcode = 'P0002';
  end if;

  -- Admin cannot reactivate an owner
  if actor_role = 'organisation_admin' and target_membership.role = 'organisation_owner' then
    raise exception 'Admins cannot reactivate an Organisation Owner. Only an Owner can restore another Owner.' using errcode = '42501';
  end if;

  update public.org_memberships
  set deactivated_at = null
  where id = target_membership.id;

  insert into public.audit_events (
    org_id, actor_user_id, action, object_type, object_id,
    before_data, after_data
  ) values (
    target_org_id, actor_id,
    'STAFF_MEMBER_REACTIVATED', 'org_memberships', target_membership.id,
    jsonb_build_object('is_active', false, 'role', target_membership.role),
    jsonb_build_object('is_active', true, 'role', target_membership.role)
  );

  return jsonb_build_object('ok', true, 'user_id', target_user_id, 'status', 'reactivated');
end;
$$;

-- ── Grant model: deny-first, authenticated only ──────────────────────────────────
-- Anonymous callers are never granted execute permissions. Role authority enforced inside each RPC body.

revoke all on function public.flow_v3_4_list_org_staff(uuid) from public;
revoke all on function public.flow_v3_4_list_org_staff(uuid) from anon;
revoke all on function public.flow_v3_4_list_org_staff(uuid) from authenticated;
grant execute on function public.flow_v3_4_list_org_staff(uuid) to authenticated;

revoke all on function public.flow_v3_4_add_member(uuid, text, public.org_role) from public;
revoke all on function public.flow_v3_4_add_member(uuid, text, public.org_role) from anon;
revoke all on function public.flow_v3_4_add_member(uuid, text, public.org_role) from authenticated;
grant execute on function public.flow_v3_4_add_member(uuid, text, public.org_role) to authenticated;

revoke all on function public.flow_v3_4_update_member_role(uuid, uuid, public.org_role) from public;
revoke all on function public.flow_v3_4_update_member_role(uuid, uuid, public.org_role) from anon;
revoke all on function public.flow_v3_4_update_member_role(uuid, uuid, public.org_role) from authenticated;
grant execute on function public.flow_v3_4_update_member_role(uuid, uuid, public.org_role) to authenticated;

revoke all on function public.flow_v3_4_assign_member_outlet(uuid, uuid, uuid) from public;
revoke all on function public.flow_v3_4_assign_member_outlet(uuid, uuid, uuid) from anon;
revoke all on function public.flow_v3_4_assign_member_outlet(uuid, uuid, uuid) from authenticated;
grant execute on function public.flow_v3_4_assign_member_outlet(uuid, uuid, uuid) to authenticated;

revoke all on function public.flow_v3_4_remove_member_outlet(uuid, uuid, uuid) from public;
revoke all on function public.flow_v3_4_remove_member_outlet(uuid, uuid, uuid) from anon;
revoke all on function public.flow_v3_4_remove_member_outlet(uuid, uuid, uuid) from authenticated;
grant execute on function public.flow_v3_4_remove_member_outlet(uuid, uuid, uuid) to authenticated;

revoke all on function public.flow_v3_4_assign_kitchen_station(uuid, uuid, uuid, uuid) from public;
revoke all on function public.flow_v3_4_assign_kitchen_station(uuid, uuid, uuid, uuid) from anon;
revoke all on function public.flow_v3_4_assign_kitchen_station(uuid, uuid, uuid, uuid) from authenticated;
grant execute on function public.flow_v3_4_assign_kitchen_station(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.flow_v3_4_revoke_kitchen_station(uuid, uuid, uuid, uuid) from public;
revoke all on function public.flow_v3_4_revoke_kitchen_station(uuid, uuid, uuid, uuid) from anon;
revoke all on function public.flow_v3_4_revoke_kitchen_station(uuid, uuid, uuid, uuid) from authenticated;
grant execute on function public.flow_v3_4_revoke_kitchen_station(uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.flow_v3_4_deactivate_member(uuid, uuid) from public;
revoke all on function public.flow_v3_4_deactivate_member(uuid, uuid) from anon;
revoke all on function public.flow_v3_4_deactivate_member(uuid, uuid) from authenticated;
grant execute on function public.flow_v3_4_deactivate_member(uuid, uuid) to authenticated;

revoke all on function public.flow_v3_4_reactivate_member(uuid, uuid) from public;
revoke all on function public.flow_v3_4_reactivate_member(uuid, uuid) from anon;
revoke all on function public.flow_v3_4_reactivate_member(uuid, uuid) from authenticated;
grant execute on function public.flow_v3_4_reactivate_member(uuid, uuid) to authenticated;
