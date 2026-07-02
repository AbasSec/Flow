# Flow Implementation Plan

> Status: Planning-only draft for product-owner approval  
> Date: 2 July 2026  
> Scope: Flow Core, Flow Connect, and Flow for Food & Beverage P0/P1/P2 implementation sequencing  
> Authority: `docs/FLOW_DECISION_LOCK_V2.md` is authoritative over this plan. If this plan conflicts with Decision Lock v2, Decision Lock v2 wins.

## 1. Planning Guardrails

This file is the only permitted implementation artifact before product-owner approval. It does not create application code, dependencies, Supabase projects, migrations, environment files, UI components, or API routes.

Implementation may begin only after the product owner approves this plan. Each later milestone must restate scope, non-goals, changed files, data migration effect, test plan, and recovery risk before any code is changed.

| Rule | Planning decision |
|---|---|
| Product identity | Flow is a secure operational-control platform with Flow Core plus industry packs. |
| Competition proof | Flow for Food & Beverage is the only complete pack for the current competition. |
| Flow Connect boundary | Internal, role-aware, company-managed operational communication only. |
| Business truth | Server-side domain services and committed database state are authoritative. |
| Public boundary | Public customer/guest routes expose narrow safe projections only. |
| Platform admin boundary | Platform Super Admin has no default tenant-content access. |
| Payment truth | Browser redirect never proves payment. Verified callback does. |
| Inventory truth | Append-only inventory ledger plus reservations. No direct stock edits. |
| Realtime truth | Realtime events are refresh hints after database commit. |

## 2. Product Architecture

### 2.1 Flow Core

Flow Core provides reusable organisation infrastructure:

- Organisations, sites, teams, profiles, memberships, roles, permissions, and policies.
- Flow Connect internal communication.
- Tasks, incidents, approvals, notifications, audit, reports, and realtime events.
- Support-elevation controls for platform operations without default tenant-content access.
- Constrained intelligence later, behind server-side permission checks.

Flow Core must be useful beyond Food & Beverage, but future industry packs remain architecture only until separately approved.

### 2.2 Flow Connect

Flow Connect is part of the private organisation workspace. It includes:

- P0: Organisation Hub for active employees.
- P0: one Team Room for the demo tenant.
- P0: Direct Work Conversations with company-managed transparency notice and current-policy acknowledgement.
- P0: one work-item thread attached to an order or kitchen ticket.
- P0: read state, private realtime refresh, and temporary authorised review with reason and immutable audit.
- P1: announcements, mentions, reactions, attachments, search, structured handovers, incident rooms, exports, configurable retention, and message-to-task conversion.

Flow Connect must not become a public community, public social feed, generic chat clone, or a channel for bypassing formal state transitions.

### 2.3 Food & Beverage Pack

Flow for Food & Beverage proves the platform through:

- Table, counter, QR table, and online pickup orders.
- Hosted payment and manual settlement truth.
- Kitchen tickets routed by station.
- Recipe-led inventory reservations, consumption, release, and waste.
- Dashboard and reports using committed operational state.
- Manager-approved operational actions linked to audit and contextual communication.

The P0 golden loop is:

```text
table/counter/QR/online order
-> valid payment or settlement
-> kitchen ticket
-> recipe-led inventory truth
-> live dashboard/report state
-> controlled manager-approved action
-> Flow Connect context/task/audit evidence
```

### 2.4 Public Customer Area vs Private Organisation Workspace

| Area | Users | Routes | Data boundary |
|---|---|---|---|
| Public customer area | Customer/guest | `/m/[outletSlug]`, `/t/[tableToken]`, `/checkout/[attemptId]`, `/order/[publicOrderId]` | Safe menu, checkout, and narrow order status only. No Flow Connect, staff data, internal ids, reports, attachments, or tenant metadata. |
| Private organisation workspace | Active employees | `/app/*` | Authenticated organisation data filtered by membership, role, permission, site, team, outlet, and room membership. |
| Platform workspace | Platform Super Admin | `/platform` | Platform operations only by default. Tenant content requires explicit support elevation, scope, expiry, and audit. |

## 3. Platform and Tenant Model

### 3.1 Tenant Boundaries

| Boundary | Meaning | Enforcement |
|---|---|---|
| Organisation | Primary tenant boundary. Every tenant-owned table includes `org_id`. | RLS, server-side authz, unique constraints scoped by `org_id`. |
| Site | Generic operational location within an organisation. | `site_id`, site membership, role/permission checks. |
| Outlet | F&B extension of a site. | `outlet_id`, mapped to `sites.id`, outlet-scoped service checks. |
| Team | Functional group such as Front of House, Kitchen, Inventory, Managers. | `team_id`, team membership, room and task scoping. |
| Workspace | Private organisation workspace or public customer area. | Route boundary, auth boundary, safe projection boundary. |

### 3.2 Roles and Access Model

Role labels provide defaults only. Enforcement must use explicit permissions and active memberships.

| Role | Default purpose | Hard limits |
|---|---|---|
| Platform Super Admin | Operates Flow platform, tenant setup, support tooling, platform health. | No default access to tenant messages, orders, staff records, reports, or business data. |
| Organisation Owner | Full tenant policy authority, settings, reports, audit, roles, communication governance. | Cannot erase immutable payment, inventory, audit, or review evidence. |
| Organisation Admin | Delegated administration of staff, teams, rooms, settings, communication policy, and permitted reports. | Cannot access other tenants or erase immutable records. |
| Manager | Assigned site/team/outlet operations, approvals, queues, tasks, incidents, selected reports. | No default organisation-wide Direct Work Conversation review. |
| Cashier | Counter POS, settlement records, receipts, pickup workflow, own rooms/threads. | Cannot self-approve restricted discounts/voids or change historic payments. |
| Waiter/Floor staff | Table sessions, order submission, bill requests, floor state, own rooms/threads. | Cannot access financial reports, admin rooms, or unrelated rooms. |
| Kitchen staff | Assigned station tickets and station room/thread context. | Cannot access revenue, payment details, customer contact data, or admin reports. |
| Storekeeper | Stock receiving, lots, counts, adjustment requests, inventory rooms. | Cannot approve own restricted adjustments or access revenue by default. |
| Customer/Guest | Public order/menu/payment/status only. | No Flow Connect or private tenant access in P0. |

### 3.3 Permission Matrix

| Permission | Owner | Org Admin | Manager | Cashier | Waiter | Kitchen | Storekeeper | Platform Super Admin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `organisation.manage` | Yes | Delegated | No | No | No | No | No | No tenant default |
| `site.manage` | Yes | Yes | Scoped | No | No | No | No | No tenant default |
| `team.manage` | Yes | Yes | Scoped | No | No | No | No | No tenant default |
| `staff.manage` | Yes | Yes | Scoped optional | No | No | No | No | No tenant default |
| `role.assign` | Yes | Yes | No | No | No | No | No | No tenant default |
| `communication.room.manage` | Yes | Yes | Scoped | No | No | No | No | No tenant default |
| `communication.message.send` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No tenant default |
| `communication.room.invite` | Yes | Yes | Scoped | No | No | No | No | No tenant default |
| `communication.audit.review` | Yes | Yes | No default | No | No | No | No | No tenant default |
| `communication.retention.manage` | Yes | Yes | No | No | No | No | No | No tenant default |
| `communication.export` | Yes | Yes | No default | No | No | No | No | No tenant default |
| `task.manage` | Yes | Yes | Scoped | Scoped own | Scoped own | Scoped own | Scoped own | No tenant default |
| `approval.decide` | Yes | Yes | Scoped | No self-approval | No | No | No self-approval | No tenant default |
| `audit.read` | Yes | Yes | Scoped | No | No | No | No | No tenant default |
| `report.read` | Yes | Yes | Scoped | No default | No default | No default | Inventory scoped | No tenant default |
| `payment.configure` | Yes | Yes | No | No | No | No | No | No tenant default |
| `payment.settle` | Yes | Yes | Scoped | Yes | No | No | No | No tenant default |
| `inventory.adjust.request` | Yes | Yes | Scoped | No | No | No | Yes | No tenant default |
| `inventory.adjust.approve` | Yes | Yes | Scoped | No | No | No self-approval | No self-approval | No tenant default |

`communication.retention.manage` and `communication.export` are listed for the permission model but remain P1 feature surfaces until product/legal review approves configurable retention and exports.

### 3.4 Support Elevation

Platform Super Admin tenant-content access requires a `support_access_grant` with:

- `platform_admin_id`
- `org_id`
- `purpose`
- `approved_by_org_owner_id`
- `scope`
- `granted_at`
- `expires_at`
- `revoked_at`

RLS and server services must deny tenant content to platform admins unless a valid, unexpired, scoped grant exists. Every elevated read or write must create audit evidence.

## 4. Communication Architecture

### 4.1 Room Types

| Room type | P0/P1 | Audience | Posting policy | Review policy |
|---|---|---|---|---|
| `ORG_HUB` | P0 | All active organisation employees | Active members with send permission | Non-member review requires temporary review access grant plus immutable audit. |
| `TEAM_ROOM` | P0, one room | Team members and scoped managers | Active room members | Non-member review requires temporary review access grant plus immutable audit. |
| `DIRECT_WORK` | P0 | Two active employees or an operational group of up to five active employees | Participants only | Company-managed review by Owner/Admin with `communication.audit.review`, reason, temporary grant, and immutable audit. |
| `WORK_ITEM_THREAD` | P0, one order or kitchen ticket thread | Users authorised for linked order or kitchen ticket | Authorised linked users | Review follows linked object and communication review policy. |
| `ANNOUNCEMENT` | P1 | All employees or selected roles/sites | Owner/Admin/allowed Manager only | Review by authorised communication reviewer. |
| `SHIFT_HANDOVER` | P1 | Outgoing/incoming shift and managers | Assigned shift users | Review by authorised communication reviewer. |
| `INCIDENT_ROOM` | P1 | Incident responders, manager, authorised admin | Assigned responders | Review by incident access plus review permission. |
| `ADMIN_ROOM` | P1 | Owner/Admin/invited managers | Explicit members | Strict member access; reviewer access audited. |

### 4.2 Required Direct Work Conversation Notice

Before first Direct Work Conversation use, each participant must acknowledge:

```text
This is a company-managed operational communication workspace. Authorised Organisation Owners and Organisation Administrators may review conversations for operational, security, compliance, safety, or incident-management purposes. Reviews are logged.
```

The UI and documentation must never call Direct Work Conversations "private DMs" or claim end-to-end encryption while authorised review exists.

### 4.3 Direct Work Conversation Creation

P0 Direct Work Conversation creation must satisfy all of these rules:

- Participants are either two active employees or an operational group of up to five active employees.
- Every participant belongs to the same organisation.
- Customer/guest users cannot join.
- The creator must be one of the participants.
- One active Direct Work Conversation exists per exact participant set within an organisation.
- Deactivated users lose room access immediately through membership and room-access checks.
- First send requires acknowledgement of the current communication policy version.

The exact participant set should be canonicalised for uniqueness, for example by storing a deterministic participant-set hash scoped by `org_id`.

### 4.4 Communication Policy Acknowledgement

Direct Work Conversation policy acknowledgement is separate from permissions. It records user notice and consent context but never grants extra access.

`communication_policy_acknowledgements` must include:

- `org_id`
- `user_id`
- `policy_version`
- `acknowledged_at`
- `acknowledgement_source`
- optional `ip_hash`

Rules:

- First Direct Work Conversation send requires acknowledgement of the current policy version.
- A new communication policy version requires a new acknowledgement before future Direct Work Conversation sending.
- Acknowledgement is auditable.
- Acknowledgement does not grant room membership, review access, message-send permission, or any other privilege.

### 4.5 Work-Item Threads

Work-item threads are created or linked through controlled services only. Supported P0 targets:

| Target type | Thread purpose | Access source |
|---|---|---|
| `ORDER` | Order exception, service coordination, bill/settlement context. | Order visibility plus room membership. |
| `KITCHEN_TICKET` | Station delay, availability exception, preparation coordination. | Ticket station assignment, manager scope. |

P1 may add table-session, inventory-risk, stock-adjustment, approval-request, staff-task, and incident threads after P0 passes. Messages in a thread can explain context but cannot directly approve, pay, cancel, refund, consume stock, change prices, or change workflow states.

### 4.6 Temporary Communication Review Access

Opening a non-member room or Direct Work Conversation through review requires:

1. Authenticated active organisation membership.
2. `communication.audit.review`.
3. Non-empty reason.
4. Server-side review command that creates a short-lived, room-scoped `communication_review_access_grants` row.
5. Immutable `communication_review_events` row in the same transaction as the temporary grant.
6. General `audit_events` row for reporting.
7. Automatic expiry of review access.
8. No silent platform-admin bypass.

`communication_review_access_grants` are the only review mechanism that allows a non-member reviewer to read room content. They are room-scoped, reviewer-scoped, reason-linked, and short-lived. P0 default expiry is 30 minutes from grant creation.

`communication_review_events` are immutable evidence only. They must never themselves grant permanent access, future access, or membership.

`communication_review_access_grants` must include at least `org_id`, `room_id`, `reviewer_user_id`, `reason`, `policy_version`, `granted_at`, `expires_at`, `revoked_at`, `created_by_user_id`, `request_id`, and optional `support_access_grant_id`.

`communication_review_events` must include at least `org_id`, `room_id`, `reviewer_user_id`, `review_access_grant_id`, `reason`, `policy_version`, `access_basis`, `created_at`, `request_id`, and optional `support_access_grant_id`.

Platform Super Admin still has no default tenant or chat access. If platform support ever needs review access, a valid scoped `support_access_grant` is required first, then the same temporary room-scoped communication review grant and immutable review event are required.

### 4.7 P0 Message Safety Controls

P0 messages are deliberately narrow:

- Plain text only.
- Maximum 4,000 characters per message.
- No user-supplied HTML rendering.
- Safe links only; no link previews and no external fetches in P0.
- Rate limits per user and per room.
- Idempotency key or client nonce for duplicate-send prevention.
- Preserve edit metadata, including editor, timestamp, and previous-body audit metadata where policy requires.
- Preserve soft-delete metadata, including actor, timestamp, and reason where policy requires.
- Attachments are excluded from P0.

### 4.8 Retention and Deletion Policy

P0 uses a documented default retention policy:

- Messages are soft-deleted for normal display when removed.
- Deletion preserves immutable audit/moderation metadata required by policy.
- Review events, payment events, stock ledger, and audit events are never hard-deleted by user action.
- Deactivated employees immediately lose access to current rooms, but retained records remain available to authorised audit processes and future P1 export workflows.
- Attachments are not available in P0.

P1 may add configurable retention/export workflows after product and legal review. No jurisdiction-specific compliance certification should be claimed in P0.

### 4.9 Attachment Strategy

| Release | Decision |
|---|---|
| P0 | Attachments are excluded. |
| P1 | Add production attachment flow with scanning strategy, quarantine state, previews where safe, retention policy hooks, and search metadata. |
| Never | Public storage buckets for internal attachments, raw attachment keys in public APIs, or attachment access by guessed ids. |

## 5. Database and Migration Plan

### 5.1 Migration Principles

- Forward-only migrations.
- Validate clean apply on an empty local database and on a seeded test database.
- Use forward corrective migrations or disposable local test reset for development mistakes instead of treating rollback as a production model.
- Preserve payment, inventory, audit, and communication-review evidence.
- UUID primary keys except human-facing references.
- `org_id` on every tenant-owned table.
- RLS enabled before application access.
- Critical unique constraints and indexes created with migrations, not deferred to application logic.
- Money stored as integer smallest units, for example `amount_sen bigint`.
- Historical snapshots for menu prices, recipes, taxes, service charges, and policy versions.
- All sensitive mutations write audit/outbox records in the same transaction.

### 5.2 Exact Migration Order

| Order | Migration | Main tables/objects | Gate before next migration |
|---:|---|---|---|
| 001 | Extensions, enums, base helpers | UUID extension, timestamp helpers, canonical enums, audit helper types. | Clean apply on empty local and seeded test databases. |
| 002 | Profiles and platform roles | `profiles`, `platform_admins`, profile status fields. | RLS denies unauthenticated profile access except own safe profile. |
| 003 | Organisations and sites | `organisations`, `sites`, org policy/version fields. | Every org/site row has owner and active state. |
| 004 | Membership and permissions | `org_memberships`, `site_memberships`, `teams`, `team_memberships`, `permission_grants`. | Active/deactivated membership tests pass. |
| 005 | Support elevation | `support_access_grants`, support access audit hooks. | Platform admin has no tenant access without valid grant. |
| 006 | Communication policy and rooms | `communication_retention_policies`, `communication_policy_acknowledgements`, `communication_rooms`, `room_memberships`. | Org Hub, one Team Room, Direct Work participant-set uniqueness, and policy acknowledgement tests pass. |
| 007 | Messages and read state | `messages`, `message_reads`. | Plain-text member send/read works; non-member denied; P0 message safety tests pass. |
| 008 | Work-item threads and temporary review | `work_item_threads`, `communication_review_access_grants`, `communication_review_events`. | Review permission, reason, 30-minute temporary grant, expiry, and immutable audit tests pass. |
| 009 | Core workflow primitives | `staff_tasks`, `incidents`, `approval_requests`, `notifications`. | Approval self-decision and task scope tests pass. |
| 010 | Audit and outbox | `audit_events`, `outbox_events`, event publisher state columns. | Sensitive mutation fixtures write audit/outbox in transaction. |
| 011 | F&B outlet configuration | `outlets`, `floors`, `restaurant_tables`, QR token metadata. | Public routes use opaque tokens only. |
| 012 | Menu and recipes | `menu_categories`, `menu_items`, `menu_item_modifiers`, `recipe_versions`, `recipe_lines`. | Price and recipe snapshot tests pass. |
| 013 | Inventory foundation | `ingredients`, `stock_lots`, `inventory_ledger`, reservation references. | Ledger append-only and FEFO tests pass. |
| 014 | Orders and table sessions | `table_sessions`, `orders`, `order_lines`. | Order state guard tests pass. |
| 015 | Kitchen tickets | `kitchen_stations`, `kitchen_tickets`, `ticket_lines`. | Station visibility and transition tests pass. |
| 016 | Payments and settlements | `payment_attempts`, `payment_callbacks`, `cashier_settlements`. | Callback idempotency and forged redirect tests pass. |
| 017 | Customers, expenses, reports foundations | `customers`, `customer_order_links`, `expenses`, report views/RPCs. | Customer consent and report-scope tests pass. |
| 018 | Demo seed and reset support | Seed fixtures, reset allowlist metadata, seed verification views. | Demo reset returns expected counts and topology. |
| 019 | P1 intelligence placeholders | `forecast_snapshots`, `promotion_proposals`, AI evidence metadata. | P1 disabled by default until approved. |

### 5.3 Core Identity and Organisation Tables

| Table | Required constraints/indexes |
|---|---|
| `profiles` | PK `user_id`; active state; unique lower email if stored; own-profile RLS. |
| `organisations` | PK `id`; owner profile reference; active state; timezone/currency; policy version. |
| `sites` | `org_id` FK; unique `(org_id, normalized_name)` for active sites. |
| `org_memberships` | Unique active `(org_id, user_id)`; role; active/deactivated timestamps. |
| `site_memberships` | Unique active `(org_id, site_id, user_id)`; scoped role/overrides. |
| `teams` | Unique active `(org_id, site_id, normalized_name)`. |
| `team_memberships` | Unique active `(org_id, team_id, user_id)`. |
| `permission_grants` | Unique active grant by `(org_id, subject_type, subject_id, permission)`; revocation metadata. |
| `support_access_grants` | Index active grants by `(platform_admin_id, org_id, expires_at)`; immutable approval metadata. |

### 5.4 Flow Connect Tables

| Table | Required constraints/indexes |
|---|---|
| `communication_retention_policies` | Versioned org policy; current policy unique per org; P0 uses documented default, P1 may add configurable retention/export. |
| `communication_policy_acknowledgements` | `org_id`, `user_id`, `policy_version`, `acknowledged_at`, `acknowledgement_source`, optional `ip_hash`; unique `(org_id, user_id, policy_version)`. |
| `communication_rooms` | `org_id`, room type, scope columns, active/archive state, optional `participant_set_hash` for Direct Work; unique active hub per org and unique active Direct Work participant set. |
| `room_memberships` | Unique active `(org_id, room_id, user_id)`; role; joined/left timestamps; read/mute state. |
| `messages` | `org_id`, `room_id`, author, plain text body, body hash/client nonce for duplicate-send prevention, reply parent, edit/delete metadata; index `(room_id, created_at desc)` where not deleted. |
| `message_reads` | Unique `(org_id, room_id, user_id)`; last read message/time. |
| `work_item_threads` | Unique `(org_id, entity_type, entity_id)`; linked room/thread. |
| `communication_review_access_grants` | Room-scoped temporary grants; reviewer, reason, policy version, `granted_at`, `expires_at`, optional `revoked_at`; P0 default expiry 30 minutes. |
| `communication_review_events` | Append-only evidence linked to `communication_review_access_grants`; index `(org_id, created_at desc)` and `(room_id, created_at desc)`. |
| `message_mentions` | P1 only; mentioned user/team references and notification dedupe key. |
| `message_attachments` | P1 only; private storage path, content type, size, scan state, uploader. |

### 5.5 Food & Beverage Tables

| Area | Tables | Required constraints/indexes |
|---|---|---|
| Outlet setup | `outlets`, `floors`, `restaurant_tables` | Outlet maps to site; table QR token unique and opaque; active table number unique per outlet/floor. |
| Menu | `menu_categories`, `menu_items`, `menu_item_modifiers` | Active item names unique per outlet/category; prices use integer sen. |
| Recipes | `recipe_versions`, `recipe_lines` | Immutable active recipe versions; order lines snapshot recipe version. |
| Inventory | `ingredients`, `stock_lots`, `inventory_ledger` | Ledger append-only; lot expiry indexes; no direct balance edits. |
| Orders | `table_sessions`, `orders`, `order_lines` | Idempotency key unique per org/outlet/actor; service and payment state separated. |
| Kitchen | `kitchen_stations`, `kitchen_tickets`, `ticket_lines` | Station/outlet scope; ticket line status transition guard. |
| Payments | `payment_attempts`, `payment_callbacks`, `cashier_settlements` | Provider reference unique; idempotency key unique; callback hash unique. |
| Customers | `customers`, `customer_order_links` | Consent version and safe optional profile; no required customer account for guest orders. |
| Costs | `expenses` | Approval threshold and audit references. |
| P1 intelligence | `forecast_snapshots`, `promotion_proposals` | Evidence snapshot and approval linkage. |

### 5.6 Required Indexes and Unique Constraints

```sql
-- Communication
unique (org_id, room_type) where archived_at is null and room_type = 'ORG_HUB';
unique (org_id, room_type, normalized_title) where archived_at is null and room_type = 'TEAM_ROOM';
unique (org_id, room_type, participant_set_hash) where archived_at is null and room_type = 'DIRECT_WORK';
unique (org_id, entity_type, entity_id) on work_item_threads;
unique (org_id, user_id, policy_version) on communication_policy_acknowledgements;
index (room_id, created_at desc) on messages where deleted_at is null;
unique (org_id, room_id, author_user_id, client_nonce) on messages where client_nonce is not null;
index (user_id, room_id) on room_memberships where left_at is null;
index (org_id, room_id, reviewer_user_id, expires_at) on communication_review_access_grants where revoked_at is null;
index (org_id, created_at desc) on communication_review_events;
index (org_id, author_user_id, created_at desc) on messages;

-- Tenancy and membership
unique (org_id, user_id) on org_memberships where deactivated_at is null;
unique (org_id, site_id, user_id) on site_memberships where deactivated_at is null;
unique (org_id, team_id, user_id) on team_memberships where left_at is null;

-- F&B
unique (org_id, outlet_id, idempotency_key) on orders where idempotency_key is not null;
unique (org_id, provider, provider_reference) on payment_attempts where provider_reference is not null;
unique (org_id, provider, callback_hash) on payment_callbacks;
unique (org_id, outlet_id, qr_token_hash) on restaurant_tables where archived_at is null;
index (org_id, outlet_id, service_status, created_at desc) on orders;
index (org_id, outlet_id, payment_status, created_at desc) on orders;
index (org_id, outlet_id, station_id, status, created_at) on kitchen_tickets;
index (org_id, outlet_id, ingredient_id, expires_at) on stock_lots;
index (org_id, ingredient_id, created_at desc) on inventory_ledger;
```

## 6. Security Model

### 6.1 Supabase RLS Strategy

RLS must be enabled on every tenant/business/communication table. Policies must be deny-by-default and testable.

| Table group | Read policy | Write policy |
|---|---|---|
| Profiles | Own safe profile; limited employee profile only within active org membership. | Own display preferences; staff admin through server service. |
| Organisations/sites | Active org/site membership; platform support only with valid grant. | Owner/Admin services only. |
| Memberships/permissions | Owner/Admin and scoped manager where allowed. | Server-side staff/role services only. |
| Rooms/messages | Active room membership or valid unexpired room-scoped `communication_review_access_grants`; valid support grant is also required for platform support users. | Active room member with send permission; Direct Work send requires current policy acknowledgement; moderation through service only. |
| Policy acknowledgements | Own acknowledgement and Owner/Admin audit visibility. | Insert only for current user through controlled acknowledgement command. No privilege grant side effects. |
| Review grants/events/audit | Valid reviewer can read own active grants; Owner/Admin with audit permission can read review records; scoped report readers where allowed. | Grants and events insert only through controlled review command; review events are append-only; grants expire automatically. |
| F&B records | Active org membership plus outlet/site/role scope; public safe projection only for public routes. | Controlled domain services/RPCs only for critical writes. |
| Public QR/status | Token-bound safe projection; no internal identifiers. | Public checkout command only, rate-limited and server-validated. |

### 6.2 Server-Side Authorization Rules

Every command endpoint must:

1. Authenticate session or validate public token.
2. Load active membership and scope.
3. Check required permission.
4. Validate payload with Zod.
5. Use idempotency key for create/settle/approve/payment operations.
6. Execute a transaction or controlled RPC.
7. Write audit/outbox for sensitive state.
8. Return typed safe errors only.

### 6.3 Tenant, Outlet, and Team Isolation

- `org_id` is mandatory and never trusted from client input without membership verification.
- `site_id`, `outlet_id`, and `team_id` scopes are derived or validated server-side.
- Users cannot switch tenants by guessing route params or ids.
- Kitchen station users can read only assigned station tickets and safe linked thread data.
- Managers operate only within assigned site/team/outlet unless granted wider permission.

### 6.4 Public QR Protection

- QR routes use opaque table tokens or public outlet slugs, never raw table/order ids.
- Token lookup returns only safe outlet/table/menu context.
- Cart validation recalculates prices, tax, service charge, modifiers, availability, and reservation server-side.
- Public APIs may return only approved safe public labels. They must never return staff identity details, room metadata, attachments, audit records, or internal ids.
- Public order status uses `public_order_id` or scoped token with narrow states only.

### 6.5 Message Privacy and Authorised Review

- Direct Work Conversations are company-managed and transparent.
- Owner/Admin review requires `communication.audit.review`, non-empty reason, temporary room-scoped access grant, immutable review event, and automatic expiry.
- P0 review access grants expire after 30 minutes.
- `communication_review_events` are immutable evidence only and never grant permanent or future access.
- Managers have no default organisation-wide review permission.
- Platform Super Admin has no tenant-message access without explicit support elevation.
- Message deletion does not erase required review, moderation, or audit evidence.

## 7. Service and API Plan

### 7.1 Service Boundaries

| Service | Responsibility | Critical rules |
|---|---|---|
| Auth and invitation service | Sign-in, invitations, active membership, communication policy acknowledgement. | No hard-coded accounts or keys; deactivated users lose access immediately. |
| Organisation service | Org/site/team/staff/role/permission setup. | Sensitive changes audited; role labels do not replace permissions. |
| Communication service | P0 rooms, plain-text messages, reads, Direct Work creation, policy acknowledgements, temporary review grants, immutable review events. | Messages never perform business state transitions; attachments/search/mentions/reactions move to P1. |
| Order service | Table/counter/QR/online orders and order state. | Server recalculates totals and validates availability. |
| Payment service | Hosted checkout, cash/terminal settlement, callback verification. | Redirect cannot mark paid; callback idempotent. |
| Kitchen service | Ticket routing and station state. | Station role boundaries; state transitions audited. |
| Inventory service | Reservations, FEFO consumption, release, waste, ledger. | Append-only ledger; no direct balance edit. |
| Approval service | Restricted decision records. | No self-approval for restricted actions; decisions audited. |
| Task/incident service | Operational work, incidents, linked rooms. | Formal task/incident states separate from chat. |
| Notification/realtime service | Outbox publishing and private channel events. | Refresh hints only; clients refetch source data. |
| Report service | Role-aware report queries. | Reports read committed source-of-truth records. |
| Demo reset service | Reset seeded demo tenant. | Protected, audited, environment-restricted. |

### 7.2 API Route Plan

| Area | Routes | Access |
|---|---|---|
| Authentication/invitations | `POST /api/invitations`, `POST /api/invitations/accept`, `POST /api/memberships/deactivate` | Owner/Admin/scoped manager as approved. |
| Chat/messages | `POST /api/connect/rooms`, `POST /api/connect/rooms/{id}/messages`, `POST /api/connect/direct`, `POST /api/connect/policy-acknowledgements`, `POST /api/connect/reviews`, `POST /api/connect/messages/{id}/read` | Active members, room roles, current policy acknowledgement for Direct Work sending, or temporary review grant. |
| Work-item threads | `GET/POST /api/connect/work-items/{type}/{id}` | P0 order or kitchen-ticket linked users only. |
| Orders | `POST /api/orders/table-sessions`, `POST /api/orders/table-sessions/{id}/lines`, `POST /api/orders/{id}/request-bill`, `POST /api/orders/counter` | Waiter/cashier/manager by outlet scope. |
| Public orders | `GET /api/public/menu`, `POST /api/public/checkout`, `GET /api/public/orders/{publicOrderId}` | Token/slugs, narrow projection, rate-limited. |
| Payments | `POST /api/orders/{id}/settle-cash`, `POST /api/orders/{id}/settle-terminal`, `POST /api/payments/billplz/callback` | Cashier/manager or provider callback. |
| Kitchen | `GET /api/kitchen/stations/{id}/tickets`, `POST /api/kitchen/tickets/{id}/status` | Assigned station staff/manager. |
| Inventory | `POST /api/inventory/receipts`, `POST /api/inventory/adjustments`, `POST /api/inventory/adjustments/{id}/approve` | Storekeeper/manager with no self-approval. |
| Approvals | `POST /api/approvals/{id}/decision` | Eligible approver only. |
| Reports | `GET /api/reports/{report}` | `report.read` with scope. |
| Realtime/events | `GET /api/realtime/auth`, internal publisher | Private channel authorization only. |
| Demo reset | `POST /api/demo/reset` | Demo-only secret plus owner/admin check, audited. |

### 7.3 Payment Callback Handling

The Billplz sandbox callback service must:

1. Read raw callback payload.
2. Verify signature using current official provider documentation before implementation.
3. Match provider reference, collection/merchant context, expected order/payment attempt, and exact integer amount.
4. Lock payment attempt and order/reservation rows.
5. Store normalized callback evidence and payload hash without unnecessary PII.
6. Apply `PENDING -> PAID` once.
7. Create kitchen tickets, inventory effects, audit events, and outbox events atomically.
8. Return success for duplicate valid callbacks without duplicate effects.
9. Reject forged redirects and mismatched amount/reference attempts.

## 8. State Boundaries

### 8.1 Order State Machine

```text
DRAFT -> SUBMITTED -> PREPARING -> READY -> SERVED_OR_COLLECTED -> COMPLETED
DRAFT -> CANCELLED
SUBMITTED -> CANCELLED
PREPARING -> CANCELLED      (manager approval; consumption/waste rules apply)
READY -> CANCELLED          (manager approval; consumption/waste or return rules apply)
```

### 8.2 Payment State Machine

```text
UNPAID -> PENDING -> PAID
UNPAID -> PAID
PENDING -> FAILED
PENDING -> EXPIRED
PAID -> REFUND_REQUESTED -> REFUNDED
```

Only verified callbacks or authorised settlement services may move an order/payment to `PAID`.

### 8.3 Table State Machine

```text
AVAILABLE -> OPEN -> BILL_REQUESTED -> SETTLED -> CLOSED -> AVAILABLE
OPEN -> CANCELLED
```

### 8.4 Kitchen Ticket State Machine

```text
NEW -> ACCEPTED -> PREPARING -> READY -> COMPLETED
NEW -> HELD -> ACCEPTED
ACCEPTED -> HELD -> ACCEPTED
NEW -> HELD_UNAVAILABLE
ACCEPTED -> HELD_UNAVAILABLE
```

### 8.5 Inventory Reservation and Consumption Policy

| Event | Inventory effect |
|---|---|
| Draft cart | No durable stock effect unless a short reservation is explicitly created. |
| Submitted table/counter order | Server reserves recipe quantities atomically. |
| Pending hosted checkout | Short reservation with expiry and idempotency key. |
| Payment expired/failed before prep | Release reservation exactly once. |
| Ticket accepted/preparing | Convert reservation to consumption according to policy. |
| Cancel before prep | Release reserved quantities. |
| Cancel after prep | Preserve consumption and log waste/return through ledger. |
| Stock receipt/adjustment | Append ledger row; never edit balance directly. |

Availability is computed as on-hand from ledger minus active reservations, limited by recipe requirements.

### 8.6 Approval State Machine

```text
PENDING -> APPROVED
PENDING -> REJECTED
PENDING -> EXPIRED
PENDING -> CANCELLED
```

Approval decisions require eligible approver, reason where policy requires, no self-approval for restricted actions, immutable audit, and outbox event.

### 8.7 Message Lifecycle and Review Lifecycle

Message lifecycle:

```text
CREATED_PLAIN_TEXT -> EDITED_PLAIN_TEXT
CREATED_PLAIN_TEXT -> SOFT_DELETED
EDITED_PLAIN_TEXT -> SOFT_DELETED
```

Message metadata must preserve create, edit, and soft-delete actors/timestamps. P0 stores plain text only, enforces a 4,000-character limit, blocks user-supplied HTML rendering, avoids link previews/external fetches, rate-limits by user and room, and prevents duplicate sends with an idempotency key or client nonce.

Review lifecycle:

```text
REQUESTED -> PERMISSION_CHECKED -> REASON_RECORDED -> TEMPORARY_GRANT_CREATED -> REVIEW_EVENT_IMMUTABLY_STORED -> GRANT_EXPIRED
REQUESTED -> DENIED
```

Review access is not a membership grant. `communication_review_access_grants` provide short-lived room-scoped access and expire automatically. `communication_review_events` are immutable evidence only and must never grant permanent or future access.

## 9. Realtime Design

### 9.1 Private Channel Naming

```text
flow:org:{orgId}
flow:org:{orgId}:site:{siteId}
flow:org:{orgId}:outlet:{outletId}
flow:org:{orgId}:outlet:{outletId}:station:{stationId}
flow:org:{orgId}:room:{roomId}
flow:org:{orgId}:user:{userId}
flow:public:order:{publicOrderToken}
```

Public channels, if used, must expose only narrow safe order-status refresh hints.

### 9.2 Event Types

| Domain | Events |
|---|---|
| Communication | `room.created`, `room.membership_changed`, `message.created`, `message.updated`, `message.deleted`, `message.read`, `communication.review_grant_created`, `communication.review_grant_expired`, `communication.review_recorded`; P1 adds `message.mention` |
| Orders | `order.created`, `order.confirmed`, `order.payment_paid`, `order.service_status_changed`, `table.changed` |
| Kitchen | `ticket.created`, `ticket.status_changed` |
| Inventory | `inventory.changed`, `inventory.reservation_changed`, `menu.availability_changed` |
| Workflow | `task.created`, `task.updated`, `incident.created`, `incident.updated`, `approval.changed`, `notification.created` |
| Demo/reporting | `report.refresh_hint`, `demo.reset_completed` |

### 9.3 Client Reconciliation Rules

- Realtime payloads contain ids, event type, version/timestamp, and narrow summary only.
- Clients refetch authorised source data through normal APIs.
- Events can be missed or duplicated; clients must tolerate both.
- Optimistic UI is allowed only where client correction is safe and source data is refetched.
- Public clients never subscribe to private org/room/outlet channels.
- Room message lists reconcile by message id and created timestamp, not by trusting event order.

### 9.4 Transactional Outbox

Every critical transaction writes an `outbox_events` row in the same transaction as business changes.

Outbox fields:

- `id`
- `org_id`
- optional `site_id`, `outlet_id`, `room_id`, `user_id`
- `event_type`
- `object_type`
- `object_id`
- `payload_summary`
- `dedupe_key`
- `created_at`
- `published_at`
- `publish_attempts`
- `last_error`

The publisher sends events only after commit. Failed publish attempts are retried without rewriting business state.

## 10. P0, P1, and P2 Scope

### 10.1 P0 Competition Demo Requirements

P0 is complete only when the deployed demo proves:

- Auth, active membership, roles, permissions, tenant isolation, and deactivation behavior.
- Platform Super Admin has no default tenant-content access.
- Flow Connect is narrowed to Organisation Hub, one Team Room, Direct Work Conversations, one work-item thread attached to an order or kitchen ticket, read state, and private realtime refresh.
- Direct Work Conversation creation supports two active employees or an operational group of up to five active employees in the same organisation; customers/guests cannot join; the creator must be a participant; one active room exists per exact participant set; deactivated users lose room access immediately.
- P0 messages are plain text only, up to 4,000 characters, with no user-supplied HTML rendering, safe links only, no link previews/external fetches, per-user/per-room rate limits, duplicate-send prevention, and preserved edit/soft-delete metadata.
- Current communication policy acknowledgement is required before future Direct Work Conversation sending.
- Authorised review uses `communication.audit.review`, reason, a 30-minute room-scoped temporary access grant, immutable review event, and automatic expiry.
- Seeded F&B outlet with tables, menu, recipes, ingredients, lots, kitchen stations, and staff.
- Waiter table order, add-on item, bill request, settlement, table close.
- Counter order, cash or external-terminal settlement, pickup/ticket/dashboard update.
- QR table or online pickup with hosted checkout and verified idempotent callback.
- Kitchen station board with valid ticket transitions and station isolation.
- Recipe-led inventory reservation/consumption/release/waste and availability blocking.
- Manager dashboard, reports, settings, approvals, audit trail, and protected demo reset.
- Golden Playwright flows for public, waiter, cashier, kitchen, inventory, dashboard, audit, and Connect.

### 10.2 P1 After Stable P0

- Announcements, mentions, reactions, attachments, search, stronger unread state.
- Structured handover templates and incident rooms.
- Exports and configurable retention after product/legal review.
- Message-to-task conversion.
- Notification polish and deduplication.
- Forecasts, Rescue Mode, constrained Flow Copilot, evidence summaries.
- English and Bahasa Melayu for principal flows.
- CSV/PDF export, CI/CD, Docker, barcode receiving.

### 10.3 P2 Future Approval

- Additional industry packs.
- Customer/supplier messaging with a separate privacy model.
- Browser push, email, WhatsApp, SMS.
- Native mobile app and full offline sync.
- Direct terminal/acquirer integrations.
- Advanced billing, marketplace, payroll/accounting integrations.
- Advanced jurisdiction-specific compliance workflows.

### 10.4 Scope Protection Rules

- Do not weaken F&B payment, inventory, RLS, public QR, audit, or golden loop to add chat polish.
- Do not add public social features, feeds, followers, stories, likes-first mechanics, or engagement algorithms.
- Do not use Flow Connect as an approval/payment/stock/order shortcut.
- Do not describe future packs as implemented.
- Do not claim E2EE, compliance certification, production payment readiness, or AI autonomy.

## 11. Testing Strategy

### 11.1 Unit Tests

| Area | Required coverage |
|---|---|
| Roles/permissions | Permission resolver, active membership, deactivation, no implicit manager review. |
| Communication | P0 room creation, Direct Work exact participant-set uniqueness, participant count, same-org participants, creator-is-participant rule, customer/guest exclusion, current-policy acknowledgement, send/read guards, plain-text safety, 4,000-character limit, rate limits, duplicate-send prevention, soft delete. |
| Review | Non-empty reason, `communication.audit.review`, 30-minute `communication_review_access_grants`, automatic expiry, immutable review event, platform-admin denial. |
| State machines | Order, payment, table, kitchen ticket, approval, message lifecycle. |
| Money | Integer totals, tax/service, discounts, no floating-point calculations. |
| Inventory | Reservation, FEFO consumption, release, waste, availability. |
| Payments | Signature verification fixtures, amount/reference matching, duplicate callback handling. |
| AI boundary | P1 fact serializer excludes secrets, raw messages, cross-tenant data. |

### 11.2 Integration Tests

| Test | Expected result |
|---|---|
| Organisation A reads Organisation B rooms/messages/orders | Denied by RLS and API. |
| Deactivated employee sends or reads new messages | Denied. |
| Direct Work Conversation is created with guest, cross-org user, more than five participants, or creator not in participant set | Denied. |
| Duplicate Direct Work Conversation for same exact active participant set | Existing active room is returned or conflict-safe behavior occurs; no duplicate active room is created. |
| Direct Work send without current policy acknowledgement | Denied until acknowledgement is recorded. |
| Manager without review permission opens Direct Work Conversation | Denied. |
| Organisation Admin reviews with reason | Review succeeds, creates one temporary room-scoped grant and one immutable review event. |
| Temporary review grant expires | Non-member reviewer loses access automatically after expiry. |
| Review without reason | Denied. |
| Platform Super Admin reads tenant content without support grant | Denied. |
| Work-item thread access by unrelated employee | Denied. |
| Kitchen staff accesses payment/report/admin endpoint | Denied. |
| Forged payment redirect marks order paid | Denied. |
| Valid duplicate callback | No duplicate tickets, stock effects, audit, or outbox. |
| Concurrent final-stock checkouts | Only one succeeds; other receives safe out-of-stock response. |
| Public QR token for another table/order | Denied or safe not found response. |
| Demo reset | Restores expected seed counts and room topology. |

### 11.3 RLS and Tenant Tests

RLS tests must run directly against database roles and should include:

- Anonymous public role can read only token-scoped safe public projections.
- Authenticated user without membership cannot read tenant tables.
- Active member can read only own org and assigned site/outlet/team data.
- Room member can read room messages.
- Non-member cannot read room messages unless an authorised review command has created a valid unexpired room-scoped review access grant and immutable review event.
- Platform admin cannot read tenant tables unless support grant is valid, scoped, and unexpired.

### 11.4 Payment and Idempotency Tests

- Valid Billplz fixture verifies signature and exact amount/reference.
- Invalid signature rejected.
- Mismatched amount rejected.
- Mismatched provider reference rejected.
- Duplicate valid callback returns success but creates no duplicate effects.
- Browser redirect updates only customer UX state, not payment truth.
- Payment expiry releases reservation once.

### 11.5 Chat Permission and Review Audit Tests

- Direct Work Conversation creation requires active employees.
- Direct Work Conversation creation enforces two to five same-org active employee participants, creator participation, customer/guest exclusion, exact participant-set uniqueness, and immediate deactivation loss of access.
- Participants see and acknowledge the current company-managed policy before first Direct Work Conversation send; new policy versions require new acknowledgement.
- Owner/Admin with `communication.audit.review` can review only after reason and only through a temporary room-scoped access grant.
- Review event is append-only, linked to the temporary grant, visible in audit/reporting, and never grants future access.
- Message soft-delete hides display but preserves audit/moderation evidence.
- P0 message safety enforces plain text, 4,000-character limit, no user-supplied HTML, safe links without previews/external fetches, per-user/per-room rate limits, and duplicate-send prevention.
- Attachments are excluded from P0; P1 attachment access must not be guessable across rooms or tenants.

### 11.6 Playwright Golden Flows

1. Owner/Admin signs in, views Organisation Hub, creates staff/team.
2. Two active employees exchange Direct Work Conversation messages and see the notice.
3. Organisation Admin reviews the Direct Work Conversation with reason; a temporary grant is created, audit shows review event, and access expires.
4. Waiter opens table, submits order, kitchen sees ticket, ticket thread opens, cashier settles, table resets.
5. Cashier completes counter sale; receipt/pickup/ticket/dashboard update.
6. Guest uses mobile QR menu and hosted checkout; callback fixture confirms exactly one order.
7. Public user cannot access `/app/connect`, room content, staff identity, attachments, or another order.
8. Kitchen staff uses station tickets and thread but cannot view financial/admin rooms.
9. Inventory exhaustion blocks public/staff menu item and dashboard updates after refetch.
10. Protected demo reset restores seeded tenant and default rooms.

### 11.7 Seed and Reset Plan

Demo seed: BrewBite Kitchen.

Required seed content:

- One organisation and one F&B outlet/site.
- 12 tables with QR tokens.
- Stations: Drinks, Grill, Pastry.
- 10 to 15 menu items with modifiers.
- Versioned recipes and 12 to 18 ingredients/lots, including low-stock and near-expiry cases.
- 6 to 8 staff across Owner/Admin/Manager/Cashier/Waiter/Kitchen/Storekeeper.
- Default P0 rooms: Organisation Hub and one Team Room.
- One active order or kitchen ticket thread for Flow Connect proof.
- One active shift, one approval, one near-stockout, and one delayed ticket scenario. Incident rooms, shift handover rooms, and message-to-task conversion are P1.
- 45 days of internally consistent historical report data if time permits.

Reset requirements:

- Demo-only and environment-restricted.
- Requires protected secret plus authorised owner/admin context.
- Clears and reseeds only the demo tenant.
- Writes audit event and outbox refresh event.
- Verifies expected counts and default topology after reset.

## 12. Milestone Plan

| Milestone | Scope | Dependencies | Acceptance gate | Owner decisions before implementation |
|---:|---|---|---|---|
| 0 | Planning approval, repo guardrails, final API/migration conventions, environment validation plan. | This document approved. | Product owner approves implementation scope and confirms no app scaffold before approval. | Confirm demo scope, Billplz sandbox choice, language priority, and attachments excluded from P0. |
| 1 | Bootstrap after approval, strict TypeScript app shell, Supabase client/server boundary, test harness, no domain features yet. | Milestone 0 approval. | Lint/typecheck/test/build commands exist and pass baseline. | Confirm deployment target and local Supabase strategy. |
| 2 | Identity, tenancy, roles, permissions, RLS base, support elevation model. | Milestone 1. | Tenant/role/platform-admin isolation tests pass. | Confirm default role permissions and support-elevation approval workflow. |
| 3 | Flow Connect P0 foundation: Organisation Hub, one Team Room, Direct Work creation, policy acknowledgement, plain-text messages, read state, temporary review grants, immutable review events, private realtime. | Milestone 2. | Cross-tenant chat tests, Direct Work creation tests, policy acknowledgement tests, temporary review-grant expiry tests, and deactivation tests pass. | Approve exact notice wording, P0 retention default, and 30-minute review expiry. |
| 4 | F&B configuration: outlet/site mapping, tables/QR, menu, recipes, ingredients, lots, kitchen stations. | Milestone 2. | Public/staff menu availability agrees with inventory fixtures. | Approve BrewBite seed menu and demo outlet setup. |
| 5 | Unified orders and kitchen: table/counter orders, tickets, station board, order/ticket threads, audit/outbox. | Milestones 3 and 4. | Two channels create correct tickets and linked threads with no duplicate state. | Confirm table service and counter service policies. |
| 6 | Payments and settlement: cash/terminal settlement, hosted checkout adapter, verified callbacks, idempotency. | Milestone 5. | Valid callback creates one confirmed order; forged/duplicate callback tests pass. | Confirm payment provider credentials/process and demo callback strategy. |
| 7 | Inventory controls and dashboard: reserve/consume/release/waste, availability, live dashboard/report refresh. | Milestones 5 and 6. | Sale changes stock/dashboard once; exhausted item blocked; reports match source data. | Confirm inventory consumption timing and waste policy. |
| 8 | Staff operations: approvals, tasks, settings, audit views, protected reset. | Milestones 3, 5, 7. | Restricted action requires authorised decision; reset restores dataset. | Confirm approval thresholds and audit report visibility. |
| 9 | P0 hardening: responsive flows, error/empty/denied states, Playwright golden paths, deployment rehearsal. | Milestones 1-8. | Fresh-device demo succeeds three consecutive times. | Approve P0 release candidate. |
| 10 | P1 features: announcements, mentions, reactions, attachments/search, structured handover/incident rooms, exports/configurable retention, message-to-task conversion, notifications polish, i18n, AI/forecast/Rescue Mode, CI/CD/Docker/PDF/barcode as approved. | Stable P0. | Each P1 feature has explicit security, test, and recovery gates. | Approve each P1 feature before scope expansion. |

### Milestone Recovery Risk

| Risk level | Examples | Recovery approach |
|---|---|---|
| Low | UI-only loading/empty states after app approval. | Revert component changes. |
| Medium | New API route or report query. | Feature flag route, preserve data, revert code. |
| High | RLS, migrations, payment, inventory, audit, communication review. | Forward-only corrective migration, disable feature flag where possible, preserve immutable evidence. |

## 13. Risks and Controls

| Risk | Impact | Control |
|---|---|---|
| Scope creep | P0 golden loop slips or product becomes generic/social. | P0 gate prioritises F&B payment/inventory/RLS/audit over P1 polish. Future packs remain roadmap only. |
| Payment provider integration | Callback verification or sandbox setup delays demo. | Adapter boundary, official docs verification before coding, callback fixtures, manual settlement fallback for non-hosted flows. |
| RLS complexity | Cross-tenant or cross-room leaks. | Deny-by-default policies, direct RLS tests, server authz duplication, narrow public projections. |
| Realtime reliability | Missed/duplicated events or stale UI. | Outbox design, refetch-on-event, idempotent clients, database as truth. |
| Chat privacy/compliance | Misleading DM privacy or unaudited admin access. | Direct Work wording, acknowledgement, review reason, 30-minute room-scoped temporary review grants, immutable review events, no E2EE claim, legal review before advanced retention. |
| Platform admin overreach | Tenant trust violation. | No default RLS access, explicit support grants, expiry, scope, and audit. |
| Inventory correctness | Oversell or incorrect stock reporting. | Transactional reservations, FEFO consumption, append-only ledger, concurrency tests. |
| Demo reliability | Seed drift, payment sandbox failures, public route leakage. | Protected reset, deterministic fixtures, Playwright golden flows, demo rehearsal on fresh device. |
| Deployment/environment | Missing secrets, wrong environment, raw errors. | Startup env validation, fail-closed payment config, safe errors, separate demo credentials. |
| AI overreach | Perceived surveillance or autonomous actions. | P0 no room-message AI; P1 authorised summaries only; AI cannot mutate business state. |

## 14. Owner Approval Checklist

Implementation should not begin until the owner confirms:

- [ ] This plan correctly reflects Flow Core, Flow Connect, and Food & Beverage as the P0 competition proof.
- [ ] P0 requirements are accepted, especially the F&B golden loop.
- [ ] P1 and P2 boundaries are accepted.
- [ ] Direct Work Conversation notice wording is approved or revised.
- [ ] Owner/Admin review with reason, 30-minute temporary room-scoped access grant, automatic expiry, and immutable audit is approved.
- [ ] Platform Super Admin no-default-tenant-access rule is approved.
- [ ] Default retention/deletion policy is approved for P0.
- [ ] Attachment handling is excluded from P0 and moved to P1.
- [ ] Billplz sandbox remains the P0 hosted payment provider.
- [ ] Demo seed tenant, reset strategy, and golden Playwright flows are approved.

After approval, Milestone 1 may begin with a scoped implementation proposal and no scope expansion beyond this plan.
