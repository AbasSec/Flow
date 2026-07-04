# V3.1 Operational Workspaces Report

**Branch:** `feat/v3-1-operational-workspaces`
**Date:** 2026-07-04
**Status:** Ready for review after remediation

## Scope Completed

This milestone adds two focused V3.1 operational workspaces on top of the completed Lifecycle Kernel:

- `/app/counter` for pay-at-counter QR settlement and kitchen release.
- `/app/waiter`, still route-compatible, presented as **Floor & Service** for table-service order entry and ready dine-in service.

The implemented workflow remains:

```text
Customer QR
-> Counter settlement
-> Counter release to Kitchen
-> Kitchen NEW -> ACCEPTED -> PREPARING -> READY
-> READY_FOR_HANDOFF
-> Floor & Service marks SERVED
```

No new database migration was required. The workspace reads use V3.1 lifecycle columns and existing controlled V3.1 RPC-backed service actions.

## Counter Responsibilities

Counter supports only the approved V3.1 pay-at-counter queues:

| Queue | Eligibility | Action |
| --- | --- | --- |
| Awaiting payment | `release_policy = RELEASE_BY_AUTHORISED_STAFF`, `payment_status = UNPAID`, `release_state = NOT_RELEASED` | Record settlement through `settleOrderManually(orderId)` |
| Paid, awaiting release | `release_policy = RELEASE_BY_AUTHORISED_STAFF`, `payment_status = PAID`, `release_state = NOT_RELEASED` | Release to kitchen through `releaseOrderToKitchen(orderId)` |

Rows show only safe operational fields: table label, age, total, high-level status, and the controlled action path.

Pickup, takeaway, and counter collection operations are not enabled in this workspace yet. The previous draft collection queue was removed to avoid implying unsupported pickup fulfilment.

## Floor & Service Responsibilities

`/app/waiter` remains the compatible route, but the visible workspace is **Floor & Service**.

It preserves the existing table-service order composer and adds a ready-to-serve queue for:

```text
fulfilment_state = READY_FOR_HANDOFF
order_channel IN (table, qr)
authorised outlet only
```

The `Mark served` action delegates only to:

```text
markOrderServed(orderId)
-> flow_v3_1_mark_order_served
```

Cashier, Kitchen, and Storekeeper roles do not receive serve authority. Kitchen remains unable to settle, release, serve, collect, or close orders.

## Outlet-Authorised Read Protection

The remediation added shared server-side read guards in `lib/services/context.ts`:

- `canAccessOutlet(context, outletId)`
- `getPrimaryAuthorisedOutletId(context)`

These mirror the V3.1 database mutation model:

- Organisation Owner and Organisation Admin may read across the active organisation outlet scope.
- Manager, Cashier, Waiter, Kitchen, and Storekeeper require active site/outlet authority.
- Legacy demo compatibility is preserved when a site has no active site-membership rows.

Counter, Floor & Service, Dashboard, Kitchen manager reads, and Order Detail now route operational reads through an authorised outlet before returning outlet-scoped records. Order Detail returns a safe not-found response for orders outside the actor's authorised outlet and only loads related lines/tickets/thread data after the outlet guard passes.

## Navigation Visibility

`AppShell` now hides Counter unless a known authorised role is supplied.

Counter appears only for:

- `organisation_owner`
- `organisation_admin`
- `manager`
- `cashier`

When role is absent, unknown, or unauthorised, Counter is hidden. Dashboard, Counter, Floor & Service, Kitchen, Order Detail, and Connect pass their known role to the shell where available. Navigation remains presentation only; server services and database RPCs still enforce authority.

## Dashboard And Order Detail Boundary

Dashboard remains a command-centre oversight surface. It does not duplicate Counter controls.

Recent orders now show directional workspace hints:

- unreleased pay-at-counter orders -> Counter
- released active kitchen work -> Kitchen
- `READY_FOR_HANDOFF` dine-in orders -> Floor & Service

Order Detail remains a protected evidence page. It can still show existing authorised lifecycle actions where V3.1 permits them, but normal operating work is directed to Counter or Floor & Service.

## Safe Error Handling

Changed Counter and Floor & Service paths return controlled user-facing errors:

- "Unable to load Counter orders right now."
- "Unable to load service orders right now."
- "This action could not be completed" style service messages through existing controlled actions.

The protected app error boundary no longer renders raw `error.message`; it shows a generic safe fallback instead. Raw Postgres, Supabase, SQL, relation, function, UUID, stack, and schema details are not intentionally rendered by the new workspace paths.

## V3.1 Protections Preserved

Preserved:

- Payment != release != kitchen != fulfilment != closure.
- V3.1 QR submission creates no active kitchen ticket, reservation, or consumption before authorised settlement and release.
- Kitchen stops at `READY` for V3 records.
- `READY_FOR_HANDOFF` and `SERVED` remain separate front-of-house fulfilment truth.
- Settlement and release use existing controlled server services/RPCs.
- Kitchen station scope remains in the existing kitchen service/RPC boundary.
- Public QR ordering and public tracking were not changed.
- Flow Connect messages still cannot mutate lifecycle state.
- Migrations 001-010 were not edited.

## Files Created Or Changed

Created:

- `app/app/counter/page.tsx`
- `app/app/counter/actions.ts`
- `app/app/counter/counter-action-form.tsx`
- `app/app/waiter/floor-serve-form.tsx`
- `lib/services/counter.ts`
- `tests/unit/operational-workspaces-static.test.ts`
- `docs/V3_1_OPERATIONAL_WORKSPACES_REPORT.md`

Changed:

- `app/app/error.tsx`
- `app/app/kitchen/page.tsx`
- `app/app/page.tsx`
- `app/app/waiter/actions.ts`
- `app/app/waiter/page.tsx`
- `app/app/connect/page.tsx`
- `app/app/orders/[id]/page.tsx`
- `components/flow-ui.tsx`
- `lib/services/context.ts`
- `lib/services/dashboard.ts`
- `lib/services/kitchen.ts`
- `lib/services/orders.ts`

## Migration And Data Changes

No migration was created.

No migration was applied locally or remotely.

No schema, RLS, RPC, role, grant, seed, Supabase, Vercel, secret, or environment configuration was changed.

## Validation Results

| Check | Result |
| --- | --- |
| `git diff --check` | Passed |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed — 14 files, 140 tests |
| `pnpm build` | Passed |
| Local V3.1 lifecycle SQL regression | Passed against disposable local Docker database `flow-regression-db` |

## Manual Acceptance Checklist

- Login as Owner/Manager/Cashier and confirm Counter appears in navigation.
- Login as Waiter/Kitchen/Storekeeper and confirm Counter is hidden.
- Direct `/app/counter` as unauthenticated user redirects to login.
- Direct `/app/counter` as unauthorised role shows forbidden state.
- Submit V3.1 QR order and confirm it appears in Counter awaiting payment, not Kitchen.
- Record settlement from Counter and confirm order moves to paid-awaiting-release.
- Release from Counter and confirm Kitchen receives a real ticket.
- Move Kitchen ticket through `NEW -> ACCEPTED -> PREPARING -> READY`.
- Confirm ready dine-in order appears in Floor & Service.
- Mark served from Floor & Service and confirm Order Detail reflects served/complete state.
- Confirm Dashboard only links users toward Counter, Kitchen, and Floor & Service and does not duplicate Counter controls.
- Confirm public QR and public tracking remain pay-at-counter and token-scoped.

## Deferred Gaps

Intentionally deferred:

- V3.2 one-outlet QR and customer table confirmation.
- Dynamic menu management.
- Employee profiles, invitations, payroll, Team, Records Centre, Owner/Admin command centre, and deterministic Flow Analysis.
- Suppliers, expenses, profitability, full POS, cash drawer, receipt, change workflow, pickup/delivery expansion, payment connectors, reports, notifications, CI/CD, observability, and AI/Copilot.
- Pickup/takeaway collection operations.
- Real payment gateway integration.

## Remote-State Confirmation

No remote migration, deployment, Supabase setting, Vercel setting, secret, configuration, commit, or push was performed for this milestone.
