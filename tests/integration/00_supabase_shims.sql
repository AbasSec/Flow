-- Supabase compatibility shims for bare PostgreSQL.
-- Provides the auth schema, auth.users table, auth.uid() function,
-- and extensions schema that Supabase normally supplies.
-- Used only by the local regression test runner.

create schema if not exists auth;
create schema if not exists extensions;

-- extensions.gen_random_bytes is provided by pgcrypto loaded into extensions schema
create extension if not exists pgcrypto with schema extensions;

-- Minimal auth.users table for FK references from public.profiles
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- auth.uid() reads the JWT sub claim from the GUC set by pg_temp.set_actor.
-- This matches the mechanism Supabase uses in production.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid
$$;

-- auth.role() returns the role from the JWT claims (used by some RLS policies)
create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    'anon'
  )
$$;
