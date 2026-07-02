# Milestone 3 Report - Visible F&B Competition Vertical Slice

## Scope Completed

Accelerated Milestone 3 implemented the visible Flow for Food & Beverage vertical slice:

```text
waiter order entry
-> server-side order creation
-> kitchen ticket creation
-> kitchen status progression
-> inventory reservation and consumption
-> owner dashboard update
-> order-linked Flow Connect thread
```

The implementation uses the real Supabase project, real BrewBite Kitchen seed data, and committed database state. Critical writes are performed by controlled server-side services calling database RPCs.

## Database Migration

Created and applied remotely:

- `supabase/migrations/20260702000700_milestone_3_vertical_slice.sql`

Migration contents:

- Added `kitchen_station_memberships` for station-scoped kitchen access.
- Added demo BrewBite `table_sessions` rows when missing.
- Assigned seeded kitchen users to seeded kitchen stations.
- Added transactional RPCs:
  - `flow_m3_create_table_order`
  - `flow_m3_transition_kitchen_ticket`
  - `flow_m3_demo_manual_settlement`
  - `flow_m3_send_message`
- Added helper functions for role checks and inventory availability.
- Granted execute privileges to `authenticated`.

Remote status:

- `pnpm db:push` applied migration `20260702000700_milestone_3_vertical_slice.sql` successfully.

## Server-Side Services Added

- `lib/services/context.ts`
- `lib/services/orders.ts`
- `lib/services/kitchen.ts`
- `lib/services/inventory.ts`
- `lib/services/dashboard.ts`
- `lib/services/communication.ts`
- `lib/format.ts`

Service boundaries:

- Order creation uses server action -> service -> RPC transaction.
- Kitchen transitions use server action -> service -> RPC transaction.
- Demo settlement uses server action -> service -> RPC transaction.
- Connect message sending uses server action -> service -> RPC and cannot mutate business state.
- Dashboard, order detail, waiter, kitchen, and Connect reads enforce active membership, org scope, role scope, outlet/station scope, or room membership as applicable.

## UI Routes Added

- `/app` owner/manager dashboard
- `/app/waiter` waiter order entry
- `/app/kitchen` kitchen board
- `/app/connect` P0 Flow Connect rooms and order thread view
- `/app/orders/[id]` internal order detail

Supporting UI:

- `components/auto-refresh.tsx` for polling/refetch.
- `components/flow-ui.tsx` for the focused Flow shell, navigation, badges, and state panels.
- Route loading/error states under `/app`.

## Role and Authorization Rules

- Dashboard: owner, organisation admin, manager.
- Waiter order entry: owner, organisation admin, manager, cashier, waiter.
- Kitchen board: owner, organisation admin, manager, kitchen.
- Kitchen users see only assigned station tickets.
- Demo manual settlement: owner, organisation admin, manager, cashier.
- Connect reads show only rooms where the current user is a room member.
- Work-item order thread is created by the order RPC and room access is explicit membership-based.
- Cross-tenant order detail is blocked by server-side `org_id` filtering.
- Platform Super Admin no-default-tenant-access rule was not changed.

## Validation Outcomes

Commands run:

| Command | Outcome |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 8 files, 27 tests |
| `pnpm build` | Passed |
| `pnpm db:push` | Passed; applied migration 007 remotely |

Additional test coverage added:

- Out-of-stock order creation guard.
- Order RPC creates order, lines, ticket, reservation, audit, and outbox.
- Invalid kitchen transition rejection.
- PREPARING consumes inventory once only.
- Kitchen user station isolation.
- Cross-org order detail guard.
- Demo manual settlement role and audit evidence.
- Chat message cannot change order, kitchen, inventory, or payment state.
- Work-item thread has explicit room membership.

## Manual Test Result

Browser automation note:

- Playwright CLI could not launch because Chrome is not installed in the execution environment.
- No browser/tool installation was performed.

Live Supabase smoke test:

- Signed in with seeded owner credentials from `.env.local`.
- Loaded real BrewBite org/outlet/table/menu data.
- Created a table-service order through `flow_m3_create_table_order`.
- Confirmed kitchen ticket creation.
- Progressed ticket through `ACCEPTED -> PREPARING -> READY -> COMPLETED`.
- Confirmed PREPARING path executed inventory consumption logic.
- Recorded `DEMO_MANUAL_SETTLEMENT`; order became `PAID`.
- Sent a plain-text message to the order-linked work-item thread.
- Confirmed audit evidence for order creation and demo settlement.

Smoke result:

```text
order created: yes
kitchen ticket created: yes
kitchen progression: yes
demo manual settlement: PAID
order-linked message: yes
```

## Known Limitations

- Polling/refetch is used instead of complex realtime subscriptions for deadline reliability.
- The waiter flow supports the demo table-service order path only.
- No customer QR/public menu route exists yet.
- No real payment gateway exists yet.
- Demo manual settlement is intentionally limited to the approved roles and audit path.
- Kitchen station assignment is simple seeded-demo assignment.
- Reports, exports, advanced dashboards, direct work conversations, admin review UI, and notifications polish remain out of scope.

## Payment Statement

No real payment gateway was implemented.

`DEMO_MANUAL_SETTLEMENT` is not a payment integration, not Billplz, not a card-terminal flow, and not a hosted checkout. It is a competition-demo-only settlement action that requires owner/admin/manager/cashier authorization and writes immutable audit/outbox evidence.

## Strict Non-Goals Confirmation

Confirmed not implemented:

- Billplz, payment callback, QR hosted payment, card terminal integration, or fake gateway claim.
- Public customer QR page.
- Dashboards beyond the P0 widgets requested.
- Reports or export.
- Advanced Flow Connect capabilities.
- Direct Work Conversations.
- Admin review UI.
- AI, forecasting, Rescue Mode, i18n, Docker, CI/CD, or deployment.
- Platform workspace.
- New industry packs.
- Broad redesign of existing database/RLS architecture.
