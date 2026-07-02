# Milestone 2A Report - Identity, Tenant Isolation, Database Foundation, and Demo Seed Preparation

## Scope Completed

Accelerated Milestone 2A was implemented only as the approved database/auth foundation and BrewBite Kitchen seed preparation.

Completed:

- Added Supabase CLI tooling and safe pnpm database scripts.
- Added local Supabase configuration for versioned migrations.
- Created forward-only foundational SQL migrations for identity, tenancy, Flow Connect foundation, F&B foundation, audit, and outbox.
- Added deny-by-default RLS groundwork for tenant-owned tables.
- Added helper functions for active organisation membership, outlet scope, room membership, communication policy acknowledgement, and temporary review access.
- Added real Supabase email/password `/login`, sign-out, and protected `/app` workspace placeholder.
- Added server-only Supabase admin client factory and safe environment validation.
- Added server-only reproducible BrewBite Kitchen seed script.
- Added focused unit/static tests for membership resolution, platform admin tenant isolation assumptions, Direct Work participant canonicalization, communication policy acknowledgement, review grant expiry, core state guards, and migration constraints.

Not implemented:

- No payment gateway, payment callback, order flow UI, kitchen UI, QR UI, dashboard UI, Flow Connect UI, AI, Docker, CI/CD, deployment, or public demo URL.
- No fake business workflows were added.

## Files Created or Changed

Changed existing files:

- `.env.example`
- `lib/db/server.ts`
- `lib/validation/env.ts`
- `package.json`
- `pnpm-lock.yaml`
- `vitest.config.ts`

Created files:

- `app/app/actions.ts`
- `app/app/page.tsx`
- `app/login/actions.ts`
- `app/login/page.tsx`
- `lib/auth/access.ts`
- `lib/auth/session.ts`
- `lib/communication/direct-work.ts`
- `lib/communication/policy.ts`
- `lib/communication/review.ts`
- `lib/domain/states.ts`
- `scripts/seed-brewbite.mjs`
- `supabase/config.toml`
- `supabase/migrations/20260702000100_extensions_enums_helpers.sql`
- `supabase/migrations/20260702000200_identity_tenancy_rls.sql`
- `supabase/migrations/20260702000300_audit_outbox.sql`
- `supabase/migrations/20260702000400_communication_foundation_rls.sql`
- `supabase/migrations/20260702000500_fnb_foundation_rls.sql`
- `supabase/migrations/20260702000600_data_api_privileges.sql`
- `tests/unit/data-api-grants.test.ts`
- `tests/unit/access.test.ts`
- `tests/unit/communication.test.ts`
- `tests/unit/migrations-static.test.ts`
- `tests/unit/platform-access.test.ts`
- `tests/unit/states.test.ts`
- `docs/MILESTONE_2A_REPORT.md`

Unrelated untracked files already present in the working tree were preserved and not edited:

- `APPLY_FLOW_DOCS_V2.sh`
- `DOCUMENT_UPDATE_SUMMARY.md`
- `SHA256SUMS.txt`

## Dependency Choices

Added development dependency:

- `supabase` CLI package for local database lifecycle, migration validation, and future controlled database application.

No payment, AI, charting, QR, editor, attachment, chat-specific UI, or deployment dependencies were added.

## Migrations Created

| Order | Migration | Purpose |
| --- | --- | --- |
| 1 | `20260702000100_extensions_enums_helpers.sql` | `pgcrypto`, constrained enum types, shared `updated_at` trigger helper. |
| 2 | `20260702000200_identity_tenancy_rls.sql` | Profiles, platform admins, organisations, sites, outlets, memberships, teams, permission grants, support access grants, tenant helper functions, identity/tenancy RLS. |
| 3 | `20260702000300_audit_outbox.sql` | Shared immutable audit and transactional outbox foundation. |
| 4 | `20260702000400_communication_foundation_rls.sql` | Communication retention, policy acknowledgements, rooms, memberships, messages, reads, work-item threads, review grants/events, communication helper functions, communication RLS. |
| 5 | `20260702000500_fnb_foundation_rls.sql` | F&B menu, recipe, inventory ledger, table session, order, kitchen station, kitchen ticket foundation and outlet-scoped RLS. |
| 6 | `20260702000600_data_api_privileges.sql` | Explicit Data API schema/table privileges for `service_role` and narrowly scoped `authenticated` access behind RLS. |

Migration architecture notes:

- Migrations are forward-only.
- `sites.id` and `outlets.id` are separate UUID primary keys.
- `outlets.site_id` is a unique foreign key to `sites.id`.
- F&B records reference `outlets.id` through `outlet_id`.
- Tenant-owned business and communication tables include `org_id`.
- Money fields use integer sen columns.
- Orders separate `service_status` from `payment_status`.
- Direct Work uniqueness uses `participant_set_hash`.
- No Billplz, payment callback, attachment, mention, reaction, search, export, announcement, handover, incident, task, or AI tables were created.

## Data API Grant Correction

Supabase Data API table exposure requires Postgres privileges in addition to RLS policies. Because automatic Data API exposure is not being relied on, `20260702000600_data_api_privileges.sql` adds explicit forward-only grants:

- `USAGE` on schema `public` only to `authenticated` and `service_role`.
- `service_role` gets explicit `select`, `insert`, and `update` grants on the Flow application tables created in migrations 001-005, so the server-only seed/admin path can create and upsert demo data.
- `authenticated` gets select grants that remain constrained by the existing RLS policies.
- `authenticated` write grants are limited to current P0 communication-policy acknowledgements, plain-text messages, and message read-state.
- No tenant-table privileges are granted to `anon` or `PUBLIC`.

Grants and RLS are separate layers: grants allow a role to attempt an operation through the Data API, while RLS still decides which rows that role may access. The grant correction does not give Platform Super Admins default tenant access, does not weaken temporary communication review grants, and does not add direct authenticated writes to critical F&B state tables such as orders, inventory ledger, kitchen tickets, or audit events.

## RLS Rules Implemented

Implemented RLS foundations:

- RLS enabled on all created tenant-owned tables.
- Own-profile read/update access for authenticated users.
- Active organisation member reads for organisation-scoped tenant data.
- Active outlet/member helper groundwork for outlet-scoped F&B data.
- Platform admin table access limited to the current platform admin record; platform admins receive no default tenant-content policies.
- Room read access requires active room membership or an active temporary review grant.
- Message reads require active room membership or active temporary review grant.
- Plain-text message insert requires current active room membership.
- Direct Work message insert additionally requires acknowledgement of the current communication policy version.
- Communication review grants are reviewer-scoped, room-scoped, temporary, and default to 30 minutes.
- Communication review events are immutable evidence only and do not grant access.

Policy limitations by design:

- Critical business writes will move through server-side services or controlled RPCs in later milestones.
- Admin review UI and support elevation UI were not created.
- RLS was written as schema foundation and has not yet been applied to a running local or remote database in this environment.

## Authentication Foundation

Implemented:

- `/login` email/password form using Supabase Auth.
- Sign-out server action.
- Protected `/app` route requiring an authenticated session.
- Active organisation membership lookup before showing the neutral workspace placeholder.
- No fake demo users or passwords in browser code.
- Server-only privileged admin client factory remains in server-only code and uses `SUPABASE_SECRET_KEY`.

Not implemented:

- No role-specific business screens.
- No invitation flow.
- No platform admin UI.
- No business workflow UI.

## BrewBite Seed Preparation

Seed script:

```bash
pnpm seed:brewbite
```

The package script loads `.env.local` for standalone seed runs:

```bash
node --env-file=.env.local scripts/seed-brewbite.mjs
```

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=
DEMO_OWNER_EMAIL=
DEMO_OWNER_PASSWORD=
DEMO_ADMIN_EMAIL=
DEMO_ADMIN_PASSWORD=
DEMO_MANAGER_EMAIL=
DEMO_MANAGER_PASSWORD=
DEMO_CASHIER_EMAIL=
DEMO_CASHIER_PASSWORD=
DEMO_WAITER_EMAIL=
DEMO_WAITER_PASSWORD=
DEMO_KITCHEN_EMAIL=
DEMO_KITCHEN_PASSWORD=
```

Prepared seed contents:

- Organisation: `BrewBite Kitchen`
- One site
- One outlet
- Six demo role accounts created from environment variables only
- Organisation memberships for Owner, Admin, Manager, Cashier, Waiter, Kitchen
- Operations team and team memberships
- One Organisation Hub
- One Team Room
- Minimal menu category, menu items, ingredients, recipe versions, recipe lines, stock lots, inventory receipts, and kitchen stations

No hard-coded passwords or secrets are stored in tracked files.

## Local vs Remote Database Status

Local Supabase status:

- `pnpm supabase status` failed because no `supabase_db_flow` container existed.
- `pnpm db:lint` failed because there was no running local Postgres database.
- `timeout 120s pnpm db:start` began pulling Supabase Docker images but timed out before the local stack finished starting.
- No Supabase project containers were left running after the timeout.

Remote Supabase status:

- No cloud Supabase project was created.
- No remote migrations were applied.
- BrewBite Kitchen was not remotely seeded.

Database application command for later, after local Supabase images finish pulling:

```bash
pnpm db:start
pnpm db:reset
pnpm db:lint
pnpm seed:brewbite
```

For a remote project, link/apply only after owner approval and valid credentials are available. Do not use browser/public keys for seeding.

## Commands Run and Outcomes

| Command | Outcome |
| --- | --- |
| `pnpm add -D supabase` | Passed; added Supabase CLI development dependency. |
| `pnpm supabase --version` | Passed; reported `2.109.0`. |
| `docker --version` | Passed; Docker client available. |
| `docker info --format '{{.ServerVersion}}'` | Passed; Docker daemon available. |
| `pnpm supabase status` | Failed; local Supabase DB container was not present. |
| `pnpm db:lint` | Failed; no running local Postgres database. |
| `timeout 120s pnpm db:start` | Timed out while pulling first-run Supabase images; migrations were not applied. |
| `pnpm lint` | Passed. |
| `pnpm typecheck` | Passed. |
| `pnpm test` | Passed; 6 files, 14 tests. |
| `pnpm build` | Passed. |

Final `git diff --check` and `git status --short` were run after this report was created.

## Known Limitations

- SQL migrations still need a clean local Supabase apply once image pulls complete.
- Seed script has not been executed because local Supabase did not finish starting and demo credential environment variables were not available.
- RLS tests are static/unit checks only in this milestone; database-backed tenant isolation tests require the local database to be available.
- No invitation flow exists yet.
- No domain services or controlled RPCs for business state transitions exist yet.
- Protected `/app` is intentionally a neutral workspace placeholder.

## Strict Scope Confirmation

Confirmed:

- No payment gateway or payment callback implementation.
- No cash or terminal settlement UI.
- No public QR/menu page.
- No waiter, cashier, kitchen, inventory, dashboard, report, or admin product UI.
- No realtime subscriptions beyond auth/session requirements.
- No actual chat screen.
- No admin review screen.
- No message attachments, mentions, reactions, search, exports, announcements, handovers, incidents, or tasks.
- No AI.
- No deployment, Docker setup, CI/CD, or public demo URL.
- No fake working business workflows.
