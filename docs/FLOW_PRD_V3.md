# FLOW - Product Requirements Document v3

> Status: V3 product requirements
> Date: 3 July 2026
> Precedence: This document is second only to `docs/FLOW_DECISION_LOCK_V3.md`.
> Implementation baseline: the current production demo is a real transitional Flow for Food & Beverage vertical slice, not the final V3 architecture.

## 1. Executive Summary

Flow is a full operational command system for a business. It gives each authorised user a role-appropriate view of operations, controls approved actions through permissions and evidence, connects existing systems, coordinates teams, preserves trustworthy records, and analyses what should happen next.

Food & Beverage is the first implemented industry pack. The current demo proves an end-to-end BrewBite Kitchen path with protected staff workspace, waiter ordering, kitchen board, inventory-backed order flow, owner dashboard, Flow Connect foundation, public QR ordering, public order tracking, and Vercel deployment. V3 turns that competition slice into a complete commercial architecture.

## 2. Product Vision

Flow should become the operating layer between people, business systems, and evidence:

```text
Business systems and public channels
-> Flow controlled commands
-> role-aware workspace
-> audit and records
-> deterministic analysis
-> recommended next action
```

Flow must not pretend to replace every POS, bank, gateway, terminal, accounting system, delivery platform, payroll provider, or hardware system immediately. It should connect to them through controlled connectors and keep Flow's own records trustworthy.

## 3. Target Users

| User | Needs |
| --- | --- |
| Organisation Owner | Command centre, financial visibility, ownership controls, high-risk approvals, records, trusted analysis. |
| Organisation Admin | Operational administration for people, menu, outlets, records, and reports within delegated authority. |
| Manager | Live outlet/team control, exceptions, staffing coverage, fulfilment, approvals, stock risk, records. |
| Cashier | Counter orders, verified manual or provider settlement, collection handoff, payment queue. |
| Waiter | Table orders, table state, serve dine-in orders, customer-safe public flow support. |
| Kitchen | Station queue, prep workflow from `NEW` to `READY`, issue flagging. |
| Storekeeper | Stock receiving, lots, waste, inventory adjustments, supplier/purchase records. |
| Payroll-authorised user | Future compensation/payroll records with strict scope. |
| Customer/Guest | Safe public menu, table confirmation, order submission, order tracking, no staff workspace. |
| Platform Super Admin | Platform operations and support elevation, no default tenant content. |

## 4. Role And Permission Model

Roles are not sufficient by themselves. Permissions must be explicit, scoped, and audited for high-risk actions.

| Capability | Owner | Org Admin | Manager | Cashier | Waiter | Kitchen | Storekeeper |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Manage organisation ownership | Yes | No | No | No | No | No | No |
| Create/remove admins | Yes | No by default | No | No | No | No | No |
| Manage employees | Yes | Yes, scoped | Scoped | No | No | No | No |
| View financial records | Yes | Scoped | Scoped | Own/shift scope | No by default | No | No |
| Confirm external/manual settlement | Yes | Yes, if granted | Yes, if granted | Yes | No by default | No | No |
| Release held order | Yes | Yes, if granted | Yes, if granted | Yes, if granted | No by default | No | No |
| Progress kitchen ticket | Yes override | Yes override | Yes override | No | No | Station scope |
| Mark served/collected | Yes | Yes | Yes | Collected | Served | No | No |
| Manage menu prices | Yes | Yes, scoped | No by default | No | No | No | No |
| Pause item availability | Yes | Yes | Outlet scope | No | No | Flag only | Stock-driven |
| View private conversations by review | Permission plus reason and temporary grant | Permission plus reason and temporary grant | No by default | No | No | No | No |
| Payroll data | Yes by default | No by default | No by default | No | No | No | No |

## 5. Complete Module Map

| Module | V3 requirement | Current implementation status |
| --- | --- | --- |
| Auth and identity | Account identity, profiles, memberships, active status, invitations. | Implemented foundation. |
| Organisation profile | Legal/business profile, settings, ownership. | Partial. |
| Outlets/zones/tables/stations | Operating hours, zones, table identifiers, stations, assignments. | Partial demo foundation. |
| Table service | Staff table ordering, fulfilment, table state. | Partial. |
| Counter/POS | Counter orders, pickup/collection, external settlement. | Planned. |
| Public ordering | One outlet QR default with table confirmation and secure context. | Transitional table-token QR exists. |
| Menu | Dynamic products, categories, prices, images, modifiers, availability, station routing. | Seeded demo only. |
| Payments/settlements | Provider/POS events, manual verified fallback, reconciliation, release policy. | Manual demo settlement only. |
| Kitchen | Station board and prep state through READY. | Partial; current demo can complete kitchen tickets. |
| Fulfilment | Served/collected owned by front-of-house. | Planned separation. |
| Inventory | Recipes, lots, ledger, reservations, consumption, waste, adjustments. | Partial. |
| Suppliers/purchases/expenses | Supplier records, purchase orders, expenses. | Planned. |
| Employee/employment | Profiles, roles, outlets, stations, lifecycle, protected data. | Partial identity/membership. |
| Payroll foundation | Rates, effective dates, periods, labour cost inputs. | Planned. |
| Flow Connect | Hubs, rooms, work threads, Direct Work Conversations, review policy. | Foundation exists; UI partial. |
| Records/logs/audit | Record centre with scoped evidence views. | Audit exists; views planned. |
| Analysis | Deterministic insights with evidence and recommendations. | Planned. |
| Reports | Sales, kitchen, inventory, labour, profit estimates, operations. | Planned. |
| Approvals | Controlled approval workflows. | Planned. |
| Notifications | Operational notifications and acknowledgements. | Planned. |
| Connectors | POS, payment, accounting, delivery, supplier, hardware. | Planned only. |
| Settings | Release policy, roles, menu, thresholds, connectors, privacy. | Partial. |
| Demo reset/environment separation | Safe demo data reset and local/preview/prod separation. | Planned hardening. |

## 6. Workflow Narratives

### 6.1 V3 QR Pay-At-Counter Table Service

```text
Customer scans outlet QR
-> public outlet menu opens
-> customer selects or enters a public table label or short code
-> customer sees "You are ordering for Table 7. Confirm / change table"
-> Flow mints a short-lived opaque ordering context scoped to that outlet and confirmed table
-> customer submits cart
-> order is received but not paid
-> release policy decides whether kitchen can start
-> for BrewBite recommended demo: customer sees "Order received - please pay at counter"
-> cashier confirms verified external/manual settlement
-> kitchen release occurs
-> kitchen moves NEW -> ACCEPTED -> PREPARING -> READY
-> waiter serves dine-in or cashier/waiter marks takeaway collected
-> records and analysis update
```

Today: the deployed demo uses table-specific opaque QR tokens and may release tickets earlier. That remains transitional.

### 6.2 Staff Table Order

```text
Waiter selects table
-> browses approved menu
-> cart uses server-calculated prices and availability
-> order is submitted
-> release policy is evaluated
-> kitchen tickets are created/released as allowed
-> inventory reservation is recorded
-> kitchen progresses to READY
-> waiter marks served
-> cashier/provider/manual settlement updates payment state
-> final closure happens through controlled rules
```

### 6.3 Counter/POS Order

```text
Cashier creates counter order
-> payment is verified by provider/POS or manual external settlement
-> release policy permits kitchen
-> kitchen prepares to READY
-> cashier marks collected
-> order closes through controlled rules
```

### 6.4 Dynamic Menu Change

```text
Owner/Admin edits product/category/price/modifier
-> change is validated
-> old version is archived
-> new version becomes effective by outlet/channel
-> audit records before/after evidence
-> future orders snapshot title/price/tax/modifier/recipe/station version
```

Kitchen may flag an item issue. It cannot publish permanent menu or price changes.

### 6.5 Employee Onboarding

```text
Owner/Admin creates employee profile/invitation
-> assigns role/outlet/station
-> user activates account
-> membership becomes active
-> lifecycle audit is written
-> notifications/preferences are configured
```

Owner-only: create/remove admins, transfer ownership, broad payroll/integration authority.

### 6.6 Communication Around Work

```text
Work item event occurs
-> Flow creates or updates linked work-item thread
-> authorised staff discuss context
-> if action is needed, user must use the formal command/action
-> message and command evidence remain separate
```

Example: a message saying "Table 7 paid" does not mark payment paid. Only an authorised settlement command or verified provider/POS event can do that.

## 7. State-Machine Semantics

### 7.1 Payment State

Owned by provider/POS event or authorised cashier/manual external-settlement confirmation.

| State | Meaning |
| --- | --- |
| `UNPAID` | No verified settlement. |
| `PAYMENT_PENDING` | Provider/POS flow started but not verified. |
| `PAID` | Verified settlement exists. |
| `FAILED` | Provider/POS payment attempt failed. |
| `PARTIALLY_REFUNDED` | Approved partial refund evidence exists. |
| `REFUNDED` | Approved full refund evidence exists. |
| `VOIDED` | A payment authorisation or unsettled settlement attempt was voided before capture/final settlement. It is not a refund and not cancellation of an already-paid order. |
| `CANCELLED` | Payment obligation cancelled according to order policy. |

Browser redirects, customer screenshots, customer claims, and chat messages never prove payment. Refund, cancellation, and void actions must remain separately evidenced and audited.

### 7.2 Kitchen State

Kitchen owns only:

```text
NEW -> ACCEPTED -> PREPARING -> READY
```

Kitchen stops at `READY`. It does not mark served, collected, paid, refunded, or complete.

### 7.3 Fulfilment State

Front-of-house owns fulfilment.

| State | Owner |
| --- | --- |
| `NOT_RELEASED` | System/release policy. |
| `RELEASED` | System or authorised staff according to outlet/channel release policy. |
| `READY_FOR_HANDOFF` | Derived/system-controlled fulfilment readiness created only when all required kitchen work is `READY`; this is not a kitchen fulfilment action. |
| `SERVED` | Dine-in only; waiter-owned by default; auditable. |
| `COLLECTED` | Takeaway/pickup only; cashier or waiter owned according to outlet policy; auditable. |
| `CANCELLED` | Authorised exception workflow. |

Canonical fulfilment progression:

```text
NOT_RELEASED -> RELEASED -> READY_FOR_HANDOFF -> SERVED
```

for dine-in, or:

```text
NOT_RELEASED -> RELEASED -> READY_FOR_HANDOFF -> COLLECTED
```

for takeaway/pickup.

Public tracking must never display `SERVED` or `COLLECTED` until the exact canonical fulfilment event exists. If a current or legacy record cannot distinguish served versus collected, public language must use neutral "Order complete" language and must not expose payment or settlement internals.

Order closure is separate from fulfilment and may occur only through controlled rules after fulfilment, cancellation, or authorised exception handling.

### 7.4 Release Policy

Outlet/channel configurable:

- `RELEASE_ON_SUBMIT`;
- `RELEASE_ON_VERIFIED_PAYMENT`;
- `RELEASE_BY_AUTHORISED_STAFF`.

Release policy is separate from payment state and kitchen state.

### 7.5 Hold and Cancellation

Hold:

- prevents release or further action;
- records reason, actor, scope, and timestamp;
- does not erase existing payment, kitchen, inventory, or audit evidence.

Cancellation:

- requires authorised action;
- records reason and impact;
- handles reservation release, consumption/waste, refund/void implications, and customer-safe status.

## 8. Public And Private Data Boundaries

Public pages may show:

- outlet display name;
- safe table label or confirmed table text;
- safe menu fields;
- safe displayed prices;
- item availability indicator;
- safe public order status;
- pay-at-counter/payment instruction copy.

Public pages must never show:

- raw UUIDs;
- organisation, outlet, table, order, ticket, room, message, audit, or outbox IDs;
- staff names or employment data;
- inventory balances, recipes, lots, stock ledgers;
- payment internals, settlement records, provider payloads;
- private messages;
- another customer's order.

Private staff routes must enforce tenant, outlet, team, station, role, and permission boundaries on the server. UI hiding is not access control.

One-outlet QR context rules:

- Customers select or enter a public table label or short code, never a raw table ID.
- The server validates that the table is active, belongs to the outlet represented by the outlet QR, and permits the selected public ordering channel.
- After table confirmation, Flow mints a short-lived opaque ordering context.
- The ordering context is scoped to one outlet and one confirmed table only.
- The ordering context cannot reveal internal IDs, customer data, staff data, inventory, messages, logs, payment internals, or another table/order.
- Ordering contexts require expiry, rate limiting, replay prevention, and abuse controls.
- Existing `/t/[tableToken]` remains compatible during transition as an optional table-bound mode.

## 9. Owner Command Centre

The Owner command centre has three layers.

### Live Operations

- orders;
- payment queue;
- kitchen backlog;
- ready-but-unserved;
- stock/inventory risk;
- table/floor state;
- active coverage/station workload.

### Records And Accountability

- orders;
- settlements/payment confirmation;
- kitchen transitions;
- inventory ledger;
- menu changes;
- employee lifecycle/activity;
- approvals;
- integration events;
- audit trail.

### Controls

- team;
- role/outlet/station assignment;
- menu;
- inventory thresholds;
- integration state;
- release policy;
- reports;
- approval decisions.

## 10. Employee Profiles, Employment, And Payroll Foundation

Every human user needs identity, profile, and employment/membership records.

Profile fields should be minimised: name, work email, work phone where enabled, optional image, staff ID, outlets, station assignment, status, start date, notification preferences, and optional emergency contact only when enabled.

Protected employment data includes compensation, payroll references, documents, contracts, sensitive identifiers, and effective-dated changes.

Payroll foundation includes:

- monthly/hourly/daily/shift rate models;
- effective-dated rate changes;
- payroll periods;
- allowances/adjustments later;
- access restrictions;
- future employee self-service.

Do not market this as a full statutory payroll engine until separately approved.

## 11. Menu Management

Menu management must support:

- categories;
- products;
- descriptions;
- prices;
- images;
- modifiers;
- combos/promotions later;
- outlet availability;
- temporary sold-out state with reason;
- recipe links;
- station routing;
- tax/service rules;
- archive instead of destructive delete;
- audit history;
- historical snapshots in orders.

Menu changes are controlled by Owner/Admin or scoped outlet manager authority. Kitchen can flag preparation/item issues only.

## 12. Payment, POS, And Connector Architecture

Flow connects to systems cafes already use.

Connector categories:

- POS connector;
- payment gateway connector;
- card-terminal/POS settlement connector;
- accounting connector;
- delivery platform connector later;
- supplier connector later;
- printer/KDS/hardware connector later.

Payments require:

- per organisation/outlet credentials in a Flow secrets vault;
- signed webhooks or official provider/POS events when available;
- exact amount/reference checks;
- idempotency;
- reconciliation;
- audit/outbox evidence;
- manual verified external settlement fallback;
- no raw card data.

Current status: no real payment gateway is implemented. `DEMO_MANUAL_SETTLEMENT` is a demo-only settlement action.

## 13. Communications

Flow Connect modules:

- Organisation Hub;
- Team Rooms;
- outlet/station rooms;
- Direct Work Conversations;
- work-item threads;
- operational notifications;
- future acknowledgement requirements.

Communication privacy:

- Direct Work Conversations are company-managed, not end-to-end private personal chat.
- Review requires permission, reason, room-scoped temporary grant, and immutable event.
- Platform support access requires explicit support elevation.
- Owner/Admin do not receive silent permanent access to private rooms.

## 14. Logs And Record Centre

Required logs:

| Log | Examples |
| --- | --- |
| Audit log | Sensitive actions, permission changes, review events. |
| Order lifecycle log | Created, released, held, cancelled, fulfilled. |
| Payment/settlement log | Provider events, manual confirmations, refunds/voids. |
| Kitchen log | Ticket acceptance, preparation, ready. |
| Inventory/waste/adjustment log | Receipts, reservations, consumption, waste. |
| Menu-change log | Price/menu/version changes. |
| Employee activity/employment log | Invitations, role changes, status changes. |
| Payroll-change log | Rate and period changes. |
| Integration/webhook/sync log | Connector events and reconciliation. |
| System/diagnostic log | Operational health without secrets. |

Logs include actor, action, object, scope, timestamp, reason, before/after evidence, and correlation/idempotency reference where relevant.

## 15. Analysis Requirements

Flow Analysis must be deterministic first.

Required initial insights:

| Insight | Evidence |
| --- | --- |
| Kitchen bottleneck | ticket age, station queue, prep times. |
| Ticket aging | oldest open/ready ticket and thresholds. |
| Ready-but-unserved | READY kitchen records without fulfilment. |
| Payment queue | unpaid/unverified orders by outlet/channel. |
| Stock risk | available quantity, reservations, demand pattern. |
| Item availability risk | recipes, lots, sold-out flags, open demand. |
| Top/slow menu items | sales/order line counts over a time range. |
| Comparable demand pattern | same weekday/hour/channel comparison with sufficiency flags. |
| Coverage versus workload | station assignments, open work, shift data when present. |
| Waste trend | waste ledger by ingredient/time range. |
| Profit insight | only if required cost inputs exist. |

Every insight must include outlet scope, time range, evidence, data freshness, confidence or insufficient-data state, and recommended action.

AI can later explain trusted insights but cannot invent facts or mutate money, stock, menu, permissions, payroll, or records.

## 16. Reporting

Reports are planned V3 capability, not fully implemented today.

Required report families:

- sales revenue by outlet/channel/time range;
- payment/settlement reconciliation;
- kitchen throughput;
- fulfilment lag;
- inventory usage/waste;
- menu performance;
- labour and coverage;
- gross/operating/net profit estimates with sufficiency labels;
- audit and record exports with privacy controls.

## 17. Non-Functional And Security Requirements

- strict TypeScript and Zod boundaries;
- server-side domain services or controlled RPCs for critical writes;
- Supabase RLS plus server-side authorisation;
- opaque public tokens and safe projections;
- no browser secrets;
- no raw card data;
- no broad public grants;
- role/outlet/station/team scoping;
- immutable/append-only evidence for sensitive actions;
- forward-only migrations;
- local/preview/production separation;
- backup, observability, and retention before commercial production;
- accessible responsive UI;
- no fabricated claims.

## 18. Current Versus Target Status

| Capability | Today | V3 target |
| --- | --- | --- |
| Production demo | Implemented | Preserved as demo baseline. |
| Public QR | Table-token transitional implementation | One outlet QR default with secure table confirmation. |
| Public tracking | Interim truthful status fix | Full payment/release/kitchen/fulfilment lifecycle. |
| Payment | Manual demo settlement | Provider/POS/manual verified settlement architecture. |
| Kitchen | Board and transitions, currently can complete tickets | Kitchen stops at READY. |
| Fulfilment | Not fully separated | Waiter/cashier owns served/collected. |
| Menu | Seeded demo records | Dynamic menu management. |
| Payroll | Not implemented | Payroll/labour-cost foundation. |
| Analysis | Not implemented | Deterministic evidence-backed insights. |
| Connectors | Not implemented | Provider-neutral connector framework after approval. |

## 19. Competition Demo Story And Boundaries

Competition-safe story:

```text
Flow for Food & Beverage shows a working operational command loop:
public or staff order
-> server-side order truth
-> kitchen ticket
-> inventory reservation/consumption
-> owner dashboard
-> internal work communication
-> safe public tracking
```

Truthful boundaries:

- QR ordering is pay-at-counter.
- No real payment gateway is implemented.
- `DEMO_MANUAL_SETTLEMENT` is not a payment integration.
- Public table-token QR is transitional.
- Public tracking is safe and truthful but not the full V3 lifecycle.
- Future POS/payment/payroll/AI/reporting claims must be described as planned.

## 20. Commercial Production Boundaries

Before commercial production, Flow needs:

- V3 lifecycle kernel;
- connector secrets vault;
- real sandbox integration only after approval;
- backup and recovery plan;
- observability and incident response;
- retention/privacy policy;
- production-grade demo reset separation;
- security review of RLS, RPCs, grants, and public routes;
- data migration plan for existing demo records;
- clear customer terms for payroll, payment, customer data, communications, and AI features.
