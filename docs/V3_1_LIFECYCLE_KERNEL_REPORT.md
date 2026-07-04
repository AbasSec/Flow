# V3.1 Lifecycle Kernel Report

Status: local implementation complete. Two release blockers (legacy kitchen COMPLETED compatibility + direct-link authentication bypass) resolved and validated. Pending final review and remote migration approval.

## Scope Completed

V3.1 separates the operational lifecycle into distinct, role-owned systems with a controlled outlet-level progressive rollout.

| System | Implemented ownership | Implemented behavior |
| --- | --- | --- |
| Payment | Authorised cashier/manager/admin/owner through manual external-settlement confirmation | Preserves existing `PAID`/`UNPAID` truth and keeps the honest `DEMO_MANUAL_SETTLEMENT` boundary. Kitchen, public routes, Flow Connect messages, and browser redirects cannot mark payment paid. |
| Release | Authorised cashier/manager/admin/owner when the channel policy requires staff release | Adds `RELEASE_ON_SUBMIT`, `RELEASE_ON_VERIFIED_PAYMENT`, and `RELEASE_BY_AUTHORISED_STAFF`. Staff table-service orders release immediately; QR pay-at-counter orders wait for settlement and release. |
| Kitchen | Kitchen station users and authorised managers | New V3 transitions stop at `READY`: `NEW → ACCEPTED → PREPARING → READY`. Legacy `COMPLETED` tickets remain readable but the legacy RPC can no longer create new completed kitchen work. |
| Fulfilment | Waiter for dine-in served; cashier/waiter foundation for pickup collected | Adds `NOT_RELEASED → RELEASED → READY_FOR_HANDOFF → SERVED/COLLECTED`. `READY_FOR_HANDOFF` is derived only when required kitchen work is ready. |
| Closure | Controlled server-side lifecycle action | Adds separate `OPEN`, `COMPLETE`, `CANCELLED`, and `ARCHIVED` closure state. V3 served/collected actions close eligible orders through audited server logic. |
| Lifecycle mode activation | **Organisation Owner only** — Organisation Admin is explicitly denied | `flow_v3_1_enable_outlet_v3_1` — one-way LEGACY→V3_1 only. Passes only `organisation_owner` to the role helper and adds a defence-in-depth explicit check. Admin cannot activate V3_1 mode. No downgrade path through normal operations. |

## Progressive Rollout Architecture

Migration 010 introduces an outlet-level `lifecycle_mode` column on the `outlets` table:

| Mode | Default for | QR submission behaviour | Release behaviour |
| --- | --- | --- | --- |
| `LEGACY` | All existing outlets at migration time | Creates kitchen tickets and inventory reservation immediately (pre-V3.1 behaviour) | `RELEASE_ON_SUBMIT`, `release_state = RELEASED` immediately |
| `V3_1` | Opt-in per outlet by Organisation Owner after matching app is deployed | Creates order, order lines, audit evidence, outbox event, and work-item thread only — no tickets, no reservation | `RELEASE_BY_AUTHORISED_STAFF`, `release_state = NOT_RELEASED` until authorised settlement + release |

The mode is a per-outlet column. Different outlets on the same organisation can be in different modes simultaneously. This allows the owner to stage the rollout one outlet at a time.

### Owner-Only One-Way Activation

**`flow_v3_1_enable_outlet_v3_1(outlet_id)`** is intentionally one-way and restricted to `organisation_owner` because:

- Activating V3_1 alters customer-facing QR order handling for the entire outlet.
- It affects billing exposure, kitchen operations, staff workflow, and audit evidence quality.
- Organisation Admin can manage most operational settings, but principal-level product decisions (such as activating a new order-lifecycle model) are reserved for the registered organisation owner.
- Once V3_1 behaviour is live, downgrading would leave orders in inconsistent states. The safest design is a forward-only gate.

**One-way enforcement:** The function takes a single `uuid` argument (no mode parameter). There is no API surface through which a caller could request LEGACY as the target mode. The old two-argument `flow_v3_1_set_outlet_lifecycle_mode(uuid, outlet_lifecycle_mode)` has been removed.

If the outlet is already in `V3_1` mode, the function returns idempotently (`changed: false`) without writing a duplicate audit event. "Lifecycle mode cannot be downgraded after V3.1 activation."

**Two-layer Owner enforcement:**
1. `flow_v3_1_require_outlet_role` is called with `array['organisation_owner']` only — `flow_m3_require_role` raises an exception for any other role before the function body continues.
2. Defence-in-depth: the returned `actor_role` is explicitly checked against `'organisation_owner'` and raises `'Lifecycle mode activation requires Organisation Owner authority'` if not matched.

Organisation Admin **cannot** activate the mode even if the outer helper is later extended, because the inner check enforces it independently.

### Dashboard Activation Workflow

The Owner-only V3.1 activation control lives inside the existing Command Center dashboard (`/app`). It is rendered only when `context.role === 'organisation_owner'`.

- **LEGACY outlet:** Shows a disclosure button "Enable V3.1 lifecycle" that expands a consequence summary before a submit button appears. On confirm, calls `flow_v3_1_enable_outlet_v3_1` through a server action and revalidates the dashboard.
- **V3_1 outlet:** Shows "V3.1 active" with a brief description. No downgrade button is offered.
- All error messages are safe and user-facing — no raw RPC or database error text is exposed.

The control is implemented as a thin `LifecycleActivationPanel` client component (`app/app/lifecycle-panel.tsx`) that uses `useActionState` from React 19 and calls the `enableOutletV31Action` server action (`app/app/actions.ts`).

## Files Changed

**V3.1 lifecycle kernel (original):**
- `supabase/migrations/20260703000200_v3_1_lifecycle_kernel.sql`
- `lib/domain/lifecycle.ts`
- `lib/domain/states.ts`
- `lib/services/orders.ts`
- `lib/services/kitchen.ts`
- `app/app/page.tsx`
- `app/app/actions.ts`
- `app/app/lifecycle-panel.tsx`
- `app/app/kitchen/page.tsx`
- `app/app/orders/[id]/actions.ts`
- `app/app/orders/[id]/page.tsx`
- `app/app/orders/[id]/settlement-form.tsx`
- `app/order/[publicOrderId]/page.tsx`
- `app/t/[tableToken]/page.tsx`
- `app/t/[tableToken]/public-menu-client.tsx`
- `tests/unit/milestone3-static.test.ts`
- `tests/unit/v3-lifecycle-kernel-static.test.ts`
- `tests/integration/v3-lifecycle-kernel-regression.sql`

**Blocker 1 fix — legacy kitchen COMPLETED compatibility:**
- `supabase/migrations/20260703000200_v3_1_lifecycle_kernel.sql` (updated `flow_m3_transition_kitchen_ticket` from simple reject to branching wrapper; added `flow_m3_legacy_transition_kitchen_ticket_v1` with full migration-007 body)
- `tests/unit/v3-lifecycle-kernel-static.test.ts` (updated wrapper assertions; added legacy compat function assertions; added B-10 regression coverage)
- `tests/integration/v3-lifecycle-kernel-regression.sql` (added B-10a–B-10d)

**Blocker 2 fix — direct-link authentication bypass:**
- `proxy.ts` (new — Next.js 16 proxy-level auth guard for `/app/**`)
- `lib/auth/next-path.ts` (new — `safeNextPath` utility)
- `app/login/page.tsx` (hidden `next` input with server-side `safeNextPath` validation)
- `app/login/actions.ts` (`signInAction` reads and validates `next`, redirects to validated path after login)
- `tests/unit/middleware-auth-static.test.ts` (new — `safeNextPath` unit tests + proxy structure checks)
- `tests/integration/00_supabase_shims.sql` (new — auth schema stubs for bare Postgres regression runner)

- `docs/V3_1_LIFECYCLE_KERNEL_REPORT.md`

## LEGACY vs V3_1 Behaviour Matrix

| Flow step | LEGACY outlet | V3_1 outlet |
| --- | --- | --- |
| Public QR customer submits order | Order + order lines + audit + outbox + work-item thread + **kitchen tickets** + **inventory reservation** created immediately | Order + order lines + audit + outbox + work-item thread created only — **no tickets, no reservation** |
| `release_policy` | `RELEASE_ON_SUBMIT` | `RELEASE_BY_AUTHORISED_STAFF` |
| `release_state` immediately after submission | `RELEASED` | `NOT_RELEASED` |
| `fulfilment_state` immediately after submission | `RELEASED` | `NOT_RELEASED` |
| Public tracking immediately | Kitchen-derived status (NEW/ACCEPTED/PREPARING/READY) | `ORDER_RECEIVED` — "please pay at counter" |
| Kitchen board immediately | Ticket appears immediately | No ticket until authorised release |
| Staff settlement step | Settlement records `PAID`; idempotent | Same |
| Staff release step | N/A (already released) | Rechecks inventory; creates tickets and reservation atomically |
| Kitchen transitions | `NEW → ACCEPTED → PREPARING → READY` | Same — COMPLETED is rejected |
| `READY_FOR_HANDOFF` | Derived when all tickets are READY | Same |
| Waiter marks SERVED | After `READY_FOR_HANDOFF`, dine-in only | Same |
| Old deployed app compatibility | Fully compatible — no release button needed | Requires app version with release-action UI |

## Legacy / Pre-existing App Compatibility After Migration 010

Migration 010 is designed so that applying it against the currently deployed app and data is safe:

1. **All outlets default to `LEGACY` mode.** The deployed app (which has no V3.1 release button) sees no behaviour change.
2. **All existing orders are backfilled** into compatible lifecycle state — no order becomes stranded. QR orders that already have kitchen tickets are backfilled as `RELEASE_ON_SUBMIT`/`RELEASED`.
3. **Legacy M3 RPCs are wrapped**, not removed. Existing app code calling `flow_m3_create_table_order`, `flow_m3_transition_kitchen_ticket`, or `flow_m3_demo_manual_settlement` continues to work.
4. **COMPLETED kitchen transitions** via the legacy wrapper are rejected with a clear message — the old UI cannot produce `COMPLETED` for new records, but existing legacy completed tickets remain readable.
5. **No anonymous tenant-table grants** are added. Public RPC access is unchanged.

## Migration Design

Created one new forward-only local migration:

`supabase/migrations/20260703000200_v3_1_lifecycle_kernel.sql`

The migration is additive and preserves migrations 001-009. It:

- creates lifecycle enums for release policy, release state, fulfilment state, closure state, and outlet lifecycle mode;
- adds lifecycle columns to `orders` and `lifecycle_mode` to `outlets`;
- creates `order_lifecycle_events` as additive evidence;
- backfills only safe compatibility state and explicitly does not invent served, collected, payment, refund, payroll, or cost truth;
- rewrites `flow_m4_create_qr_table_order` with LEGACY/V3_1 mode branching;
- adds private helper `flow_v3_1_require_outlet_role(uuid, org_role[])`;
- replaces unsafe legacy M3 mutation functions with compatibility wrappers;
- adds `flow_v3_1_enable_outlet_v3_1` (owner-only, one-way, audited — LEGACY→V3_1 only);
- keeps public QR status safe and token-scoped;
- grants public execute only where public RPC access already exists and keeps internal lifecycle RPCs authenticated-only.

The migration has not been applied remotely.

## Legacy RPC Hardening

Migration 010 supersedes the unsafe M3 mutation paths in-place through forward-only `CREATE OR REPLACE FUNCTION` wrappers:

| Legacy RPC | Final V3.1 behavior |
| --- | --- |
| `flow_m3_create_table_order(uuid, jsonb, text)` | Delegates to `flow_v3_1_create_table_order`, preserving staff compatibility while applying release-on-submit lifecycle evidence and outlet scope. |
| `flow_m3_transition_kitchen_ticket(uuid, kitchen_ticket_status)` | **Branching wrapper (not a simple reject):** reads `outlet.lifecycle_mode` and `order.lifecycle_version`. If `lifecycle_mode = 'V3_1' AND lifecycle_version >= 3`, delegates to `flow_v3_1_transition_kitchen_ticket` (which rejects COMPLETED). Otherwise delegates to the internal `flow_m3_legacy_transition_kitchen_ticket_v1` (which preserves the original migration-007 behaviour including `READY → COMPLETED`). This ensures the old production app continues to function against LEGACY outlets during the migration-to-deploy window. |
| `flow_m3_legacy_transition_kitchen_ticket_v1(uuid, kitchen_ticket_status)` | Internal SECURITY DEFINER function (no external execute grant). Full migration-007 body: auth, station membership, COMPLETED rank=5, inventory ledger, audit event, outbox event. Called only by the M3 wrapper for LEGACY outlets. |
| `flow_m3_demo_manual_settlement(uuid)` | Delegates to `flow_v3_1_confirm_manual_settlement`, preserving the demo settlement label while adding lifecycle evidence and outlet scope. |

## Outlet-Scope Enforcement

V3.1 mutation RPCs use `flow_v3_1_require_outlet_role(target_outlet_id, allowed_roles)` inside the database boundary.

The helper:

- loads the target outlet and site;
- requires an active organisation role through the existing membership model;
- allows Organisation Owner and Organisation Admin across their authorised organisation scope for most RPCs;
- requires non-owner/admin operational roles to pass the existing active site/outlet membership model;
- uses `is_active_site_member(site_id)`, which keeps current single-outlet demo compatibility and enforces site assignment where site memberships exist;
- is private to SECURITY DEFINER RPC implementations and is not executable by `PUBLIC`, `anon`, or `authenticated`.

Additional station protection remains in kitchen transitions: a `kitchen` role must also have an active `kitchen_station_memberships` row for the exact station/outlet.

## Lifecycle Authority Matrix

| Action | Owner | Admin | Manager | Cashier | Waiter | Kitchen | Storekeeper | Extra condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Staff table order | Yes | Outlet scoped | Outlet scoped | Outlet scoped | Outlet scoped | No | No | `RELEASE_ON_SUBMIT`; active table/menu/stock. |
| Manual external settlement | Yes | Outlet scoped | Outlet scoped | Outlet scoped | No | No | No | Existing unpaid order only. |
| Release QR pay-at-counter order | Yes | Outlet scoped | Outlet scoped | Outlet scoped | No | No | No | Payment must be `PAID`; policy must be `RELEASE_BY_AUTHORISED_STAFF`. |
| Kitchen transition | Yes | Outlet scoped | Outlet scoped | No | No | Assigned station only | No | Only `ACCEPTED`, `PREPARING`, `READY`. |
| Mark served | Yes | Outlet scoped | Outlet scoped | No | Outlet scoped | No | No | Dine-in `table` or `qr`, `READY_FOR_HANDOFF`, all tickets ready. |
| Mark collected | Yes | Outlet scoped | Outlet scoped | Outlet scoped | Outlet scoped | No | No | `counter` or `online_pickup`, `READY_FOR_HANDOFF`. |
| **Activate lifecycle mode (V3_1)** | **Yes — Owner only** | **No — explicitly denied** | No | No | No | No | No | Owner-only; dual-layer enforcement. |
| Closure | Through served/collected actions only | Through eligible action | Through eligible action | Through eligible collected action | Through eligible served action | No | No | No standalone cancellation/hold/closure UI added. |

## RPC and Service Changes

| RPC | Access | Purpose |
| --- | --- | --- |
| `flow_v3_1_create_table_order(uuid, jsonb, text)` | authenticated | Staff table-service order creation with `RELEASE_ON_SUBMIT`, immediate kitchen work, reservation, audit, outbox, and lifecycle event. |
| `flow_m4_create_qr_table_order(text, jsonb, text)` | anon/authenticated | Public QR order creation; branches by outlet `lifecycle_mode`. LEGACY: tickets+reservation immediately. V3_1: order held, no tickets until release. |
| `flow_v3_1_confirm_manual_settlement(uuid)` | authenticated | Authorised manual external-settlement confirmation. Idempotent when already paid. |
| `flow_v3_1_release_order_to_kitchen(uuid)` | authenticated | Authorised kitchen release after verified QR pay-at-counter settlement. Idempotent after release. |
| `flow_v3_1_transition_kitchen_ticket(uuid, kitchen_ticket_status)` | authenticated | Kitchen transition through `READY` only; derives handoff readiness when all tickets are ready. |
| `flow_v3_1_mark_order_served(uuid)` | authenticated | Waiter/manager dine-in fulfilment and controlled closure for ready table orders. |
| `flow_v3_1_mark_order_collected(uuid)` | authenticated | Foundation for pickup fulfilment; no new full counter/POS UI in V3.1. |
| `flow_v3_1_enable_outlet_v3_1(uuid)` | authenticated — **Owner only** | One-way LEGACY→V3_1 activation. Idempotent (no duplicate audit on repeat call). Writes `OUTLET_LIFECYCLE_MODE_CHANGED` audit event on first activation. Downgrade path does not exist through normal operations. |
| `flow_m4_public_order_status(text)` | anon/authenticated | Public tracking aligned to release, kitchen readiness, fulfilment, and legacy-neutral completion. |

Staff-facing lifecycle services now return controlled user-safe error messages rather than raw RPC/database errors.

## Channel Release Policy Mapping

| Current channel | V3.1 policy | Implemented result |
| --- | --- | --- |
| Staff table service | `RELEASE_ON_SUBMIT` | Waiter/staff order creation still creates kitchen work immediately. |
| Table-token QR pay-at-counter (LEGACY outlet) | `RELEASE_ON_SUBMIT` | Kitchen tickets and inventory created immediately. |
| Table-token QR pay-at-counter (V3_1 outlet) | `RELEASE_BY_AUTHORISED_STAFF` | Public order is received and remains unpaid/not released until authorised settlement and release. |
| Future online/prepaid pickup | `RELEASE_ON_VERIFIED_PAYMENT` | Lifecycle enum exists for later phases; no online/prepaid checkout implemented. |

## Public QR Behavior (V3_1 Mode)

Before V3.1 (or for LEGACY outlets):
- A public QR order creates active kitchen tickets immediately.

After V3.1 activation for an outlet:

1. Customer submits a table-token QR order.
2. Flow creates an unpaid order, order lines, audit/outbox evidence, lifecycle evidence, and a staff-only work-item thread.
3. No kitchen ticket and no inventory ledger reservation/consumption is created at submission.
4. Public tracking shows: `Order received — please pay at counter.`
5. Authorised staff records verified manual external settlement.
6. Authorised staff releases the order to kitchen.
7. Kitchen processes `NEW → ACCEPTED → PREPARING → READY`.
8. Waiter marks eligible dine-in order as served.

## Inventory Behavior

Staff table-service orders preserve existing inventory-backed behavior: reservation is created at submit, and consumption still occurs once when kitchen enters `PREPARING`.

QR pay-at-counter orders in V3_1 mode do not reserve inventory at submission because they are not yet released to kitchen. Release rechecks availability and creates the reservation and kitchen work atomically. If stock changes between customer submission and staff release, release may be rejected safely rather than fabricating inventory truth.

Idempotency controls:

- order creation uses existing order idempotency keys;
- manual settlement returns idempotently if the order is already `PAID`;
- release returns idempotently if already `RELEASED` or kitchen tickets already exist;
- kitchen consumption checks for existing consumption by ticket before writing ledger entries;
- outbox and lifecycle event writes use dedupe/idempotency keys where available.

## UI Changes

- Staff order detail shows separate lifecycle panels for payment, release, fulfilment, and closure.
- Authorised staff can record manual external settlement and release QR pay-at-counter orders from the existing order detail page.
- Eligible dine-in orders can be marked served after kitchen readiness.
- Kitchen board no longer presents `COMPLETED` as the next V3 action; `READY` is the terminal kitchen action for new lifecycle records.
- Public tracking starts with pay-at-counter instruction before release and only moves through kitchen states after the real ticket state changes.
- Legacy completed tickets/orders remain displayable with neutral wording.

## Local DB Regression Suite

The executable regression suite is at:

`tests/integration/v3-lifecycle-kernel-regression.sql`

Run with (requires local Supabase):
```
pnpm supabase db reset --local
psql "$(pnpm supabase db connection-string --local)" \
  -v ON_ERROR_STOP=1 \
  -f tests/integration/v3-lifecycle-kernel-regression.sql
```

Alternatively, run against a bare Postgres 17 container (used in this branch's validation):
```
docker exec -i flow-regression-db psql -U postgres -d regression \
  -v ON_ERROR_STOP=1 < <(
  cat tests/integration/00_supabase_shims.sql \
      supabase/migrations/20260702000100_extensions_enums_helpers.sql \
      supabase/migrations/20260702000200_identity_tenancy_rls.sql \
      supabase/migrations/20260702000300_audit_outbox.sql \
      supabase/migrations/20260702000400_communication_foundation_rls.sql \
      supabase/migrations/20260702000500_fnb_foundation_rls.sql \
      supabase/migrations/20260702000600_data_api_privileges.sql \
      supabase/migrations/20260702000700_milestone_3_vertical_slice.sql \
      supabase/migrations/20260702000800_public_qr_ordering.sql \
      supabase/migrations/20260703000100_public_tracking_alignment.sql \
      supabase/migrations/20260703000200_v3_1_lifecycle_kernel.sql \
      tests/integration/v3-lifecycle-kernel-regression.sql
)
```

**Validated result (2026-07-04, PostgreSQL 17.10 Alpine, Docker container `flow-regression-db`):**
```
V3.1 Lifecycle Kernel Regression Suite: COMPLETE
Schema assertions: S-01 through S-08
Behaviour assertions: B-01 through B-13 (B-09: B-09a–B-09f one-way activation; B-10: legacy/V3_1 kitchen compat)
All assertions passed.
```

Assertions proven:

| ID | Assertion | Type |
| --- | --- | --- |
| S-01 | `outlet_lifecycle_mode` enum has `LEGACY` and `V3_1` | Schema |
| S-02 | `outlets.lifecycle_mode` NOT NULL, DEFAULT `LEGACY` | Schema |
| S-03 | `orders` has all 13 V3.1 lifecycle columns | Schema |
| S-04 | `order_lifecycle_events` table and unique idempotency index | Schema |
| S-05 | All 12 required V3.1 RPCs exist in public schema | Schema |
| S-06 | No anonymous direct table grants on tenant tables | Schema |
| S-07 | `flow_m4_public_order_status` executable by anon | Schema |
| S-08 | V3.1 mutation RPCs authenticated-only (not anon) | Schema |
| B-01 | LEGACY QR submission creates tickets and reservation immediately | Behaviour |
| B-02 | V3_1 QR submission creates 0 tickets and 0 reservation entries | Behaviour |
| B-03 | V3_1 public tracking returns `ORDER_RECEIVED` before release | Behaviour |
| B-04 | Settlement → release creates tickets + reservation exactly once | Behaviour |
| B-05 | Kitchen stops at READY — COMPLETED rejected by both V3 RPC and M3 wrapper | Behaviour |
| B-06 | Waiter marks SERVED only after `READY_FOR_HANDOFF` | Behaviour |
| B-07 | Idempotent settlement — double call creates exactly 1 lifecycle event | Behaviour |
| B-08 | Idempotent release — double call creates exactly 1 kitchen ticket | Behaviour |
| B-09 | One-way activation: owner LEGACY→V3_1 (B-09a), idempotent changed=false (B-09b), exactly 1 audit event (B-09c), admin denied (B-09d), function signature prevents downgrade (B-09e), mode stable after all attempts (B-09f) | Behaviour |
| B-10 | M3 wrapper: LEGACY outlet READY→COMPLETED succeeds (B-10a), `service_status = SERVED_OR_COLLECTED` after COMPLETED (B-10b), V3_1 outlet+lifecycle_version=3 COMPLETED rejected (B-10c), internal compat function has no external execute grant (B-10d) | Behaviour |
| B-11 | Cross-outlet staff cannot settle another outlet's order | Behaviour |
| B-12 | Old M3 RPCs delegate to V3.1 and write lifecycle evidence | Behaviour |
| B-13 | Public tracking output is narrow — no private columns | Behaviour |

## Legacy Data Handling

Existing records are not rewritten into false V3 truth:

- legacy `COMPLETED` kitchen tickets remain readable;
- legacy terminal records can still display neutral `Order complete`;
- V3 does not backfill served, collected, payment, refund, payroll, or cost evidence;
- new records use lifecycle columns and `order_lifecycle_events`;
- backfill sets `release_policy = RELEASE_ON_SUBMIT` for existing QR orders that already have kitchen tickets (reflecting actual pre-V3.1 behaviour, not the V3_1 policy).

## Safe Migration And Deployment Order

Recommended order after final approval:

1. Confirm application build for the exact branch artifact.
2. Apply migration 010 with `pnpm supabase db push` from the reviewed branch only.
3. Immediately after migration: all outlets are in `LEGACY` mode. Old deployed app continues to function.
4. Deploy the new app version that calls V3.1 RPCs and shows release/served UI.
5. Run the manual validation checklist below against the new app.
6. Per outlet: Organisation Owner uses the Command Center dashboard activation control (or calls `flow_v3_1_enable_outlet_v3_1(outlet_id)` directly) to activate V3_1 behaviour. This is one-way and cannot be reversed through normal operations.
7. Monitor audit/outbox/order/kitchen records for unexpected legacy RPC activity.

**Do not** deploy the app without migration 010 because the app selects new lifecycle columns and calls new RPC names.
**Do not** apply migration 010 without deploying the matching app soon after, because the database will harden legacy mutation behaviour.
**Do not** activate V3_1 mode before the new app version is deployed for the outlet.

## Direct-Link Authentication Protection

**Requirement (Blocker 2):** Opening a private page (`/app/**`) by pasting a direct URL must not bypass login.

**Three-layer defence:**

1. **`proxy.ts` (Next.js 16 proxy-level guard):** Runs before any page render. For every request matching `/app` or `/app/:path*`, calls `supabase.auth.getUser()` — a real network round-trip that validates the JWT server-side (not `getSession()`). Unauthenticated requests are redirected to `/login?next=<safe-path>`. If Supabase is not configured in the environment, falls back to login redirect rather than exposing any UI.

2. **Per-component `requireWorkspaceContext()`:** Every server component under `/app` (dashboard, order detail, kitchen board, etc.) calls `requireWorkspaceContext()` which calls `getAuthenticatedUser()` → `supabase.auth.getUser()` → `redirect("/login")` if unauthenticated. This layer protects against any gap in the proxy matcher and enforces auth at the data-access layer.

3. **Service/RPC auth:** All V3.1 mutation RPCs are SECURITY DEFINER and call `auth.uid()` at the top of each function body, raising `'Authentication required'` if null. Anon grants are revoked.

**Post-login redirect:** After login, `signInAction` redirects to the original destination using `safeNextPath`.

**`safeNextPath` validation rules** (`lib/auth/next-path.ts`):
- Must be a non-empty string ≤ 512 characters.
- Must start with `/` — rejects external URLs, protocol-relative `//evil.com`, and bare domains.
- Must not start with `//` — rejects protocol-relative paths regardless of `/` prefix check order.
- Must not start with `/login` (case-insensitive) — prevents redirect loops.
- Parsed with `new URL(raw, "https://flow.internal")`; accepted only if origin equals `"https://flow.internal"` — rejects any path that Chromium's URL parser would resolve to an external origin.
- Invalid or empty input falls back to the supplied `fallback` (always `/app`).

## Test Status

Automated static/unit coverage checks (95 tests, 13 files, all passing):

- V3.1 lifecycle columns/enums/evidence table;
- outlet lifecycle mode enum (`LEGACY`/`V3_1`), type guard `isOutletLifecycleMode`;
- outlet-scope helper use in every V3.1 mutation RPC;
- legacy M3 mutation RPC wrapper behavior;
- QR function LEGACY/V3_1 branch — V3_1 path has no tickets/reservation, LEGACY path has them;
- `flow_v3_1_enable_outlet_v3_1` passes only `organisation_owner` to the role helper;
- defence-in-depth check on returned role (`actor_role <> 'organisation_owner'`);
- one-way enforcement: sets `lifecycle_mode = 'V3_1'` only, no `LEGACY` assignment path;
- idempotency: already-V3_1 returns `changed=false` without writing an audit event;
- `OUTLET_LIFECYCLE_MODE_CHANGED` audit event string present;
- admin excluded from mode-switching allowed-roles array;
- old two-argument `flow_v3_1_set_outlet_lifecycle_mode` signature does not exist;
- settlement/release idempotency guard strings;
- kitchen stops at `READY`;
- served/collected channel restrictions;
- public tracking release/fulfilment mapping;
- public QR page copy does not claim immediate kitchen submission;
- no direct anonymous tenant-table grants in migration 010;
- changed lifecycle services do not return raw `error.message`;
- `safeNextPath` rejects null/empty, external URLs, protocol-relative `//`, `/login` loop paths, and oversized inputs;
- `proxy.ts` (Next.js 16 convention) exports function `proxy`, uses `createServerClient` from `@supabase/ssr`, calls `supabase.auth.getUser()`, includes `/app/:path*` matcher;
- all `/app/**` server pages reach `requireWorkspaceContext()` before rendering;
- login page renders a validated hidden `next` input; `signInAction` reads and validates `next` and redirects to it after success;
- migration 010 `flow_m3_transition_kitchen_ticket` wrapper branches on `outlet_mode = 'V3_1'` AND `lifecycle_version >= 3`, delegates V3_1 to `flow_v3_1_transition_kitchen_ticket` and LEGACY to `flow_m3_legacy_transition_kitchen_ticket_v1`;
- `flow_m3_legacy_transition_kitchen_ticket_v1` preserves `when 'COMPLETED' then 5` rank without the V3 stop message;
- internal compat function has no external execute grant.

## Manual Validation Checklist

After migration 010 is applied and the new app is deployed:

1. Create a staff table-service order and confirm it appears on the kitchen board immediately.
2. Submit a QR pay-at-counter order from a LEGACY outlet and confirm the kitchen board receives a ticket immediately (old behaviour preserved).
3. As the Organisation Owner, open the Command Center dashboard, expand "Enable V3.1 lifecycle", read the consequences, and confirm. Confirm admin cannot see or use this control and cannot call `flow_v3_1_enable_outlet_v3_1` directly. Confirm a second activation attempt shows "already active" without writing a duplicate audit event.
4. Submit a QR pay-at-counter order from the V3_1 outlet and confirm the kitchen board receives no ticket yet.
5. Open the public tracking page and confirm it says the order was received and payment is due at counter.
6. Try releasing the QR order before settlement and confirm it is rejected.
7. Record manual settlement as an authorised cashier/manager/owner.
8. Release the order to kitchen and confirm the kitchen board receives the ticket.
9. Progress kitchen ticket through `ACCEPTED`, `PREPARING`, and `READY`.
10. Confirm no `COMPLETED` action is offered or possible through the legacy RPC.
11. Mark the dine-in order served from the staff order detail page.
12. Confirm public tracking does not say `Order complete` before fulfilment/closure evidence exists.
13. Confirm unauthorised roles cannot settle, release, mark served, mark collected, or access another outlet.

## Deferred

Deferred to later V3 phases:

- one-outlet QR with table selection;
- real payment provider, POS, card-terminal, accounting, or connector integration;
- full counter/POS pickup workflow;
- dynamic menu management;
- employee/payroll modules;
- team/records centre;
- deterministic analysis;
- standalone hold/cancellation/exception UI;
- AI/Copilot;
- deployment, CI/CD, and seed reset changes.

## Known Limitations

- V3.1 uses the current table-token QR model; the V3 one-outlet QR model is not implemented here.
- QR orders in V3_1 mode do not reserve inventory until authorised release. Availability is rechecked at release.
- Outlet scoping uses the existing organisation/site membership model. In a single-site demo with no site-membership rows, active organisation membership remains compatible with the existing default access model.
- Collection support exists as a controlled RPC foundation but no new full pickup/counter UI was added.
- No real gateway, POS, terminal, refund, statutory payroll, or accounting integration exists.
- No remote migration was applied as part of this work.
- No Vercel or Supabase project settings, environment variables, or secrets were changed.
- Local DB regression suite has been fully executed and all assertions passed (see regression section above).
