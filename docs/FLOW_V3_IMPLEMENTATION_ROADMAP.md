# FLOW - V3 Implementation Roadmap

> Status: Draft - pending product-owner approval
> Precedence: Third after `FLOW_DECISION_LOCK_V3.md` and `FLOW_PRD_V3.md`.
> Rule: Each phase must be implemented through small reviewed changes, forward-only migrations, tests, and owner approval before broadening scope.

## Roadmap Overview

| Phase | Name | Primary dependency |
| --- | --- | --- |
| V3.0 | Documentation lock and implementation inventory | Current `main` baseline |
| V3.1 | Lifecycle kernel | V3.0 |
| V3.2 | One-outlet QR plus table selection | V3.1 |
| V3.3 | Dynamic menu, availability, recipes, station routing | V3.1 |
| V3.4 | Employee profiles, onboarding, role/outlet/station controls, payroll foundation | V3.1 |
| V3.5 | Owner/Admin command centre, team page, records/logs/audit views | V3.1, V3.4 |
| V3.6 | Table/counter operations, fulfilment, shifts/tasks/approvals | V3.1, V3.4 |
| V3.7 | Inventory/supplier/expense/profitability foundation | V3.3, V3.4 |
| V3.8 | Deterministic Flow Analysis | V3.5, V3.7 |
| V3.9 | Connector framework and one real sandbox/POS integration | V3.1, V3.5, owner approval |
| V3.10 | Notifications, reports, CI/CD, observability, demos, hardening | All prior critical foundations |

## V3.0 - Documentation Lock And Implementation Inventory

| Area | Detail |
| --- | --- |
| Objective | Establish V3 decision lock, PRD, roadmap, gap report, and traceability. |
| Exact scope | Create V3 docs; update source-of-truth supersession; update agent reading order. Inventory current routes, services, migrations, and known demo boundaries. |
| Dependencies | Current working demo and milestone reports. |
| Migration/data-transition strategy | None. Documentation only. |
| Roles/security | No role or security implementation changes. |
| Tests | Documentation validation through `git diff --check`, lint, typecheck, test, build. |
| Manual acceptance criteria | V3 docs distinguish implemented, planned, demo, production, and deferred capability. |
| Strict non-goals | No code, migrations, dependencies, env, deployment, or database changes. |
| Rollout/forward-remediation | Commit docs only after review. If wording conflicts later, update through V3.0.x doc patch. |
| Demo impact | Clarifies that current demo is real but transitional. |

## V3.1 - Lifecycle Kernel: Payment, Release, Kitchen, Fulfilment

| Area | Detail |
| --- | --- |
| Objective | Separate payment state, release policy, kitchen state, fulfilment state, and order closure. |
| Exact scope | Add canonical state tables/enums or mapped columns as needed; introduce release policy per outlet/channel; create server-side services/RPCs for release, kitchen through READY, derived `READY_FOR_HANDOFF`, dine-in `SERVED`, takeaway `COLLECTED`, cancellation, hold, and order closure. |
| Dependencies | Current migrations 001-009; V3 Decision Lock. |
| Migration/data-transition strategy | Forward-only migration. Preserve existing `orders.service_status`, `payment_status`, and ticket history. Add new lifecycle columns/tables rather than rewriting applied migrations. Backfill existing demo records into compatible lifecycle states. |
| Roles/security | Kitchen can progress only `NEW -> ACCEPTED -> PREPARING -> READY`; cashier/payment connector owns payment; waiter/cashier owns served/collected; owner/admin/manager exception controls are audited. |
| Tests | State machine unit tests, RPC integration tests, RLS/role tests, audit/outbox tests, cancellation/hold tests, idempotency tests, and public tracking tests proving `SERVED`/`COLLECTED` appear only after exact fulfilment events. |
| Manual acceptance criteria | QR pay-at-counter order can wait for verified/manual settlement before release when policy requires; kitchen cannot mark paid, served, or collected; `READY_FOR_HANDOFF` appears only when all required kitchen work is `READY`; waiter/cashier can fulfil only within role and outlet policy. |
| Strict non-goals | No payment gateway integration, no dynamic menu redesign, no connector framework. |
| Rollout/forward-remediation | Deploy behind compatibility reads that support current demo states. Use corrective migrations for data anomalies. |
| Demo impact | Makes public tracking and internal workflow truthful under V3 semantics. |

## V3.2 - One-Outlet QR Plus Table Selection

| Area | Detail |
| --- | --- |
| Objective | Replace table-token QR as the default public ordering model with one outlet QR and safe table confirmation. |
| Exact scope | Add outlet public menu route/context; customer table-label or short-code selection, never raw table ID entry; confirmation copy; short-lived opaque ordering context scoped to one outlet and confirmed table; safe public status; keep table-token QR as optional table-bound mode if needed. |
| Dependencies | V3.1 lifecycle kernel. |
| Migration/data-transition strategy | Forward-only migration for outlet QR tokens, public ordering sessions, table confirmation evidence, short-lived ordering-context tokens, indexes, expiry, rate-limit keys, replay controls, and compatibility with existing table-token tokens. |
| Roles/security | Public gets safe menu/order context only. Server validates the selected public table label/short code is active, belongs to the QR outlet, and permits the public ordering channel. The ordering context cannot reveal internal IDs, customer data, staff data, inventory, messages, logs, payment internals, or another table/order. No direct table grants. Staff can see resulting orders through normal scopes. |
| Tests | Invalid/expired outlet token, invalid/inactive table, wrong-outlet table, public-channel disabled table, table confirmation, context expiry, rate limiting, replay resistance, no raw IDs, order idempotency, release policy integration, public tracking privacy. |
| Manual acceptance criteria | A single outlet QR opens menu, customer chooses a public table label/short code, confirms "You are ordering for Table X", receives a short-lived opaque ordering context, submits, tracks status, and no raw IDs or cross-table/order data leak. |
| Strict non-goals | No customer accounts, customer chat, online payment, or QR management suite. |
| Rollout/forward-remediation | Continue supporting old table-token routes during transition. Mark table-token QR as optional mode in UI/admin docs. |
| Demo impact | Judges can scan one outlet QR and demonstrate table confirmation clearly. |

## V3.3 - Dynamic Menu, Availability, Recipes, Station Routing

| Area | Detail |
| --- | --- |
| Objective | Move from seeded menu records to controlled menu management. |
| Exact scope | Menu categories/products/descriptions/prices/images; modifiers; outlet availability; temporary sold-out reason; archive; versioned recipes; station routing; tax/service rules; historical order snapshots. |
| Dependencies | V3.1 for lifecycle and inventory hooks. |
| Migration/data-transition strategy | Forward-only menu versioning tables and snapshot columns where needed. Backfill seeded BrewBite menu into versioned active products. |
| Roles/security | Owner/Admin can publish; outlet manager can manage availability; kitchen can flag issue; cashier/waiter browse and order only. |
| Tests | Price snapshot integrity, archive behavior, availability by outlet, station routing, kitchen flag cannot change price, cross-tenant menu isolation. |
| Manual acceptance criteria | Admin changes product price for future orders; old order retains old price/title/version; manager pauses item with reason; public/staff menu updates safely. |
| Strict non-goals | No advanced promotions engine unless explicitly approved; no supplier purchasing yet. |
| Rollout/forward-remediation | Keep existing menu item IDs stable where possible and introduce versions. Correct forward if snapshot gaps are found. |
| Demo impact | Demo becomes editable without seed-script intervention. |

## V3.4 - Employee Profiles, Team Onboarding, Controls, Payroll Foundation

| Area | Detail |
| --- | --- |
| Objective | Make people management a first-class operational module. |
| Exact scope | Profiles, employment records, invitations, active/suspended/inactive lifecycle, role/outlet/station assignment UI, owner/admin distinction, payroll rate foundation, effective-dated compensation, payroll access permissions. |
| Dependencies | V3.1 role and lifecycle model. |
| Migration/data-transition strategy | Forward-only employment tables; backfill current memberships into employment records; add protected compensation tables with strict grants. |
| Roles/security | Owner-only admin creation/removal and ownership transfer. Payroll access permission separate from admin role. Station/outlet assignment remains scoped. |
| Tests | Owner/admin distinction, lifecycle access revocation, suspended user blocked, payroll access denied by default, station assignment enforcement. |
| Manual acceptance criteria | Owner invites employee, assigns outlet/station/role, user activates, access works; suspended user loses access; Admin cannot see payroll unless granted. |
| Strict non-goals | No statutory payroll filing, no bank disbursement, no employee surveillance. |
| Rollout/forward-remediation | Existing memberships remain source until backfill verified; then services read employment state. |
| Demo impact | Owner can show team setup and role clarity. |

## V3.5 - Owner/Admin Command Centre, Team Page, Records/Logs/Audit Views

| Area | Detail |
| --- | --- |
| Objective | Upgrade dashboard into command centre and expose scoped records. |
| Exact scope | `/app` live operations; `/app/team`; `/app/records`; scoped views for order, payment, kitchen, inventory, menu, employee, payroll, integration, audit, and system logs. |
| Dependencies | V3.1 and V3.4. |
| Migration/data-transition strategy | Add materialized/read-model tables only if needed; otherwise query existing evidence tables. Preserve audit/outbox immutability. |
| Roles/security | Owner/Admin broad business records; managers scoped to outlets; payroll logs protected; private messages excluded except review workflow. |
| Tests | Record scope, log redaction, owner/admin permissions, manager outlet limits, no private-message content in ordinary logs. |
| Manual acceptance criteria | Owner sees live operations and records; manager sees only outlet scope; logs show actor/action/object/reason/correlation without secrets. |
| Strict non-goals | No advanced reports/export beyond scoped records unless approved. |
| Rollout/forward-remediation | Ship read-only records before controls; add missing event emitters forward-only. |
| Demo impact | Stronger command-centre story. |

## V3.6 - Table/Counter Operations, Fulfilment, Shifts/Tasks/Approvals

| Area | Detail |
| --- | --- |
| Objective | Complete front-of-house operations and controlled workflows. |
| Exact scope | Table state, counter orders, pickup/collection, waiter served action, cashier collected action, shifts, tasks, approvals, exception handling. |
| Dependencies | V3.1, V3.4. |
| Migration/data-transition strategy | Add fulfilment events, shift records, task/approval tables, and indexes. Backfill demo completed tickets into neutral fulfilment evidence where safe. |
| Roles/security | Waiter/cashier fulfilment permissions; manager approvals; owner/admin override with audit. |
| Tests | Served/collected role checks, approval required actions, task scopes, table state transitions, audit evidence. |
| Manual acceptance criteria | Dine-in order reaches READY then waiter marks served; takeaway order reaches READY then cashier marks collected; approval actions require proper role. |
| Strict non-goals | No delivery platform integration, no customer accounts. |
| Rollout/forward-remediation | Introduce fulfilment actions while preserving old order detail display. |
| Demo impact | Resolves served/collected ambiguity. |

## V3.7 - Inventory, Supplier, Expense, Profitability Foundation

| Area | Detail |
| --- | --- |
| Objective | Expand inventory and cost truth so profit estimates can be labelled honestly. |
| Exact scope | Supplier records, purchases, receiving, waste, adjustments, expenses, cost-of-goods calculation, labour cost inputs from payroll foundation, gross/operating-profit estimates. |
| Dependencies | V3.3 menu/recipes and V3.4 payroll foundation. |
| Migration/data-transition strategy | Add supplier/purchase/expense tables and ledger event types. Preserve existing inventory ledger. |
| Roles/security | Storekeeper inventory operations; owner/admin financial visibility; manager outlet scope; payroll/expense details restricted. |
| Tests | Append-only ledger, waste evidence, COGS calculation, insufficient-data profit labels, expense scope, no direct balance edits. |
| Manual acceptance criteria | Receiving stock updates availability via ledger; waste reduces availability; dashboard labels revenue versus gross/operating profit accurately. |
| Strict non-goals | No accounting system replacement or tax filing. |
| Rollout/forward-remediation | Ship cost inputs before profit labels. Never show net profit unless data is sufficient. |
| Demo impact | Adds credible business insight without fabricated profit. |

## V3.8 - Deterministic Flow Analysis

| Area | Detail |
| --- | --- |
| Objective | Deliver evidence-backed operational insights and recommendations. |
| Exact scope | Kitchen bottleneck, ticket aging, ready-but-unserved, payment queue, stock risk, item availability risk, top/slow items, comparable demand pattern, coverage/workload, waste trend, profit insight with sufficiency. |
| Dependencies | V3.5 records and V3.7 cost/inventory data. |
| Migration/data-transition strategy | Add insight definitions/read models if needed; store generated insight events only when useful for audit/history. |
| Roles/security | Insights scoped by outlet/role. Payroll and private communications excluded unless authorised and appropriate. |
| Tests | Evidence sufficiency, stale-data labels, cross-tenant isolation, recommendation does not mutate state, role scoping. |
| Manual acceptance criteria | Owner can see "what/why/evidence/next action/who acts" for each supported insight. Insufficient data is stated clearly. |
| Strict non-goals | No AI forecasting claim, no automatic business mutations, no employee scoring. |
| Rollout/forward-remediation | Start deterministic; add AI explanation only after trusted insight layer exists. |
| Demo impact | Makes Flow feel like command software, not only operations UI. |

## V3.9 - Connector Framework And One Real Sandbox/POS Integration

| Area | Detail |
| --- | --- |
| Objective | Build provider-neutral connector infrastructure and one approved sandbox integration. |
| Exact scope | Connector registry, per org/outlet credentials vault, webhook verification, idempotency, reconciliation, integration logs, one real sandbox connector only after owner approval. |
| Dependencies | V3.1 lifecycle, V3.5 records, explicit owner approval. |
| Migration/data-transition strategy | Add connector tables, secrets references, webhook events, reconciliation records. No raw card data. |
| Roles/security | Owner controls high-risk integrations/secrets; Admin only if granted; platform support through support elevation. |
| Tests | Signature verification, amount/reference match, idempotency, reconciliation, secret non-exposure, replay protection. |
| Manual acceptance criteria | Sandbox event updates payment state only after verification and creates audit/outbox/reconciliation records. |
| Strict non-goals | No production payment processing without separate approval; no broad connector marketplace. |
| Rollout/forward-remediation | Keep manual settlement fallback. Disable connector safely if reconciliation fails. |
| Demo impact | Enables credible integration demonstration after approval. |

## V3.10 - Notifications, Reports, CI/CD, Observability, Demos, Hardening

| Area | Detail |
| --- | --- |
| Objective | Production hardening and presentation reliability. |
| Exact scope | Notifications, reporting, export controls, CI/CD, backup/restore runbooks, observability, error budgets, demo reset, environment separation, security review checklist. |
| Dependencies | Prior critical foundations. |
| Migration/data-transition strategy | Add notification preferences/events and report snapshots only where needed. Preserve audit records. |
| Roles/security | Notification preferences by user; reports by role/scope; exports audited; production credentials isolated. |
| Tests | E2E golden flows, RLS regression, report scope, export redaction, CI migration checks, backup restore drill where possible. |
| Manual acceptance criteria | Fresh deployment can run full demo; monitoring catches failures; reports/export do not leak data; CI blocks unsafe changes. |
| Strict non-goals | No new industry pack; no unapproved AI or payment expansion. |
| Rollout/forward-remediation | Feature flags for reports/notifications; forward corrective migrations for issues. |
| Demo impact | Reliable judge/customer demos and safer commercial readiness. |

## Cross-Phase Acceptance Gates

Every phase must pass:

- no applied migration rewrite;
- no secret exposure;
- tenant/RLS tests where data changes;
- role/permission tests for all new commands;
- audit/outbox evidence tests for sensitive actions;
- public boundary tests for public routes;
- lint, typecheck, test, build;
- migration apply validation on clean local database and seeded test database when migrations exist;
- manual demo checklist before production use.

## Forward-Only Remediation Policy

Production-style migrations are immutable. If a phase introduces a schema or data issue:

1. Create a new forward corrective migration.
2. Preserve payment, inventory, audit, and communication-review evidence.
3. Use local disposable resets only for local test databases.
4. Document remote status honestly.
5. Do not claim rollback as a production strategy unless a separately approved reversible operational plan exists.
