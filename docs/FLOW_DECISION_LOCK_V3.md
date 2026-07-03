# FLOW - Decision Lock v3

> Status: V3 product and architecture lock
> Date: 3 July 2026
> Purpose: Supersede V2 where conflicts exist and define the target Flow product model beyond the competition demo.
> Current implementation baseline: `main` contains the working Flow for Food & Beverage competition demo. Supabase migrations 001-009 are applied remotely. The deployed production URL is `https://flow-ops-rho.vercel.app`.

## 1. Supersession And Precedence

V3 is the authoritative product and architecture lock for future work.

Document precedence:

| Rank | Document |
| --- | --- |
| 1 | `docs/FLOW_DECISION_LOCK_V3.md` |
| 2 | `docs/FLOW_PRD_V3.md` |
| 3 | `docs/FLOW_V3_IMPLEMENTATION_ROADMAP.md` |
| 4 | `docs/FLOW_V3_TRANSITION_AND_GAP_REPORT.md` |
| 5 | Historical decision locks, older PRDs, milestone reports, and `docs/FLOW_MASTER_CONVERSATION_SOURCE_OF_TRUTH.md` |
| 6 | `AGENTS.md`, `CLAUDE.md`, `README.md` for repository operating rules |

If an older document conflicts with V3, V3 wins. Historical documents remain useful for implementation history and constraints, but they do not override V3 decisions.

## 2. Product Definition

### V3 Product Statement

Flow is:

> A full operational command system for a business. It shows authorised users the operation relevant to their role, controls approved operational actions through permissions and evidence, connects existing business systems, coordinates teams, preserves trustworthy records, and analyses what should happen next.

Flow is not:

- a generic social chat app;
- only a restaurant ordering website;
- a replacement for every POS, bank, gateway, terminal, accounting system, or delivery platform on day one;
- a generic AI chatbot;
- an employee-surveillance product;
- a system that lets every user see everything.

Food & Beverage is the first fully implemented industry pack. Flow Core must remain extensible beyond F&B later, without claiming other packs are implemented.

## 3. Decision IDs

| ID | Decision |
| --- | --- |
| V3-D001 | Flow is an operational command system, not a social app, narrow restaurant website, or generic AI chatbot. |
| V3-D002 | Food & Beverage remains the first implemented industry pack; future packs are planned only. |
| V3-D003 | Payment state, kitchen state, and fulfilment state are separate systems with separate owners. |
| V3-D004 | Outlet/channel release policy is configurable: `RELEASE_ON_SUBMIT`, `RELEASE_ON_VERIFIED_PAYMENT`, or `RELEASE_BY_AUTHORISED_STAFF`. |
| V3-D005 | V3 default public ordering is one QR per outlet plus customer table confirmation. Table-token QR remains transitional or optional. |
| V3-D006 | Public routes use opaque context and safe projections only. Raw internal IDs and private records are never public. |
| V3-D007 | Menu management is dynamic, audited, outlet-aware, and preserves historical order snapshots. |
| V3-D008 | Organisation Owner and Organisation Admin are distinct roles with different high-risk authority. |
| V3-D009 | Every human account has identity, profile, and employment or organisation membership records. |
| V3-D010 | Payroll/labour cost is a foundation, not a statutory payroll engine unless separately approved. |
| V3-D011 | Revenue is not profit. Profit labels require explicit cost inputs and truthful sufficiency checks. |
| V3-D012 | Owner dashboard evolves into a command centre: live operations, records/accountability, and controls. |
| V3-D013 | Flow Connect is operational communication; messages cannot mutate business state. |
| V3-D014 | Private-message review is reasoned, room-scoped, temporary, auditable, and never silent permanent access. |
| V3-D015 | Flow Analysis starts deterministic, evidence-backed, explainable, and scoped. AI may explain but not invent or directly mutate facts. |
| V3-D016 | Existing POS/payment/accounting/delivery systems are connected through provider-neutral connectors and audited reconciliation. |
| V3-D017 | Secrets are per organisation/outlet in a secure secrets vault, not shared merchant credentials in Vercel environment variables. |
| V3-D018 | Forward-only migrations are mandatory. Applied production-style migrations are not rewritten. |

## 4. Non-Negotiable Rules

| Area | Rule |
| --- | --- |
| Tenant isolation | Every tenant-owned business or communication table has `org_id`, RLS, and server-side authorisation. |
| Platform staff | Platform Super Admin has no default tenant-content or chat access. Support elevation requires explicit scope, approval, expiry, and audit. |
| Public data | Public routes expose only narrow safe projections through opaque, expiring tokens or secure ordering contexts. |
| Business truth | Critical writes use server-side services or controlled RPCs; client state is never authoritative. |
| Money | Money uses integer smallest units. Browser redirects and customer claims never prove payment. |
| Inventory | Inventory truth is append-only ledger evidence. UI never directly edits balances. |
| Evidence | Sensitive actions create immutable or append-only audit/outbox evidence. |
| Communication | Messages can coordinate work but cannot mark payment paid, change stock, progress kitchen, grant permissions, or approve records. |
| Analysis | Insights must show scope, time range, evidence, freshness, confidence or insufficient-data state, and recommended action. |
| AI | AI cannot directly alter money, stock, menu prices, permissions, payroll, or historical records. |
| Privacy | No employee surveillance, no raw card data, no broad private-message access, no unnecessary personal data collection. |
| Migrations | Use forward corrective migrations. Do not rewrite migrations already applied remotely. |

## 5. Role Matrix

| Role | Default V3 authority | Explicit exclusions |
| --- | --- | --- |
| Platform Super Admin | Platform operations, platform diagnostics, support workflow oversight. | No default tenant records, business data, chat, payroll, or customer data access. |
| Organisation Owner | Ultimate organisation authority, admins, ownership transfer, billing-level authority, high-risk integrations/secrets, organisation records, financial visibility, payroll authority by default. | Must still respect private-message review rules and audit requirements. |
| Organisation Admin | Delegated operational administration: employees, outlets, menu, records, reports within scope. | No ownership transfer, billing authority by default, payroll access by default, high-risk secrets by default, or automatic private-message access. |
| Manager | Outlet/team operations, shift oversight, release/fulfilment controls where granted, menu availability within outlet scope. | No organisation-wide ownership, payroll, billing, high-risk secrets, or global chat review by default. |
| Cashier | Counter orders, verified external/manual settlement confirmation, collection handoff, assigned records. | Cannot change kitchen state, menu prices, inventory ledger directly, or access private messages by default. |
| Waiter | Table service, order entry, serve dine-in orders, assigned floor/table context. | Cannot mark payment paid unless separately granted; cannot publish menu or access payroll. |
| Kitchen | Station tickets from `NEW` to `READY`, prep issue/unavailable flag proposals. | Cannot decide payment, mark served/collected, change prices, or publish permanent menu changes. |
| Storekeeper | Receiving, stock counts, lots, waste/adjustment proposals or approved entries as configured. | Cannot change sales/payment/kitchen state by default. |
| Payroll-authorised role | Future scoped compensation/payroll access. | Not automatic for Organisation Admin or Manager. |
| Customer/Guest | Public ordering and safe order tracking only. | No staff workspace, Flow Connect, raw IDs, internal records, payment internals, or other customer orders. |

## 6. State Ownership Matrix

Payment state != Kitchen state != Fulfilment state.

| State system | Owner | Canonical states | Non-owners |
| --- | --- | --- | --- |
| Payment | Payment provider/POS event when integrated; otherwise authorised cashier/manual external-settlement confirmation. | `UNPAID`, `PAYMENT_PENDING`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED`, `CANCELLED`, `VOIDED` as approved per channel. `VOIDED` means a payment authorisation or unsettled settlement attempt was voided before capture/final settlement; it is not a paid-order cancellation and not a refund. | Kitchen, waiter messages, public customer claims, browser redirects. |
| Kitchen | Kitchen station staff within assigned station; manager/owner override only through audited controls. | `NEW -> ACCEPTED -> PREPARING -> READY`. Kitchen stops at `READY`. | Cashier, public customer, Flow Connect messages. |
| Fulfilment | Front-of-house. Waiter marks `SERVED` for dine-in. Cashier or waiter marks `COLLECTED` for takeaway according to outlet policy. | `NOT_RELEASED -> RELEASED -> READY_FOR_HANDOFF -> SERVED` for dine-in, or `NOT_RELEASED -> RELEASED -> READY_FOR_HANDOFF -> COLLECTED` for takeaway. `READY_FOR_HANDOFF` is derived/system-controlled only when all required kitchen work is `READY`. | Kitchen and payment provider alone. |
| Order record closure | System or authorised manager/cashier based on controlled rules. | `OPEN`, `COMPLETE`, `CANCELLED`, `ARCHIVED`. | Public customer, messages, AI. |

Cancellation and hold behavior:

- Cancellation must state who cancelled, why, what had already been prepared/consumed, refund/void implication, and audit evidence.
- Hold pauses release or fulfilment; it does not erase payment, kitchen, or inventory evidence.
- Refund, cancellation, and void are separate evidenced events. A void must not be used to describe refunding a captured payment or cancelling an already-paid order.
- `SERVED` is dine-in only, waiter-owned by default, and auditable.
- `COLLECTED` is takeaway/pickup only, cashier or waiter owned according to outlet policy, and auditable.
- Order closure remains separate and may occur only through controlled rules after fulfilment, cancellation, or authorised exception handling.
- If systems are inconsistent, Flow must show a safe exception state and require authorised resolution rather than silently forcing a state.

## 7. Outlet Release Policy

Each outlet/channel must configure one release policy:

| Policy | Meaning | Example use |
| --- | --- | --- |
| `RELEASE_ON_SUBMIT` | Order can be released to kitchen immediately after valid submission. Payment is handled later. | Table service where staff collect payment after dining. |
| `RELEASE_ON_VERIFIED_PAYMENT` | Kitchen release waits for verified payment/POS/provider event. | Online pickup or prepay channels. |
| `RELEASE_BY_AUTHORISED_STAFF` | Order waits until authorised staff manually release it. | Pay-at-counter QR, exception handling, high-risk orders. |

BrewBite V3 recommended demo policy:

```text
QR order submitted
-> customer sees "Order received - please pay at counter"
-> authorised cashier confirms verified external/manual settlement
-> release policy permits kitchen work
-> kitchen prepares through READY
-> waiter serves or cashier/waiter marks collected
```

Current implementation note: the competition demo is transitional and may release tickets earlier than V3 policy requires. Future work must migrate to explicit release policy semantics.

## 8. QR And Public Ordering Decision

V3 default:

```text
One outlet QR
-> customer opens public outlet menu
-> customer selects or enters a public table label or short code
-> customer confirms table
-> Flow mints a short-lived opaque ordering context
-> customer orders
```

Required confirmation copy:

```text
You are ordering for Table 7.
Confirm / change table
```

A single outlet QR cannot automatically know the customer's table. Existing high-entropy table-token QR routes remain temporary competition implementation and may become an optional table-bound mode.

One-outlet QR security rules:

- The customer selects or enters a public table label or short code, never a raw table ID.
- The server validates that the table is active, belongs to the outlet represented by the outlet QR, and permits the selected public ordering channel.
- After confirmation, Flow mints a short-lived opaque ordering context.
- The ordering context is scoped to one outlet and one confirmed table only.
- The ordering context cannot reveal internal IDs, customer data, staff data, inventory, messages, logs, payment internals, or another table/order.
- The ordering context must have expiry, rate limiting, replay protection, and abuse controls.

Optional later modes:

- one QR per table;
- one outlet QR plus printed short table code;
- NFC, beacon, or hardware-assisted table identification.

Public ordering must never expose raw IDs, internal records, staff data, inventory, payment internals, messages, audit records, or another customer's order.

Public tracking must never display `SERVED` or `COLLECTED` until the exact canonical fulfilment event exists. During transition, legacy or ambiguous records must use neutral "Order complete" language and must not expose payment or settlement internals.

## 9. Dynamic Menu Authority

The seeded BrewBite menu is only a demo baseline.

| Role | Menu authority |
| --- | --- |
| Owner | Full organisation menu authority. |
| Organisation Admin | Menu/category/product management within authorised scope. |
| Outlet Manager | Outlet availability, daily specials, temporary pauses, assigned outlet configuration. |
| Kitchen | Flag preparation/item-unavailable issues; cannot price or publish permanent changes. |
| Cashier/Waiter | Browse approved menu and create orders only. |

Required menu capabilities:

- categories, products, descriptions, prices, and images;
- modifiers;
- combos/promotions later;
- outlet-specific availability;
- temporary sold-out state with reason;
- recipe links;
- kitchen-station routing;
- tax/service rules;
- archive rather than destructive delete;
- audit history;
- historical order snapshots of title, price, tax, modifiers, recipe version, and station routing version.

## 10. Profiles, Employment, Payroll, And Profit

Every human account requires:

- account identity/authentication record;
- user profile;
- employment or organisation membership record.

Profile data minimisation:

- full name;
- work email;
- work phone where enabled;
- optional profile image;
- employee/staff ID;
- assigned outlets;
- station assignment where relevant;
- employment status;
- start date;
- notification preferences;
- optional emergency-contact fields only when the organisation enables them.

Protected employment data:

- salary/rate;
- effective-dated compensation history;
- payroll/bank references;
- contracts/documents;
- sensitive personal identifiers.

Owner/Admin onboarding:

```text
Authorised Owner or Admin
-> creates employee profile/invitation
-> assigns role/outlet/station
-> user activates account
-> audited lifecycle events
```

Owner-only decisions:

- create/remove admins;
- transfer ownership;
- broad payroll/integration authority.

Employee lifecycle records:

- invited;
- active;
- suspended;
- inactive/ended;
- role/outlet/station changes;
- access revoked.

Payroll/labour foundation:

- monthly, hourly, daily, and shift rate models;
- effective-dated pay changes;
- payroll periods;
- approved allowances/adjustments later;
- payroll access restrictions;
- employee self-service future scope.

Do not promise a full statutory payroll engine until separately approved.

Profit rule:

```text
Revenue is not profit.

Profit estimate requires:
sales
- refunds
- discounts
- cost of goods sold
- waste
- payroll/labour cost
- recorded operating expenses
- tax/fees where configured
```

Flow labels must be truthful: sales revenue, gross-profit estimate, operating-profit estimate, and net-profit estimate only when all required cost inputs exist.

## 11. Owner Command Centre And Records

The Owner dashboard must become a command centre with three layers.

| Layer | Contents |
| --- | --- |
| Live Operations | Orders, payment queue, kitchen backlog, ready-but-unserved, stock risk, table/floor state, active coverage, station workload. |
| Records and Accountability | Orders, settlements/payment confirmation, kitchen transitions, inventory ledger, menu changes, employee lifecycle/activity, approvals, integration events, audit trail. |
| Controls | Team, role/outlet/station assignment, menu, inventory thresholds, integration state, release policy, reports, approval decisions. |

Future routes:

- `/app/team` for employees, roles, assignments, lifecycle, invitations, and payroll-authorised subsets.
- `/app/records` for role/outlet-scoped operational and audit records.

Required logs:

- audit log;
- order lifecycle log;
- payment/settlement log;
- kitchen log;
- inventory/waste/adjustment log;
- menu-change log;
- employee activity/employment log;
- payroll-change log;
- integration/webhook/sync log;
- system/diagnostic log.

Each log must identify, as relevant: actor, action, object, organisation/outlet scope, timestamp, reason, before/after evidence, and correlation/idempotency reference.

Secrets, raw card details, raw provider payloads, private customer data, and private-message content must not appear in ordinary logs.

## 12. Flow Connect And Communications

Flow Connect is a core operational system, not a social network.

Supported model:

- Organisation Hub for official notices;
- Team Rooms;
- outlet/station rooms;
- work-item threads linked to orders, tickets, inventory incidents, approvals, supplier events, and tasks;
- Direct Work Conversations as company-managed, policy-controlled communications;
- operational notifications;
- critical acknowledgement/read requirements later.

Rule:

Messages can explain or coordinate work. Messages cannot mutate payment, order, inventory, kitchen, permission, or approval state.

Example:

```text
"Table 7 paid" in a message never marks payment paid.
Only an authorised payment/settlement action can do that.
```

Private-message review:

```text
reason required
-> room-scoped
-> temporary
-> auditable
-> no silent permanent owner/admin access
```

## 13. Deterministic Flow Analysis

Analysis is mandatory. Flow must answer:

- What is happening?
- Why does it matter?
- What evidence supports it?
- What should happen next?
- Who should act?

The first implementation must be deterministic, evidence-backed, and explainable. Do not claim magical forecasting or AI understanding.

Required initial insights:

- kitchen bottleneck;
- ticket aging;
- ready-but-unserved;
- payment queue;
- stock risk;
- item availability risk;
- top/slow menu items;
- comparable demand pattern;
- staff/station coverage versus workload;
- inventory waste trend;
- gross/operating-profit insight only when underlying data is sufficient.

Every insight needs outlet scope, time range, supporting metrics/evidence, data freshness, confidence or insufficient-data state, and recommended action.

AI/Copilot may later explain trusted insights, but cannot invent facts or directly alter money, stock, menu prices, permissions, payroll, or historical records.

## 14. Connector Rules

Flow must connect to systems cafes already use; it does not replace all of them on day one.

Provider-neutral connectors:

- POS connector;
- payment gateway connector;
- card-terminal/POS settlement connector;
- accounting connector;
- delivery-platform connector later;
- supplier connector later;
- printer/KDS/hardware connector later.

Payments require:

- per-organisation/outlet credentials stored in a Flow secrets vault;
- no shared Vercel environment variables for each merchant;
- signed webhook or official provider/POS event verification where available;
- idempotency;
- reconciliation;
- audit/outbox evidence;
- manual verified external-settlement fallback if no API/webhook exists;
- no raw card data.

A browser redirect or customer claim never proves payment.

## 15. Full-System Modules

V3 defines these modules:

| Module | Status |
| --- | --- |
| Organisation business profile | Planned V3 |
| Outlets, zones, tables, stations, operating hours | Partial today; V3 expands |
| Table service | Partial today; V3 separates release/kitchen/fulfilment |
| Counter/POS workflow | Planned V3 |
| Public ordering | Transitional today; V3 default one outlet QR |
| Menu | Seeded demo today; V3 dynamic management |
| Payments/settlements/release policy | Manual demo today; V3 integrates providers/POS and release policy |
| Kitchen | Partial today; V3 stops kitchen at READY |
| Waiter/cashier fulfilment | Planned V3 separation |
| Inventory/recipes/lots/waste | Partial today; V3 expands |
| Suppliers/purchases/expenses | Planned V3 |
| Employee profiles, employment, shifts, payroll foundation | Partial identity today; V3 planned |
| Flow Connect | Foundation today; V3 expands operational communications |
| Records/logs/audit | Partial today; V3 record centre planned |
| Analysis | Planned V3 deterministic insights |
| Reports | Planned V3 |
| Approvals | Planned V3 |
| Notifications | Planned V3 |
| Connectors | Planned V3 after approval |
| Customer consent-based data | Planned later |
| Settings | Partial today; V3 expands |
| Security/privacy/retention | Foundation today; V3 strengthens |
| Demo reset and environment separation | Planned hardening |

## 16. Explicit Non-Goals

Not allowed without future explicit owner approval:

- new industry packs;
- real payment gateway/POS/accounting connector implementation;
- production statutory payroll engine;
- customer accounts or customer chat;
- AI that performs business mutations;
- employee surveillance, hidden productivity scoring, or discipline automation;
- automatic owner/admin access to private Direct Work Conversations;
- broad public table/database grants;
- rewriting applied migrations;
- storing raw card data;
- claiming deployment, connector, payroll, AI, or compliance capability that is only planned.

## 17. Future Owner Approval Required

These require explicit owner approval before implementation:

- real payment provider, POS, terminal, accounting, delivery, supplier, or hardware connector;
- secrets vault design and credential lifecycle;
- statutory payroll, tax, or legal compliance features;
- customer profiles beyond anonymous safe public ordering;
- AI/Copilot features beyond deterministic explanation of authorised records;
- private-message retention/export policies beyond the existing review model;
- new industry packs;
- public SaaS billing;
- production observability, backup, and retention policies.
