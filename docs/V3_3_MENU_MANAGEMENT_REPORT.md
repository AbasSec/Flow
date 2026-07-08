# V3.3 Controlled Menu Management Report

**Branch:** `feat/v3-3-controlled-menu-management`
**Date:** 2026-07-07
**Status:** Ready for review

## Scope Completed

V3.3 introduces a protected `/app/menu` workspace for managing the outlet's live menu. Owner/Admin can create, edit, and archive categories and items. Manager can view the menu and toggle sold-out status with an optional reason. Sold-out items are blocked from public order submission through both the `/t/[tableToken]` and `/o/[outletToken]` routes.

## Role Authority Matrix

| Operation | Owner | Admin | Manager |
|---|---|---|---|
| View menu management workspace | ✅ | ✅ | ✅ |
| Create category | ✅ | ✅ | ✗ |
| Edit category (name, sort order) | ✅ | ✅ | ✗ |
| Archive category (no active items) | ✅ | ✅ | ✗ |
| Create item | ✅ | ✅ | ✗ |
| Edit item (name, description, price, visibility, station) | ✅ | ✅ | ✗ |
| Mark item sold out / available (with optional reason) | ✅ | ✅ | ✅ |
| Archive item | ✅ | ✅ | ✗ |

Navigation link (`Menu`) is visible only to Owner, Admin, and Manager. All other roles have no access.

## Public Menu Integration

Sold-out items are blocked at two layers:

1. **`flow_m4_public_item_available`** — returns `false` immediately when `is_sold_out = true`, before checking ingredient stock. Called by `flow_m4_public_menu` (table QR) and `flow_m4_public_outlet_menu` (outlet QR) to set the `available` field on each public menu item.

2. **`flow_m4_create_qr_table_order`** — `AND NOT mi.is_sold_out` in the temporary table join ensures sold-out items cannot be submitted even if a customer forges a request. If submitted quantity doesn't match available items, the order is rejected with "Invalid order request". `flow_m4_create_outlet_qr_order` (V3.2) delegates to this function unchanged — one fix covers both routes.

## Migration Summary

One new migration: `supabase/migrations/20260707000100_v3_3_menu_management.sql`

### Schema additions
- `menu_items.is_sold_out boolean NOT NULL DEFAULT false`
- `menu_items.sold_out_reason text NULL`

### Updated public RPCs (CREATE OR REPLACE)
- `flow_m4_public_item_available` — converted from `language sql` to `language plpgsql` for early-return control flow; short-circuits to `false` on `is_sold_out`. Grants re-applied (`anon, authenticated`).
- `flow_m4_create_qr_table_order` — complete V3.1 function body reproduced with `AND NOT mi.is_sold_out` added to the item lookup WHERE clause. All V3.1/LEGACY lifecycle branching, idempotency, inventory, audit, and outbox logic preserved exactly. Grants re-applied (`anon, authenticated`).

### New management RPCs (grant to `authenticated` only — never `anon`)
| RPC | Allowed roles |
|---|---|
| `flow_v3_3_get_outlet_menu(uuid)` | Owner, Admin, Manager |
| `flow_v3_3_create_menu_category(uuid, text, integer)` | Owner, Admin |
| `flow_v3_3_update_menu_category(uuid, uuid, text, integer)` | Owner, Admin |
| `flow_v3_3_archive_menu_category(uuid, uuid)` | Owner, Admin |
| `flow_v3_3_create_menu_item(uuid, uuid, text, text, bigint, boolean, uuid)` | Owner, Admin |
| `flow_v3_3_update_menu_item(uuid, uuid, text, text, bigint, boolean, uuid)` | Owner, Admin |
| `flow_v3_3_set_item_availability(uuid, uuid, boolean, text)` | Owner, Admin, Manager |
| `flow_v3_3_archive_menu_item(uuid, uuid)` | Owner, Admin |

All management RPCs: `SECURITY DEFINER`, `set search_path = pg_catalog, pg_temp`, call `flow_v3_1_require_outlet_role`, check `auth.uid()` is not null, write to `audit_events` with `actor_user_id`, `before_data`, `after_data`.

Category archive is blocked with a clear exception if any active items remain. Item archive uses soft-delete only (`is_active = false`); the `menu_item_id` FK has `ON DELETE RESTRICT` in `order_lines` — hard deletion would violate referential integrity regardless.

## Application Implementation

### `lib/services/menu-management.ts`
- `getOutletMenuForManagement(context)` — enforces `MANAGEMENT_ROLES` guard, uses `requireAdminClient()` for outlet lookup (table read), then `createSupabaseServerClient()` for the authenticated RPC call
- Seven mutation service functions (`createMenuCategory`, `updateMenuCategory`, `archiveMenuCategory`, `createMenuItem`, `updateMenuItem`, `setItemAvailability`, `archiveMenuItem`)
- Zod schemas handle form data coercion: `z.coerce.number()` for `priceSen` and `sortOrder`; `z.preprocess` for boolean (`soldOut`, `isPublic`) and nullable string (`description`, `stationId`) from `FormData`

### `app/app/menu/actions.ts`
- Seven server actions: `createCategoryAction`, `updateCategoryAction`, `archiveCategoryAction`, `createItemAction`, `updateItemAction`, `setAvailabilityAction`, `archiveItemAction`
- All call `revalidatePath("/app/menu")` on success; errors are handled server-side without exposing raw error messages to the client

### `app/app/menu/page.tsx`
- `force-dynamic` server component
- Enforces `MANAGEMENT_ROLES` before rendering; shows `StatePanel` for Forbidden/Unavailable states
- Renders `CategorySection` per category with: edit category form (`<details>` expand), archive button (only when no active items), per-item sold-out toggle (all management roles), per-item edit form (Owner/Admin, `<details>` expand), add item form (Owner/Admin, bottom of category)
- No internal UUIDs rendered as visible labels; IDs only appear in hidden form inputs

### `components/flow-ui.tsx`
- Added `MENU_VISIBLE_ROLES` (`organisation_owner`, `organisation_admin`, `manager`)
- Added `Menu` nav link gated on `showMenu` — visible only to management roles; cashier, waiter, kitchen, storekeeper roles see no Menu link

## Non-Regression Guarantees

- Migrations 001–011 are not modified
- `flow_v3_1_*` functions are not modified
- `order_lines`, `inventory_ledger`, `kitchen_tickets`, `public_tracking_token`, `public_menu_token`, `public_table_token`, `public_outlet_token` columns/values are untouched
- Existing `public_menu_token` values are never regenerated
- No hard deletes; all archive operations use `is_active = false`
- `order_lines.item_name_snapshot` and `order_lines.unit_price_sen` are written at order time and never changed by menu edits
- `Platform Super Admin` has no default tenant-content access (SECURITY DEFINER guards verify outlet membership explicitly via `flow_v3_1_require_outlet_role`)

## Files Created or Changed

Created:
- `supabase/migrations/20260707000100_v3_3_menu_management.sql`
- `lib/services/menu-management.ts`
- `app/app/menu/page.tsx`
- `app/app/menu/actions.ts`
- `tests/unit/v3-3-menu-management-static.test.ts`
- `docs/V3_3_MENU_MANAGEMENT_REPORT.md`

Changed:
- `components/flow-ui.tsx` — added `MENU_VISIBLE_ROLES`, `showMenu`, and `Menu` nav link

## Validation Results

| Check | Result |
|---|---|
| `git diff --check` | Passed |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed — 16 files, 309 tests |
| `pnpm build` | Passed — `/app/menu` appears in build output |

## Manual Acceptance Checklist

- Apply migration locally (`pnpm supabase db reset` or `pnpm supabase migration up`).
- Confirm `menu_items` table has `is_sold_out` and `sold_out_reason` columns.
- Sign in as Owner → navigate to `/app/menu` → confirm "Menu" link appears in nav.
- Create a category → verify it appears in the list.
- Add an item to the category → verify it appears under the category.
- Mark the item sold out (with reason) → verify badge and reason appear; public menu shows `available: false`.
- Attempt to order the sold-out item via `/o/[outletToken]` → verify submission is rejected.
- Mark the item available → verify badge clears; public ordering resumes.
- Archive the item → verify it disappears from the management list.
- Archive the (now empty) category → verify it disappears.
- Sign in as Manager → confirm "Menu" link appears; edit controls absent; sold-out toggle present.
- Sign in as Cashier → confirm no "Menu" link in nav; `/app/menu` returns Forbidden.
- Confirm `audit_events` records each mutation with `actor_user_id`, `before_data`, `after_data`.

## Deferred (Not In V3.3 Scope)

- Item images / storage uploads
- Modifiers, variants, extras, combinations
- Recipes and recipe management UI
- Ingredient or stock management
- Tax / service-charge logic
- Item-level sort order
- Moving an item to another category
- Bulk import
- Menu versioning
- Customer accounts, payment
- Public sold-out reasons (visible to customers)
- Kitchen flag UI
- Remote migration or deployment

## Remote-State Confirmation

No remote migration, deployment, Supabase setting, Vercel setting, secret, configuration, commit, or push was performed for this milestone.
