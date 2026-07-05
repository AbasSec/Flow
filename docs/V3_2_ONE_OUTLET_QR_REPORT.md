# V3.2 One-Outlet QR Ordering Report

**Branch:** `feat/v3-2-one-outlet-qr`
**Date:** 2026-07-05
**Status:** Ready for review

## Scope Completed

V3.2 introduces a single permanent outlet-level QR code. Customers scan one QR, select their table from a list, choose items, and submit. The order enters the existing V3.1 lifecycle unchanged: unpaid + NOT_RELEASED + no reservation + no Kitchen ticket until authorised Counter settlement and release.

## One-Outlet QR Model

One `public_outlet_token` per outlet (opaque hex token, 48 chars, unique, permanent). Staff place one printed QR per physical outlet location. The token never changes unless a migration explicitly resets it.

The previous per-table QR route (`/t/[tableToken]`) remains fully operational for any already-distributed codes.

## Customer Journey

1. Scan outlet QR → `/o/[outletToken]`
2. Page shows outlet name, pay-at-counter notice, table selector, and menu.
3. Customer selects table label (dropdown). Table labels are the only visible table identifier; the opaque `public_table_token` is stored in a hidden form field only.
4. Customer adds items using `public_menu_token` identifiers.
5. Customer taps "Order now". Submit is blocked until both a table and at least one item are selected.
6. Server action reads `tableToken` + `items` + `requestKey` from form data and calls `createPublicQrOrder` (existing).
7. `flow_m4_create_qr_table_order` validates the table token, checks outlet lifecycle mode, creates the order with `UNPAID + NOT_RELEASED` (V3_1 mode) or `RELEASED` (LEGACY mode).
8. Customer is redirected to `/order/[publicTrackingToken]`.

## Public Route and Safe-Token Architecture

| Surface | Token used | What it identifies |
|---|---|---|
| Outlet QR | `public_outlet_token` | Permanent outlet entry point |
| Table selection | `public_table_token` | Per-table opaque ordering context (hidden field only) |
| Item selection | `public_menu_token` | Per-item opaque identifier |
| Order tracking | `public_tracking_token` | Per-order tracking reference |

No internal UUIDs (outlet_id, org_id, site_id, table_session.id, menu_item.id) appear on any public route.

## Table Eligibility Rules

A table appears in the selector if and only if (checked by `flow_m4_public_outlet_menu`):
- `table_sessions.status IN ('AVAILABLE', 'OPEN')`
- `table_sessions.public_table_token IS NOT NULL`
- `table_sessions.public_token_expires_at IS NOT NULL AND > now()`
- `table_sessions.outlet_id = target_outlet.id`

## Server-Side Outlet/Table Binding

Submission from the `/o/[outletToken]` route uses `flow_m4_create_outlet_qr_order`, a new
outlet-aware wrapper RPC added in this migration.  The wrapper enforces the Decision Lock §8
requirement that "the server validates that the table is active, belongs to the outlet
represented by the outlet QR":

1. Validates outlet token minimum length (≥ 32 chars).
2. Validates table token minimum length (≥ 32 chars).
3. Resolves the active outlet from `public_outlet_token`.
4. Confirms `table_sessions.outlet_id = resolved_outlet.id` AND status AVAILABLE/OPEN AND non-expired token.
5. Only then delegates to `flow_m4_create_qr_table_order` (unchanged) for all lifecycle, inventory, idempotency, and audit logic.

A customer cannot submit a table token from a different outlet through this route even if they
somehow obtained a valid token, because step 4 rejects any table whose outlet_id does not match
the scanned outlet.

The legacy `/t/[tableToken]` route still calls `flow_m4_create_qr_table_order` directly — this is
unchanged and continues to work independently.

Short-lived ordering context minting, HTTP-level rate limiting, and broader abuse controls remain
deferred hardening work, identical to the pre-existing gap in the `/t/` route.

## Old Table-Token Compatibility

`/t/[tableToken]`, `app/t/[tableToken]/page.tsx`, `app/t/[tableToken]/actions.ts`, `app/t/[tableToken]/public-menu-client.tsx`, and `flow_m4_public_menu` are completely unchanged. Existing printed/distributed per-table QR codes continue to work.

## Lifecycle Preservation

The V3.1 lifecycle kernel is not modified:
- Payment ≠ release ≠ Kitchen ≠ fulfilment ≠ closure.
- No reservation, no inventory consumption, and no Kitchen ticket before authorised settlement and release (V3_1 mode).
- Counter, Kitchen, and Floor & Service roles and responsibilities are unchanged.
- READY tickets disappear from the active Kitchen board only after SERVED/COLLECTED/CANCELLED (handled by `isActiveKitchenBoardOrder`).

## Migration Summary

One new migration: `supabase/migrations/20260705000100_v3_2_outlet_qr.sql`

- Adds `public_outlet_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex')` to `public.outlets`.
- Seeds existing outlets before making the column non-null.
- Adds `CHECK (length(public_outlet_token) >= 32)` constraint.
- Creates `outlets_public_outlet_token_idx` unique index.
- Creates `flow_m4_public_outlet_menu(outlet_token text)` RPC: SECURITY DEFINER, safe search path, token-length guard, returns outlet name + eligible table list + menu categories with safe projections only.
- Grants execution to `anon, authenticated` only; revokes from `public`.
- Migrations 001–010 are not modified.

## Public Data Boundaries

Public routes do not expose:
- Outlet UUID / org UUID / site UUID
- Table session UUID
- Menu item UUID
- Station UUID / kitchen ticket UUID
- Staff identity
- Payment details beyond the customer's own estimated total
- Inventory levels
- Internal lifecycle fields (`release_policy`, `release_state`, `fulfilment_state`, etc.)
- Raw database/RPC errors
- Supabase/Postgres error messages

## Files Created or Changed

Created:
- `supabase/migrations/20260705000100_v3_2_outlet_qr.sql`
- `app/o/[outletToken]/page.tsx`
- `app/o/[outletToken]/actions.ts`
- `app/o/[outletToken]/public-outlet-menu-client.tsx`
- `tests/unit/v3-2-outlet-qr-static.test.ts`
- `docs/V3_2_ONE_OUTLET_QR_REPORT.md`

Changed:
- `lib/services/public-ordering.ts` — added `PublicOutletTable`, `PublicOutletMenu`, `OutletQrSource` types; added `getPublicOutletMenu`, `getOutletQrSource`, `createPublicOutletQrOrder`; renamed private `isValidPublicTableToken` → `isValidPublicToken`
- `app/app/page.tsx` — replaced `getFirstTableQrSource` + `/t/` QR with `getOutletQrSource` + `/o/` QR; updated dashboard section heading and description to outlet-level copy
- `tests/unit/public-tracking-alignment-static.test.ts` — updated 3 assertions to reflect V3.2 renamed identifiers (`tableQrUrl` → `outletQrUrl`, `tableQrSource` → `outletQrSource`, `isValidPublicTableToken` → `isValidPublicToken`)

Security remediation changes (pre-commit):
- `supabase/migrations/20260705000100_v3_2_outlet_qr.sql` — added `flow_m4_create_outlet_qr_order` wrapper with outlet/table cross-validation and deny-first grants
- `lib/services/public-ordering.ts` — added `createPublicOutletQrOrder` (calls new wrapper RPC, public client)
- `app/o/[outletToken]/actions.ts` — updated to call `createPublicOutletQrOrder` with both outlet and table tokens
- `app/o/[outletToken]/page.tsx` — passes `outletToken` prop to `PublicOutletMenuClient`
- `app/o/[outletToken]/public-outlet-menu-client.tsx` — accepts `outletToken` prop; adds hidden outlet token input
- `tests/unit/v3-2-outlet-qr-static.test.ts` — added wrapper RPC tests (11), service tests (6), updated action tests, client prop tests, dashboard copy tests

## Validation Results

| Check | Result |
|---|---|
| `git diff --check` | Passed |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed — 15 files, 255 tests |
| `pnpm build` | Passed — `/o/[outletToken]` route appears in build output |

## Manual Acceptance Checklist

- Apply migration locally (`pnpm supabase db reset` or `pnpm supabase migration up`).
- Confirm `outlets` table has `public_outlet_token` column with non-null hex value.
- Open Dashboard → confirm QR section shows an outlet-level QR pointing to `/o/[token]`.
- Scan the QR (or open the link) → page loads with outlet name, table selector, and menu.
- Verify table selector shows only `AVAILABLE`/`OPEN` tables with valid token expiry.
- Attempt to submit without selecting a table → submit button remains disabled; "Please select your table" prompt appears.
- Select a table and add items → submit button becomes active.
- Submit order → redirected to `/order/[publicTrackingToken]`.
- Tracking page shows `ORDER_RECEIVED` (V3_1 mode outlet).
- Counter workspace shows the order in awaiting-payment queue.
- Settle and release from Counter → Kitchen receives ticket.
- Verify `/t/[tableToken]` route still loads for an existing per-table token (backward compat).
- Invalid `/o/bad-token` → safe error page, no raw SQL/UUIDs.
- Confirm no `outlet_id`, `org_id`, `site_id`, or internal UUID appears in page HTML source.
- Outlet with no eligible tables shows "No tables are currently available for ordering."

## Deferred Non-Goals

- Customer accounts, order history, loyalty
- Real payment gateway or terminal
- Pickup/takeaway/delivery
- Reservation management
- Table transfer
- Customer order cancellation/modification
- Dynamic menu management
- Multiple active QR codes per outlet
- Real-time WebSocket/Realtime subscriptions on public pages
- AI features
- Remote migration or deployment

## Deferred Hardening (Explicitly Retained)

The following remain future work, unchanged from pre-remediation state:

- **Short-lived ordering context minting**: Decision Lock §8 describes "Flow mints a short-lived opaque ordering context after confirmation."  The current implementation binds outlet → table at submission; a separately minted per-submission context with its own expiry is not yet implemented.
- **HTTP-level rate limiting**: No per-IP or per-outlet rate limit on the `/o/` route or RPC.  The same absence applies to `/t/`.
- **Broader abuse controls**: Velocity checks, CAPTCHAs, or bot-detection on public ordering routes are not implemented.

These gaps are pre-existing in the `/t/[tableToken]` route and are not regressions introduced by V3.2.  They are tracked for a dedicated hardening milestone.

## V3.1 Lifecycle Non-Regression

No V3.1 lifecycle function was modified:
- `flow_m4_create_qr_table_order`, `flow_v3_1_*`, and `flow_m4_public_order_status` are unchanged.
- The new wrapper delegates directly to `flow_m4_create_qr_table_order`, preserving LEGACY/V3_1 branching, NOT_RELEASED state, inventory reservation, audit, and outbox behaviour without duplication.

## Remote-State Confirmation

No remote migration, deployment, Supabase setting, Vercel setting, secret, configuration, commit, or push was performed for this milestone.
