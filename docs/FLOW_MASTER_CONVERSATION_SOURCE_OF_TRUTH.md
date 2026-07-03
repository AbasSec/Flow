# FLOW — Master Conversation Source of Truth

> **Purpose:** Working source for the approved Flow direction. It condenses product identity, scope, architecture, safeguards, current repository state, and implementation sequence for the product team and coding agents.
> **Status:** Historical working source. V3 supersession note added on 3 July 2026.
> **Precedence:**
> 1. `docs/FLOW_DECISION_LOCK_V3.md`
> 2. `docs/FLOW_PRD_V3.md`
> 3. `docs/FLOW_V3_IMPLEMENTATION_ROADMAP.md`
> 4. `docs/FLOW_V3_TRANSITION_AND_GAP_REPORT.md`
> 5. Historical decision locks, older PRDs, milestone reports, and this source file
> 6. `AGENTS.md`, `CLAUDE.md`, `README.md` for repository operating rules
>
> V3 wins whenever a conflict exists.

## V3 Supersession Note

This document preserves the historical V2 conversation summary and earlier competition-planning decisions. It should not be deleted or rewritten as if history changed.

For all future product, architecture, roadmap, state-machine, QR/public-ordering, payment/release, menu, employment/payroll, communications, logging, analysis, integration, and implementation-scope decisions, use the V3 documents first:

1. `docs/FLOW_DECISION_LOCK_V3.md`
2. `docs/FLOW_PRD_V3.md`
3. `docs/FLOW_V3_IMPLEMENTATION_ROADMAP.md`
4. `docs/FLOW_V3_TRANSITION_AND_GAP_REPORT.md`
5. `docs/FLOW_V3_REQUIREMENTS_TRACEABILITY.md`

Older statements in this file that imply table-token QR is the final default public-ordering model, kitchen can own final served/collected state, Billplz/payment gateway is current implementation scope, or V2 is highest precedence are historical and superseded by V3. Current implementation remains a transitional F&B vertical slice, not the final complete Flow architecture.

---

## 1. Current product definition

**Flow** is a configurable operational-control platform that brings people, workflow, operational records, approvals, dashboards, and internal work communication into one accountable workspace.

It has two layers:

```text
FLOW CORE
- Organisation/site/team/staff management
- Roles, permissions, tenant isolation, audit
- Flow Connect internal communication
- Tasks, incidents, approvals, notifications
- Realtime dashboards, reports, constrained AI

FLOW FOR FOOD & BEVERAGE
- Table/counter/QR/online orders
- Settlement/payment truth
- Kitchen tickets and routing
- Recipe/lot inventory
- Customer/expense/staff operation controls
```

### Current one-sentence product definition

> **Flow is a secure, role-aware operational workspace; Flow for Food & Beverage proves it by unifying orders, payments, kitchen work, inventory, staff coordination, and contextual internal communication.**

---

## 2. Critical strategic decision

The product is no longer described only as a food-business tool, but it must **not** be described as a generic product that already solves every case study.

The locked positioning is:

> **Food & Beverage is Flow’s first complete industry pack and the current hackathon proof. Future packs can reuse Flow Core only after the F&B implementation is operationally complete.**

Future possibilities, not current builds:

- Event operations
- Retail / warehouse
- Facilities and service operations
- Campus or venue operations
- Other case-study packs with their own domain design and proof workflow

---

## 3. Flow Connect — approved communication direction

### What was approved

Flow must include a first-class internal communication system, called **Flow Connect**.

It is inside Flow, visually and technically part of the operational workspace. It supports:

- Organisation Hub: a company-wide internal group for active registered employees.
- Announcements: restricted publisher room.
- Team Rooms: operational group conversations.
- Direct Work Conversations: employee DMs/company-managed direct messages.
- Work-item threads: conversations connected to an order, ticket, task, approval, incident, stock issue, or similar work object.
- Shift handover and incident rooms later.
- Realtime activity/read state and role-aware notifications.

### What it must not become

- Public social media.
- Public groups accessible to internet users.
- A general chat platform.
- Followers, stories, feed algorithms, entertainment/social engagement features.
- A place where messages silently act as formal approvals or business-state changes.

### Central principle

> **Communication is operational context. It supports the workflow but never bypasses permissions, approvals, payments, stock controls, state transitions, or audit history.**

---

## 4. Direct Work Conversation policy

The product owner requested that an admin be able to review all chats, including direct conversations.

That is accepted only under this transparent model:

- The UI calls them **Direct Work Conversations**, not private DMs.
- Participants must see a clear company-managed workspace notice before using them.
- Default P0 authorised reviewers: Organisation Owner and Organisation Admin with `communication.audit.review`.
- Managers do not automatically get access to all conversations.
- Reviewers must provide a reason before opening a non-member room/direct conversation.
- Every review creates an immutable audit record.
- Platform Super Admin has no default tenant-chat access.
- Any Flow platform support access must be explicit, time-limited, scope-limited, and audited.
- Do not claim end-to-end encryption while authorised review exists.
- Do not silently erase message/audit evidence through deletion.

Suggested visible notice:

> **This is a company-managed operational communication workspace. Authorised Organisation Owners and Organisation Administrators may review conversations for operational, security, compliance, safety, or incident-management purposes. Reviews are logged.**

---

## 5. Locked role model

| Role | Meaning |
|---|---|
| Platform Super Admin | Operates the Flow platform but has no default access to tenant content. |
| Organisation Owner | Owns company workspace, policy, settings, reports, and oversight. |
| Organisation Admin | Delegated business administrator including permitted communication oversight. |
| Manager | Assigned team/site operational leader and approval authority; no default global chat review. |
| Cashier | Counter/POS and own operational rooms. |
| Waiter / Floor staff | Table/order workflow and assigned rooms/threads. |
| Kitchen staff | Assigned station workflow and assigned rooms/threads. |
| Storekeeper | Inventory workflow and assigned rooms/threads. |
| Customer / Guest | Narrow public order/payment/status path; no Flow Connect in P0. |

Permission-based enforcement is mandatory. Important permissions include:

```text
communication.room.manage
communication.message.send
communication.room.invite
communication.audit.review
communication.retention.manage
task.manage
approval.decide
audit.read
```

---

## 6. Competition problem and Flow answer

### Chosen domain

**Food & Beverage** remains the hackathon domain.

### Problems solved

| Problem | Demonstrated answer |
|---|---|
| Time-consuming work | Unified order channels plus work-context conversations. |
| Human error | Server-side prices, stock, payment, state, approval and audit controls. |
| Poor communication | Kitchen updates, Team Rooms, Direct Work Conversations, ticket/order/approval threads. |
| Customer management | Optional consent-based profiles/history, anonymous guest support. |
| Weak visibility | Live dashboard with sales, queue, tables, stock, coverage, tasks/incidents. |
| Lost opportunities | QR/online ordering, availability, stock-risk insight, Rescue Mode. |

### Golden proof workflow

```text
Order
→ valid payment/settlement
→ kitchen work
→ recipe inventory
→ live dashboard/report
→ manager-approved action
→ Flow Connect context/task/audit
```

This sequence cannot be weakened to prioritise chat polish.

---

## 7. P0 scope

P0 must show all of this on public deployment:

### Flow Core P0

- Authentication, organisation/user membership, roles, active status, tenant isolation.
- Org Hub, one Team Room, Direct Work Conversations.
- Basic read/unread and realtime refresh.
- Work-item thread tied to a genuine F&B object.
- Transparent admin review flow with reason/audit.
- Cross-tenant/cross-role message access restrictions.

### F&B P0

- Seeded F&B outlet: menu, recipes, ingredients/lots, tables, stations, staff.
- Waiter table flow including later add-on and bill request.
- Counter cash/external terminal settlement flow.
- QR table / online pickup hosted sandbox checkout.
- Verified callback confirms order only once.
- Kitchen station routing/state controls.
- Recipe inventory reservations, consumption, availability, ledger.
- Owner dashboard, reports, settings, staff approval, audit.
- Protected demo reset.
- Mobile-first public/waiter/kitchen/Connect screens.

### P1 only after P0 works

- Mentions, reactions, attachment, message search.
- Structured handover and incident rooms.
- Task creation from a message.
- Notifications polish.
- AI/Copilot, forecasts, Rescue Mode.
- English/Bahasa Melayu principal flows.
- CI/CD, Docker, barcode, PDF export.

---

## 8. F&B design controls that remain unchanged

- `orders.service_status`, `orders.payment_status`, `table_sessions.status`, and ticket-line state are separate.
- Money uses integer sen, never floating-point.
- Hosted payment redirect never proves payment; server callback does.
- Billplz callback verifies signature, exact amount/reference, and applies effects idempotently.
- Inventory ledger is append-only.
- Stock availability is computed server-side from on-hand less reservations.
- Orders/payment/tickets/stock/audit/outbox changes happen in transactional services.
- Kitchen roles cannot see revenue, payment data, customer contacts, or admin rooms.
- Public QR uses opaque tokens and never exposes internal data.
- AI cannot write critical business state.
- Realtime is a refresh hint; committed DB state is truth.

---

## 9. Core data model direction

### Flow Core

```text
organisations
sites
profiles
org_memberships
site_memberships
teams
team_memberships
permission_grants
communication_rooms
room_memberships
messages
message_attachments
message_mentions
message_reads
work_item_threads
communication_review_events
communication_retention_policies
staff_tasks
incidents
approval_requests
notifications
audit_events
outbox_events
support_access_grants
```

### F&B pack

```text
outlets
floors
restaurant_tables
table_sessions
menu_categories
menu_items
menu_item_modifiers
recipe_versions
recipe_lines
ingredients
stock_lots
inventory_ledger
orders
order_lines
kitchen_tickets
ticket_lines
payment_attempts
cashier_settlements
customers
customer_order_links
expenses
forecast_snapshots
promotion_proposals
```

Every tenant record has `org_id`. Scope enforcement uses RLS plus server authorisation.

---

## 10. Architecture and stack

| Layer | Locked choice |
|---|---|
| Web app | Next.js App Router + React + strict TypeScript |
| UI | Tailwind + accessible components + Lucide |
| Validation/forms | Zod + React Hook Form |
| Query/cache | TanStack Query |
| Auth/database/storage/realtime | Supabase |
| Payments | Adapter; Billplz sandbox P0 |
| AI | Server-only provider adapter, constrained data/intents |
| Reporting | Server query layer + Recharts |
| Testing | Vitest, Testing Library, Playwright |
| Deployment | Vercel/equivalent + Supabase Cloud |
| CI/CD | GitHub Actions after P0 |
| Containers | Docker after P0 |

Realtime channels are private and organisation-scoped. Chat messages, business records, and attachments must use tenant-safe RLS.

---

## 11. AI boundary

Flow Copilot is an internal operational explainer, not generic chat.

- It has finite F&B intents.
- It receives authorised structured facts only.
- It has no raw SQL, arbitrary URLs, storage, payment, secrets, card data, or cross-tenant data.
- P0 does not give it room-message content.
- P1 room summary requires existing room access, explicit user request, input minimisation, source/time/freshness evidence, and policy disclosure.
- It cannot score staff, recommend discipline, change state, or mine DMs for unrelated analytics.

---

## 12. Security and privacy principles

1. RLS on every tenant table.
2. Server-side authorisation in addition to RLS.
3. No browser-side business truth or admin enforcement.
4. Company-managed Direct Work Conversations are transparent and audited.
5. Platform Super Admin cannot browse tenant content by default.
6. Public routes return narrow safe projections only.
7. No raw card data or secrets.
8. Message body/attachments validated, size/type limited, stored privately, served by scoped URLs.
9. Auditable support elevation only.
10. Production needs jurisdiction-specific privacy/employment/retention review before any compliance claim.

---

## 13. Repository state

### Expected repository root

```text
~/flow
```

### Current documented structure

```text
flow/
├── AGENTS.md
├── CLAUDE.md
├── README.md
└── docs/
    ├── FLOW_DECISION_LOCK_V1.md       # historical/pointer after v2 update
    ├── FLOW_DECISION_LOCK_V2.md       # authoritative
    ├── FLOW_PRD_IMPLEMENTATION.md
    └── FLOW_MASTER_CONVERSATION_SOURCE_OF_TRUTH.md
```

### Current implementation status

- Git repository exists.
- Application implementation has not started.
- No dependencies, Next.js scaffold, Supabase project, migrations, or product code should be generated before a planning-only `docs/IMPLEMENTATION_PLAN.md` is reviewed and approved.
- The documentation update must be committed before planning work begins.

---

## 14. Required next sequence

1. Replace/add the updated documentation files.
2. Keep v1 Decision Lock only as a historical pointer; make v2 authoritative.
3. Configure repository Git identity if still needed and make a documentation commit.
4. Ask a coding agent for `docs/IMPLEMENTATION_PLAN.md` only.
5. Require the plan to cover schema/migration order, RLS/permissions, Connect routes/realtime, support elevation, F&B state services, tests, seed/reset, P0/P1 scope, and risk.
6. Stop for product-owner approval.
7. Bootstrap application only after approval.

---

## 15. Final product statement

> **Flow is an accountable operational platform where organisations coordinate people, data, decisions, and internal work communication. Its first Food & Beverage pack proves the model through secure multi-channel ordering, payment truth, kitchen execution, inventory integrity, staff coordination, and manager-approved action.**
