# FLOW - V3 Requirements Traceability

> Status: V3 traceability matrix
> Purpose: Map V3 requirements to decision IDs, current status, implementation phase, security/privacy constraints, and acceptance evidence.

## Status Legend

| Status | Meaning |
| --- | --- |
| Implemented | Exists in the current working demo. |
| Partial | Some foundation exists but V3 requirement is incomplete. |
| Planned | Not implemented; planned in roadmap. |
| Deferred | Explicitly later or approval-gated. |
| Not allowed | Prohibited by V3. |

## Traceability Matrix

| Requirement | Source area | V3 decision ID | Current status | Implementation phase | Security/privacy constraints | Acceptance evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Flow is a full operational command system, not only restaurant ordering. | Product definition | V3-D001 | Partial | V3.0 onward | Do not claim future packs or modules are implemented. | V3 docs and future UI copy distinguish current demo from target. |
| Food & Beverage is first fully implemented pack. | Product definition | V3-D002 | Implemented for demo slice | Current + V3 phases | No new pack without approval. | F&B routes/services/migrations remain only implemented pack. |
| Separate payment, kitchen, and fulfilment state systems. | Lifecycle | V3-D003 | Partial | V3.1 | Kitchen cannot set payment or served/collected; payment cannot bypass release rules. | State machine tests and role/RPC tests prove separation. |
| Kitchen scope is `NEW -> ACCEPTED -> PREPARING -> READY`. | Lifecycle | V3-D003 | Partial | V3.1 | Kitchen cannot complete fulfilment. | Kitchen transition tests reject non-kitchen-owned states. |
| Fulfilment owned by waiter/cashier/front-of-house. | Lifecycle | V3-D003 | Planned | V3.1, V3.6 | Dine-in served and takeaway collected must be role-scoped. | Fulfilment tests and manual served/collected checklist. |
| `READY_FOR_HANDOFF` is derived/system-controlled only after all required kitchen work is `READY`. | Lifecycle | V3-D003 | Planned | V3.1 | Kitchen cannot create fulfilment readiness through a fulfilment action; no public claim before kitchen evidence exists. | State tests prove kitchen `READY` evidence is required before handoff readiness. |
| `SERVED` is dine-in only, waiter-owned by default, and auditable. | Lifecycle | V3-D003 | Planned | V3.1, V3.6 | Only authorised waiter/front-of-house role can mark dine-in served. | Role tests and audit-event assertions for served action. |
| `COLLECTED` is takeaway/pickup only, cashier or waiter owned according to outlet policy, and auditable. | Lifecycle | V3-D003 | Planned | V3.1, V3.6 | Outlet policy controls cashier/waiter collection authority. | Role/policy tests and audit-event assertions for collected action. |
| Order closure remains separate from fulfilment. | Lifecycle | V3-D003 | Planned | V3.1 | Closure only after fulfilment, cancellation, or authorised exception handling. | Order closure tests reject direct kitchen/payment/message closure. |
| Payment owned by provider/POS or authorised manual settlement. | Payment | V3-D003, V3-D016 | Partial | V3.1, V3.9 | Browser redirects, customer claims, and messages never prove payment. | Payment callback/manual settlement tests with audit evidence. |
| `VOIDED` means pre-capture/pre-final-settlement void, not refund or paid-order cancellation. | Payment | V3-D003, V3-D016 | Planned | V3.1, V3.9 | Void, refund, cancellation, and settlement require separate evidence and audit. | Payment-state tests and audit records distinguish void/refund/cancel. |
| Configurable outlet/channel release policy. | Lifecycle | V3-D004 | Planned | V3.1 | Policy changes audited and outlet/channel scoped. | Release policy migration, tests, and demo order release behavior. |
| BrewBite pay-at-counter recommended V3 flow waits for verified/manual settlement or authorised release. | Demo transition | V3-D004 | Planned | V3.1 | Must not claim online payment. | Manual demo checklist shows received -> paid/released -> kitchen -> fulfilment. |
| Current implementation may release earlier and is transitional. | Transition | V3-D004 | Documented | V3.0 | Must be stated truthfully. | Transition report and PRD note. |
| One outlet QR is V3 default public ordering model. | QR/public | V3-D005 | Planned | V3.2 | Single QR cannot infer table automatically. | Public outlet QR route with table confirmation. |
| Customer confirms table before ordering. | QR/public | V3-D005 | Planned | V3.2 | Customer selects or enters public table label/short code only, never raw table ID. | UI displays "You are ordering for Table X. Confirm / change table." |
| Server validates table belongs to outlet QR context and permits public ordering. | QR/public | V3-D005, V3-D006 | Planned | V3.2 | Reject inactive, wrong-outlet, unknown, disabled-channel, or expired contexts. | Integration tests for invalid/inactive/wrong-outlet/channel-disabled tables. |
| Flow mints short-lived opaque ordering context after table confirmation. | QR/public | V3-D005, V3-D006 | Planned | V3.2 | Context scoped to one outlet and confirmed table; no internal IDs or cross-table/order data. | Context expiry, replay, scope, and safe projection tests. |
| V3.2 public ordering context has expiry, rate limiting, replay, and abuse controls. | QR/public | V3-D005, V3-D006 | Planned | V3.2 | Prevent duplicate/replayed context use and request abuse without exposing internals. | Rate-limit and replay-resistance tests plus manual abuse checklist. |
| Existing table-token QR remains temporary or optional table-bound mode. | QR transition | V3-D005 | Implemented transitional | V3.2 compatibility | Keep opaque token and expiry protections. | Existing `/t/[tableToken]` works while outlet QR becomes default. |
| Public routes never expose raw IDs or private records. | Public boundary | V3-D006 | Implemented foundation | Current + every public phase | No raw org/outlet/table/order/ticket/room IDs, staff, inventory, audit, messages, or payment internals. | Static tests, RPC projection review, manual public inspection. |
| Public tracking displays `SERVED`/`COLLECTED` only after exact canonical fulfilment event. | Public boundary | V3-D003, V3-D006 | Planned | V3.1, V3.6 | Legacy/ambiguous records remain neutral "Order complete"; no payment/settlement internals. | Public tracking tests for legacy neutral status and exact fulfilment event status. |
| Dynamic menu management replaces seeded-only menu. | Menu | V3-D007 | Planned | V3.3 | Only authorised roles can publish; archive not destructive delete. | Menu CRUD/version tests and audit log evidence. |
| Owner has full menu authority. | Menu roles | V3-D007, V3-D008 | Planned | V3.3 | Tenant scoped and audited. | Owner menu management test. |
| Organisation Admin can manage menu within authorised scope. | Menu roles | V3-D007, V3-D008 | Planned | V3.3 | No ownership/billing/secrets by default. | Admin scoped menu test. |
| Outlet Manager controls outlet availability/specials. | Menu roles | V3-D007 | Planned | V3.3 | Outlet scoped only. | Manager cannot affect other outlet. |
| Kitchen can flag item issue but cannot price/publish permanent menu changes. | Menu roles | V3-D007 | Planned | V3.3 | Kitchen role limited to issue flag. | Kitchen price change rejected. |
| Historical order snapshots preserve title, price, tax, modifiers, recipe/station version. | Menu/history | V3-D007 | Partial | V3.3 | Snapshots immutable after order. | Old order unchanged after menu edit. |
| Owner and Organisation Admin are distinct roles. | Roles | V3-D008 | Partial | V3.4 | Admin lacks ownership transfer, billing, payroll, high-risk secrets, automatic private-message access. | Permission tests for owner-only actions. |
| Owner can create/remove admins and transfer ownership. | Roles | V3-D008 | Planned | V3.4 | Audited; support elevation excluded. | Owner-only lifecycle tests. |
| Every person has account identity, profile, and employment/membership record. | People | V3-D009 | Partial | V3.4 | Data minimisation and protected employment data. | Backfill and onboarding tests. |
| Employee lifecycle states: invited, active, suspended, inactive/ended, changes, revoked. | People | V3-D009 | Partial | V3.4 | Suspended/inactive users lose access immediately. | Auth/membership lifecycle tests. |
| Profile data minimisation. | Privacy | V3-D009 | Planned | V3.4 | Collect only approved profile fields. | Schema review and UI field audit. |
| Protected employment data separated. | Payroll/privacy | V3-D009, V3-D010 | Planned | V3.4 | Salary/rate/contracts/sensitive identifiers restricted. | Payroll access tests deny Admin by default. |
| Payroll/labour-cost foundation. | Payroll | V3-D010 | Planned | V3.4, V3.7 | Not a statutory payroll engine unless approved. | Rate/effective-date tests and honest UI labels. |
| Revenue is not profit. | Profit | V3-D011 | Planned | V3.7 | Profit labels require cost sufficiency. | Reports show insufficient-data state when costs missing. |
| Profit estimate includes sales, refunds, discounts, COGS, waste, labour, expenses, tax/fees where configured. | Profit | V3-D011 | Planned | V3.7 | No fabricated financial completeness. | Calculation tests with missing and complete inputs. |
| Owner dashboard becomes command centre. | Dashboard | V3-D012 | Partial | V3.5 | Role/outlet scoped; no private-message content by default. | Owner sees live operations, records, controls. |
| `/app/team` model for employees and assignments. | Team | V3-D012, V3-D009 | Planned | V3.4, V3.5 | Payroll subviews restricted. | Team page role tests. |
| `/app/records` model for records/logs. | Records | V3-D012 | Planned | V3.5 | Records role/outlet scoped and redacted. | Records page scope tests. |
| Required logs across audit, order, payment, kitchen, inventory, menu, employee, payroll, integration, system. | Logs | V3-D012 | Partial | V3.5, V3.7, V3.9 | No secrets, raw cards, raw provider payloads, private-message content in ordinary logs. | Log fixtures show actor/action/object/scope/time/reason/evidence/correlation. |
| Flow Connect is operational communication, not social media. | Communication | V3-D013 | Partial | Current + V3.5/V3.6 | Internal active employees only; no public chat. | Connect access tests and UI copy. |
| Messages cannot mutate business state. | Communication | V3-D013 | Implemented foundation | Current + all phases | Payment/order/inventory/kitchen/approval changes require formal commands. | Chat tests prove no business-state mutation. |
| Direct Work Conversation review rule: reason, room-scoped, temporary, auditable. | Communication privacy | V3-D014 | Schema foundation | Future Flow Connect phase | No silent permanent owner/admin access. | Review grant expiry and audit tests. |
| Deterministic Flow Analysis is mandatory. | Analysis | V3-D015 | Planned | V3.8 | Evidence-backed; no magical AI claims. | Insight tests for evidence, freshness, confidence, action. |
| Required initial insights list. | Analysis | V3-D015 | Planned | V3.8 | Scoped by outlet/role; sensitive data minimised. | Insight acceptance checklist. |
| AI may explain trusted insights but cannot mutate records. | AI | V3-D015 | Deferred | After V3.8 approval | No raw unrestricted messages or cross-scope facts. | AI guardrail review before implementation. |
| Provider-neutral POS/payment/accounting/delivery/supplier/hardware connectors. | Connectors | V3-D016 | Planned | V3.9 | Owner approval required per connector type. | Connector framework design review. |
| Per-organisation/outlet credentials in secrets vault. | Connectors/secrets | V3-D017 | Planned | V3.9 | No merchant secrets in shared Vercel env vars; no browser secrets. | Secret storage review and tests. |
| Signed webhook/provider event verification. | Payments/connectors | V3-D016 | Planned | V3.9 | Idempotency, exact amount/reference, replay protection. | Webhook integration tests. |
| Manual verified external-settlement fallback. | Payments | V3-D016 | Implemented demo version | V3.1, V3.9 | Must be labelled manual/external; audited. | Settlement role/audit tests. |
| No raw card data. | Security | V3-D016 | Implemented by absence | Every payment phase | Never store or log raw card data. | Schema/log review. |
| Tenant isolation and RLS. | Security | V3-D018 | Implemented foundation | Every phase | RLS plus server-side auth; UI hiding is not security. | RLS/tenant tests. |
| Platform Super Admin no default tenant access. | Security | V3-D018 | Implemented foundation | Every phase | Support elevation only. | Platform admin isolation tests. |
| Forward-only migrations. | Implementation | V3-D018 | Implemented practice | Every phase | Do not edit applied migrations 001-009. | Migration review and `git diff --check`. |
| Production/preview/local separation. | Operations | V3-D018 | Partial | V3.10 | No secrets in docs; environment-specific config. | Deployment runbook and validation. |
| Backup/observability/retention before commercial use. | Operations | V3-D018 | Planned | V3.10 | Privacy-aware logs and retention. | Production readiness checklist. |
| Current demo transition must preserve working demo. | Transition | V3-D018 | Required | Every phase | Do not break production QR, kitchen, inventory, dashboard, login. | Manual demo regression checklist. |
| No backfill may invent served, collected, payment, refund, payroll, or cost truth. | Transition | V3-D018 | Required | Every data migration | Ambiguous records use neutral/unknown states plus evidence; new V3 records use canonical lifecycle evidence. | Migration review verifies no fabricated truth and preserves legacy compatibility. |
| No Billplz/payment gateway claim today. | Truthfulness | V3-D016 | Implemented by copy | Until approved integration | Pay-at-counter only. | UI copy review. |
| No customer chat/account today. | Public scope | V3-D006, V3-D013 | Not implemented | Deferred | Public customer remains narrow. | Route/access review. |
| No employee-surveillance product. | Privacy | V3-D001 | Not allowed | Always | No hidden tracking, scoring, discipline automation. | Product review gate. |

## Acceptance Evidence Rules

Every future implementation phase must attach evidence:

- changed files and migrations;
- migration remote/local status;
- role/permission matrix change;
- RLS/server-auth tests;
- public-boundary tests for public routes;
- audit/outbox evidence tests for sensitive actions;
- manual workflow checklist;
- validation results for lint, typecheck, test, build, and `git diff --check`;
- explicit statement of non-goals not implemented.
