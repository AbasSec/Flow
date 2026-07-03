# Public Tracking Alignment Report

## Root Causes Found

- `flow_m4_public_order_status(text)` mapped `SUBMITTED` orders to `ACCEPTED`, so a newly submitted QR order displayed as accepted before any kitchen user accepted the ticket.
- The same RPC mapped terminal order states to `SERVED`, while the internal workflow uses kitchen ticket `COMPLETED` and order service status `SERVED_OR_COLLECTED` or `COMPLETED`.
- The dashboard Table QR link was derived from request host headers and did not validate the table token before rendering a QR/link.

## Status Mapping

Before:

| Trusted state | Public status |
| --- | --- |
| `DRAFT` / `SUBMITTED` | `ACCEPTED` |
| `PREPARING` | `PREPARING` |
| `READY` | `READY` |
| `SERVED_OR_COLLECTED` / `COMPLETED` | `SERVED` |
| `CANCELLED` | `UNAVAILABLE` |

After:

| Trusted current state | Public status | Public label |
| --- | --- | --- |
| kitchen ticket `NEW` | `ORDER_RECEIVED` | Order received |
| kitchen ticket `ACCEPTED` | `ACCEPTED` | Accepted |
| kitchen ticket `PREPARING` | `PREPARING` | Preparing |
| kitchen ticket `READY` | `READY` | Ready |
| kitchen ticket `COMPLETED` | `ORDER_COMPLETE` | Order complete |
| order `SERVED_OR_COLLECTED` / `COMPLETED` | `ORDER_COMPLETE` | Order complete |
| order `CANCELLED` | `UNAVAILABLE` | Unavailable |

The public status is still returned only through the opaque public tracking token and includes only safe fields.

## QR URL Behavior

Before:

- Dashboard QR URL used request host/protocol headers directly when present.
- Token validation was limited to checking that a token value existed.

After:

- Dashboard QR URL is built only when there is an active, unexpired, opaque public table token.
- The production fallback origin is `https://flow-ops-rho.vercel.app`.
- Local development still supports `localhost` and `127.0.0.1` origins.
- The QR payload and “Open table link” use the same complete tokenized URL:

```text
https://flow-ops-rho.vercel.app/t/<opaque-table-token>
```

- If no valid token exists, the dashboard renders a safe unavailable state instead of a clickable broken link or QR code.

## Migration

Created locally:

- `supabase/migrations/20260703000100_public_tracking_alignment.sql`

Migration summary:

- Replaces `public.flow_m4_public_order_status(text)`.
- Preserves `SECURITY DEFINER` with locked `search_path = pg_catalog, pg_temp`.
- Preserves explicit function privilege revokes.
- Grants execute only to `anon` and `authenticated` for the intended public status RPC.
- Does not add direct anonymous table grants.
- Does not expose raw IDs, staff data, inventory, audit, outbox, rooms, messages, or payment internals.

Remote status:

- Not applied remotely.
- `pnpm supabase db push` was not run.

## Security and Boundary Confirmation

Confirmed unchanged:

- Public tracking uses opaque expiring public order tokens.
- Public table links use opaque public table tokens.
- Public routes do not expose raw organisation, outlet, table, order, ticket, room, or message IDs.
- Public routes do not expose staff names, inventory, recipes, stock, audit, outbox, or payment internals.
- RLS, tenant isolation, RPC grants, kitchen authorization, inventory semantics, order semantics, and manual settlement rules were not weakened.
- QR ordering remains pay-at-counter table service. No payment gateway was added.

## Manual Production Test Checklist

- Apply the new migration only after approval.
- Open `/app` in production and confirm Table QR is visible only when a valid token exists.
- Confirm “Open table link” points to `https://flow-ops-rho.vercel.app/t/<opaque-table-token>`.
- Scan the QR code and confirm it opens the same tokenized URL.
- Submit a public QR order and open `/order/<publicOrderId>`.
- Confirm the first public status is `Order received`.
- Confirm the kitchen board receives a real `NEW` ticket.
- Move the ticket to `ACCEPTED`; confirm public status changes to `Accepted`.
- Move the ticket to `PREPARING`; confirm public status changes to `Preparing`.
- Move the ticket to `READY`; confirm public status changes to `Ready`.
- Move the ticket to `COMPLETED`; confirm public status changes to `Order complete`.
- Confirm the public page never shows internal IDs, staff, inventory, audit, outbox, rooms, messages, payment internals, or another customer’s order.

## Known Limitations

- The migration is local only until owner approval and remote application.
- Public tracking remains polling/refetch based.
- The public terminal label is intentionally neutral because the canonical internal order state cannot distinguish served versus collected for every order channel.
