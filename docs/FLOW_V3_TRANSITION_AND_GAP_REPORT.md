# FLOW - V3 Transition And Gap Report

> Status: V3 implementation inventory and transition guide
> Date: 3 July 2026
> Purpose: Record what exists today, what is transitional, what must be preserved, and how to move toward V3 without breaking the working demo or rewriting applied migrations.

## 1. Current Confirmed Baseline

Current production/demo baseline:

- `main` contains the working Flow competition demo.
- Supabase migrations 001-009 are applied remotely.
- Production URL: `https://flow-ops-rho.vercel.app`.
- BrewBite Kitchen demo data exists.
- Protected staff workspace exists.
- Public QR ordering exists.
- Public order tracking exists.
- Kitchen board, inventory-backed order flow, owner dashboard, Flow Connect foundation, and production login exist.

This baseline is real and should be preserved, but it is transitional relative to V3.

## 2. What Exists Today

| Area | Existing implementation |
| --- | --- |
| App shell | Next.js App Router, strict TypeScript, Tailwind, lint/test/build scripts. |
| Auth | Supabase email/password login and protected `/app`. |
| Tenant foundation | Profiles, organisations, sites, outlets, memberships, teams, RLS helpers. |
| F&B foundation | Menu categories/items, ingredients, recipes, lots, inventory ledger, table sessions, orders, order lines, kitchen stations/tickets. |
| Audit/outbox | Shared audit and outbox foundation. |
| Data API grants | Explicit grants for service/admin and authenticated paths; no broad anon tenant table access. |
| Server services | Order, kitchen, inventory, dashboard, communication, public ordering services. |
| Staff routes | `/app`, `/app/waiter`, `/app/kitchen`, `/app/connect`, `/app/orders/[id]`. |
| Public routes | `/t/[tableToken]`, `/order/[publicOrderId]`. |
| Public QR | High-entropy table-token QR for current demo. |
| Public tracking | Safe status mapping corrected by migration 009. |
| Payment | `DEMO_MANUAL_SETTLEMENT` only; no real gateway. |
| Flow Connect | Organisation Hub, Team Room, work-item thread foundation and simple UI. |
| Deployment | Vercel production URL exists. |

## 3. What Is Partial

| Area | Partial state |
| --- | --- |
| Lifecycle semantics | Payment and kitchen are separated, but V3 release and front-of-house fulfilment are not fully modeled. |
| Kitchen | Current workflow includes completion; V3 kitchen stops at `READY`. |
| Fulfilment | Served/collected is not fully owned by waiter/cashier in a separate state system. |
| Public QR | Table-token mode works but is not V3 default one-outlet QR. |
| Menu | Seeded records exist; dynamic menu management UI/versioning is not complete. |
| Inventory | Recipe reservation/consumption exists; suppliers, waste, purchasing, and full cost model are incomplete. |
| Records | Audit exists; scoped record centre and log views are not complete. |
| Team/employment | Membership exists; full employee profiles, invitations, lifecycle, payroll foundation are incomplete. |
| Flow Connect | Foundation exists; Direct Work Conversations, review UI, structured rooms, and advanced features are incomplete. |
| Analysis | No deterministic insight engine yet. |
| Reports | P0 dashboard exists; reports/export are not complete. |
| Connectors | No POS/payment/accounting/delivery/supplier connector exists. |

## 4. What Is Incorrect Or Transitional Under V3

| Area | Transitional behavior | V3 target |
| --- | --- | --- |
| QR model | One QR per table through opaque `tableToken`. | One QR per outlet by default; customer confirms table; table-token remains optional mode. |
| Pay-at-counter release | Current QR order can create kitchen ticket early. | Recommended BrewBite V3 policy waits for verified manual settlement or authorised release before kitchen work. |
| Kitchen completion | Kitchen ticket can reach `COMPLETED`. | Kitchen stops at `READY`; front-of-house records served/collected. |
| Public terminal label | Tracking correction uses neutral `ORDER_COMPLETE`. | Full fulfilment model can truthfully show served or collected when known. |
| Menu baseline | Seed-only menu management. | Dynamic audited menu with versions, images, modifiers, outlet availability. |
| Payment | Manual demo settlement only. | Provider/POS/manual verified settlement architecture with reconciliation. |
| Dashboard | Operational dashboard cards and QR area. | Owner command centre with live operations, records/accountability, controls, and analysis. |

## 5. What Needs Preserving

Preserve:

- migrations 001-009 as applied production-style history;
- tenant isolation and RLS posture;
- no default Platform Super Admin tenant access;
- public safe-projection model;
- opaque public token posture;
- no public access to Flow Connect;
- server-side critical writes;
- integer money fields;
- inventory ledger evidence;
- audit/outbox evidence;
- `DEMO_MANUAL_SETTLEMENT` label and truthfulness until real integration is approved;
- existing BrewBite demo path until V3 replacement is deployed and verified;
- public tracking truthfulness during transition.

## 6. What Needs Forward Migration

Forward-only V3 migrations should add or migrate toward:

| Target | Migration direction |
| --- | --- |
| Lifecycle kernel | Add explicit payment/release/kitchen/fulfilment state model and transition events. |
| Release policy | Add outlet/channel release policy configuration and history. |
| One-outlet QR | Add outlet public tokens, public ordering sessions, table confirmation evidence. |
| Table-token compatibility | Keep existing table-token columns/routes as optional table-bound mode during transition. |
| Menu management | Add versioned menu/product/modifier/tax/routing records and archival semantics. |
| Employee/employment | Add employment profile/lifecycle and protected compensation tables. |
| Records | Add views/read models only where needed; preserve audit log. |
| Fulfilment | Add waiter/cashier served/collected events and role checks. |
| Suppliers/expenses | Add supplier, purchase, expense, waste, and costing records. |
| Analysis | Add deterministic insight definitions/read models. |
| Connectors | Add connector registry, secret references, webhook/reconciliation records. |

## 7. What Must Never Be Broken

- Existing owner login and protected workspace access.
- BrewBite demo data visibility for authorised staff.
- Public QR path privacy.
- Public order tracking privacy and truthful status labels.
- Kitchen board receipt of real tickets.
- Inventory-backed order creation and consumption.
- Manual settlement role restrictions and audit evidence.
- Flow Connect private staff-only boundary.
- No anonymous tenant table access.
- No raw IDs or internal details on public pages.
- No secrets in browser or logs.

## 8. QR Transition Plan

Current model:

```text
/t/[tableToken]
-> token identifies table session context
-> customer sees safe table menu
-> order submitted for that table
```

V3 default:

```text
/o/[outletPublicToken] or equivalent
-> customer sees outlet public menu
-> customer enters/selects a public table label or short code
-> customer confirms "You are ordering for Table 7"
-> Flow mints a short-lived opaque ordering context scoped to that outlet and confirmed table
-> order submitted under that context
```

Transition steps:

1. Keep `/t/[tableToken]` working as optional table-bound mode.
2. Add outlet QR public context in a forward migration.
3. Add table selection/confirmation, active table validation, public-channel permission validation, context expiry, rate limiting, and replay/abuse controls.
4. Update dashboard QR presentation to show outlet QR as default.
5. Keep table QR under optional advanced/table-bound mode.
6. Migrate demo script/docs to one outlet QR once verified.

During the transition, public ordering must still use safe projections and must never expose raw table, outlet, organisation, order, ticket, room, or message IDs.

The selected public table label or short code must be resolved server-side. The server must confirm the table is active, belongs to the outlet represented by the outlet QR, and permits public ordering. The resulting ordering context must not reveal internal IDs, customer data, staff data, inventory, messages, logs, payment internals, or another table/order.

## 9. Public Tracking Transition

Current tracking correction:

- `NEW` kitchen ticket maps to `ORDER_RECEIVED`;
- `ACCEPTED`, `PREPARING`, and `READY` map only after real kitchen state;
- terminal states map to neutral `ORDER_COMPLETE`;
- cancellation/unavailable maps safely without internal detail.

V3 target:

- tracking reflects release policy and fulfilment ownership;
- kitchen stops at `READY`;
- waiter/cashier fulfilment can show `SERVED` or `COLLECTED` only when canonical state distinguishes it;
- if state is ambiguous, public UI uses neutral "Order complete".
- public tracking must never display `SERVED` or `COLLECTED` until the exact canonical fulfilment event exists;
- public tracking must not expose payment or settlement internals.

Backward compatibility:

- Keep accepting existing public tracking tokens until expiry.
- Continue normalising legacy `SERVED`/`COLLECTED` labels to safe neutral language where fulfilment truth is unknown.
- Do not expose payment internals or settlement state publicly.
- Legacy public tracking stays neutral when fulfilment truth is unknown.

## 10. Data Migration And Backward Compatibility

Data-transition rules:

1. Existing orders, tickets, audit events, inventory ledger records, messages, and public tokens remain valid records.
2. New V3 lifecycle tables/columns should be additive.
3. Backfills must be idempotent and safe to rerun where possible.
4. Backfills must not invent served, collected, payment, refund, payroll, or cost truth that is not evidenced.
5. For ambiguous current states, use neutral or unknown states plus explanatory operational evidence.
6. New V3 records must use canonical lifecycle evidence for payment, release, kitchen, fulfilment, cancellation, refund, void, and order closure.
7. Preserve public token expiry and privacy boundaries.
8. Use compatibility reads while old and new records coexist.

## 11. Migrations/RPCs That Must Never Be Edited

Applied production-style migrations must not be edited:

| Migration | Summary |
| --- | --- |
| `20260702000100_extensions_enums_helpers.sql` | Extensions, enums, helpers. |
| `20260702000200_identity_tenancy_rls.sql` | Identity, tenancy, RLS foundations. |
| `20260702000300_audit_outbox.sql` | Audit and outbox. |
| `20260702000400_communication_foundation_rls.sql` | Communication foundation and RLS. |
| `20260702000500_fnb_foundation_rls.sql` | F&B tables and RLS. |
| `20260702000600_data_api_privileges.sql` | Data API grants. |
| `20260702000700_milestone_3_vertical_slice.sql` | Staff vertical-slice RPCs and kitchen station membership. |
| `20260702000800_public_qr_ordering.sql` | Public QR ordering RPCs/tokens. |
| `20260703000100_public_tracking_alignment.sql` | Public tracking truthfulness correction. |

Existing RPCs may be superseded by new forward migrations, wrappers, or compatibility functions. Do not edit their historical migration definitions after remote application.

## 12. Why Forward-Only Migrations Are Required

Forward-only migrations are required because:

- remote migrations 001-009 are already applied;
- payment, inventory, audit, communication-review, and public tracking evidence must remain trustworthy;
- destructive rollback can erase evidence or create a false business history;
- production, preview, and local databases can diverge if old migrations are rewritten;
- Supabase migration history expects applied migrations to stay stable;
- future agents need reliable historical context.

Production remediation uses new corrective migrations. Disposable local reset is allowed only for local test databases.

## 13. Current Implementation Boundary Inventory

Current application route names:

- `/`
- `/login`
- `/app`
- `/app/waiter`
- `/app/kitchen`
- `/app/connect`
- `/app/orders/[id]`
- `/t/[tableToken]`
- `/order/[publicOrderId]`

Current main service names:

- `lib/services/context.ts`
- `lib/services/orders.ts`
- `lib/services/kitchen.ts`
- `lib/services/inventory.ts`
- `lib/services/dashboard.ts`
- `lib/services/communication.ts`
- `lib/services/public-ordering.ts`

Current migration sequence:

- `20260702000100_extensions_enums_helpers.sql`
- `20260702000200_identity_tenancy_rls.sql`
- `20260702000300_audit_outbox.sql`
- `20260702000400_communication_foundation_rls.sql`
- `20260702000500_fnb_foundation_rls.sql`
- `20260702000600_data_api_privileges.sql`
- `20260702000700_milestone_3_vertical_slice.sql`
- `20260702000800_public_qr_ordering.sql`
- `20260703000100_public_tracking_alignment.sql`

## 14. Gap Summary

| Gap | Severity | Roadmap phase |
| --- | --- | --- |
| Payment/release/kitchen/fulfilment separation incomplete | High | V3.1 |
| One-outlet QR default not implemented | High | V3.2 |
| Dynamic menu management missing | High | V3.3 |
| Employee/employment/payroll foundation missing | High | V3.4 |
| Records centre and complete logs missing | Medium | V3.5 |
| Fulfilment, shifts, tasks, approvals incomplete | Medium | V3.6 |
| Supplier/expense/profitability incomplete | Medium | V3.7 |
| Deterministic analysis missing | Medium | V3.8 |
| Real connector framework missing | High but approval-gated | V3.9 |
| CI/CD/observability/demo hardening incomplete | Medium | V3.10 |
