# Milestone 4 Report - Public QR Table Ordering and Safe Customer Tracking

## Scope Completed

Accelerated Milestone 4 adds the public BrewBite QR table-ordering path:

```text
customer opens /t/[tableToken]
-> sees safe table/menu context
-> submits unpaid pay-at-counter table order
-> server RPC creates order, lines, kitchen ticket, inventory reservation, audit, outbox, and internal work thread
-> customer tracks safe status at /order/[publicOrderId]
-> protected staff workflow later records DEMO_MANUAL_SETTLEMENT
```

No browser-only workflow outcomes were added. Public routes use narrow safe projections and do not expose raw tenant identifiers, staff data, inventory balances, audit records, messages, payment details, or internal tickets.

## Migration Created

Created locally only:

- `supabase/migrations/20260702000800_public_qr_ordering.sql`

Remote status:

- Not applied remotely.
- `pnpm supabase db push` was not run for this milestone.
- Owner approval is required before applying migration 008.

Migration summary:

- Adds `table_sessions.public_table_token` and `public_token_expires_at`.
- Adds `menu_items.public_menu_token`.
- Adds `orders.public_tracking_token` and `public_tracking_expires_at`.
- Populates existing seeded rows with high-entropy opaque tokens.
- Adds unique indexes and token-length constraints.
- Sets demo defaults for future table/menu public tokens while requiring table-token expiry.
- Adds safe public RPCs:
  - `flow_m4_public_menu(text)`
  - `flow_m4_create_qr_table_order(text, jsonb, text)`
  - `flow_m4_public_order_status(text)`
- Adds internal helper `flow_m4_public_item_available(uuid, uuid, integer)` for RPC implementation only.
- Hardens migration 008 before remote application with locked `SECURITY DEFINER` search paths, explicit function privilege revokes, and intended grants only.
- Includes a forward privilege-hardening section for existing Flow application RPCs/functions from earlier migrations.
- Grants execute to `anon` and `authenticated` only for the three intended public RPCs.
- Limits anonymous function execution to exactly `flow_m4_public_menu(text)`, `flow_m4_create_qr_table_order(text, jsonb, text)`, and `flow_m4_public_order_status(text)`.
- Does not expose a raw-UUID stock/availability helper to `PUBLIC`, `anon`, or `authenticated`.
- Does not grant anonymous table access.
- Does not create payment tables, payment attempts, payment callbacks, customer accounts, or public chat.

## Public Data Boundary

`/t/[tableToken]` exposes only:

- outlet display name
- safe table label
- menu category names
- menu item names/descriptions
- safe displayed price in sen
- availability boolean
- opaque public menu token
- pay-at-counter label

`/order/[publicOrderId]` exposes only:

- safe status: `ACCEPTED`, `PREPARING`, `READY`, `SERVED`, `COLLECTED`, or unavailable state
- safe table label
- submitted time
- pay-at-counter label

Explicitly not exposed publicly:

- raw table IDs, org IDs, outlet IDs, order IDs, ticket IDs, room IDs
- staff names or employee data
- inventory balances, ingredient IDs, recipe data, ledger entries
- payment details or payment state internals
- audit logs, outbox records, Flow Connect rooms/messages
- other orders or tenant metadata

## Public Order Semantics

- Public orders use an opaque table token.
- Public table tokens must be active, non-null, and unexpired.
- Public menu item submission uses opaque menu tokens, not internal IDs.
- Server RPC validates table context, outlet context, item availability, quantities, prices, recipes, and stock.
- SQL `NULL` cart payloads are rejected before JSON inspection, integer conversion, or any business side effects.
- Duplicate menu-token entries and malformed quantity payloads are rejected before order creation.
- Server calculates totals from committed menu records.
- Public orders use `order_channel = 'qr'`.
- Public orders remain `UNPAID`.
- Public orders create kitchen tickets and inventory reservations atomically.
- Public orders create audit and outbox evidence.
- Public orders create an internal work-item thread for authorised staff only.
- Public orders never create payment records and never claim payment succeeded.
- Duplicate submissions are handled through idempotency.

## Routes Added

- `/t/[tableToken]`
  - mobile-first public table menu
  - cart
  - unavailable item handling
  - duplicate-submit pending state
  - “Order now - pay at counter”

- `/order/[publicOrderId]`
  - safe public order tracking
  - polling/refetch
  - safe invalid/expired link state

Internal addition:

- `/app` now includes a focused Table QR section with:
  - scannable QR code
  - copyable `/t/[tableToken]` fallback link
  - clear pay-at-counter wording

## Files Created or Changed

Created:

- `app/t/[tableToken]/actions.ts`
- `app/t/[tableToken]/public-menu-client.tsx`
- `app/t/[tableToken]/page.tsx`
- `app/t/[tableToken]/loading.tsx`
- `app/t/[tableToken]/error.tsx`
- `app/order/[publicOrderId]/page.tsx`
- `app/order/[publicOrderId]/loading.tsx`
- `app/order/[publicOrderId]/error.tsx`
- `lib/db/public.ts`
- `lib/services/public-ordering.ts`
- `supabase/migrations/20260702000800_public_qr_ordering.sql`
- `tests/unit/milestone4-static.test.ts`
- `docs/MILESTONE_4_REPORT.md`

Changed:

- `app/app/page.tsx`
- `package.json`
- `pnpm-lock.yaml`

Dependency added:

- `qrcode`
- `@types/qrcode`

## Tests and Validation

Commands run:

| Command | Outcome |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 9 files, 46 tests |
| `pnpm build` | Passed |

Focused tests added for:

- unknown/expired token safe not-found posture through token guard/static RPC checks
- safe public menu fields only
- explicit public RPC grants and no exposed raw-UUID stock oracle
- inherited Flow application function revokes for `PUBLIC` and `anon`
- exact anonymous execution limited to the three approved public QR RPCs
- SQL `NULL` cart payload rejection before side effects
- locked security-definer search paths
- duplicate menu-token rejection
- safe malformed quantity rejection before integer conversion
- public QR order cannot override price, quantity, outlet, table, or raw item IDs
- public order creates order, ticket, reservation, audit, and outbox through controlled RPC
- duplicate submission idempotency
- sold-out item rejection
- public user cannot receive internal table grants or Flow Connect access
- safe public tracking uses opaque token and does not reveal internals
- public QR order remains unpaid and does not create payment records
- public order does not expose staff, inventory, payment, audit, or internal thread data

## Manual Test Checklist

Pending remote migration approval and application:

- Apply migration 008 with `pnpm supabase db push`.
- Open owner dashboard and confirm Table QR renders.
- Open copied `/t/[tableToken]` link in a logged-out/private browser.
- Confirm only safe table/menu data appears.
- Add available item to cart.
- Submit order once and confirm redirect to `/order/[publicOrderId]`.
- Refresh/re-submit duplicate request and confirm idempotent behavior.
- Confirm internal kitchen board receives real ticket.
- Progress kitchen ticket and confirm public status updates by polling.
- Confirm public page never shows internal IDs, payment details, staff, inventory, audit, rooms, or messages.
- Use protected internal order detail to record `DEMO_MANUAL_SETTLEMENT`.
- Confirm public status remains a safe operational status and does not claim online payment.

Manual live testing was not performed because migration 008 was intentionally not applied remotely in this milestone.

## Known Limitations

- Migration 008 must be approved and applied before public QR routes can work against the live project.
- Public tracking links expire after the configured database interval.
- QR section shows one seeded table only.
- No generic QR-management/settings screen.
- No public customer account.
- No customer chat.
- No online checkout or payment callback.
- Public route refresh uses polling/refetch, not advanced realtime.

## Payment Statement

QR ordering is pay-at-counter table service. No payment gateway is implemented.

This milestone does not implement Billplz, online checkout, payment callback, card-terminal integration, fake payment status, or gateway claims. Staff still use the protected internal `DEMO_MANUAL_SETTLEMENT` action later, and that action is not a real payment integration.

## Strict Scope Confirmation

Confirmed not implemented:

- Billplz, online checkout, payment callback, card-terminal integration, fake payment status, or gateway claims.
- Customer login or customer account.
- Public Flow Connect or customer chat.
- Public inventory or staff information.
- Admin/settings expansion beyond the focused QR source.
- Reports or export.
- Direct Work Conversations or admin review UI.
- AI, forecasts, Rescue Mode, i18n, Docker, CI/CD, deployment, or new industry packs.
- Broad redesign of existing database/RLS architecture.
