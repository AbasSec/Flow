# AGENTS.md — Flow repository instructions

## 1. Read before acting

Before proposing, planning, writing, modifying, testing, or reviewing code, read in this order:

1. `docs/FLOW_DECISION_LOCK_V2.md`
2. `docs/FLOW_PRD_IMPLEMENTATION.md`
3. `docs/FLOW_MASTER_CONVERSATION_SOURCE_OF_TRUTH.md`
4. This file
5. `CLAUDE.md`
6. Any existing approved `docs/IMPLEMENTATION_PLAN.md`, API contract, migration notes, or test conventions.

The Decision Lock is authoritative. Do not silently change a locked requirement because another approach appears easier.

## 2. Product identity

Flow is a secure operational-control platform with:

- **Flow Core:** organisations, sites, teams, staff, roles, permissions, internal communication, tasks, incidents, approvals, audit, realtime, reports, and constrained intelligence.
- **Flow for Food & Beverage:** the first complete competition-facing industry pack.

Do not turn Flow into:

- A generic public social network.
- A generic chat clone.
- An unfocused ERP that claims every industry is built.
- A generic ChatGPT clone.
- An employee-surveillance product.

Food & Beverage remains the only fully implemented pack for the current competition.

## 3. Flow Connect non-negotiables

- Flow Connect is internal, operational communication.
- Organisation Hub is not public internet content.
- Direct messages are called **Direct Work Conversations**.
- They are company-managed: show the approved transparency notice.
- Only authorised Organisation Owner/Admin users with `communication.audit.review` may review non-member rooms/direct conversations.
- A review requires a reason and produces immutable audit evidence.
- Managers have no default organisation-wide conversation review.
- Platform Super Admin has no default tenant-content access.
- No end-to-end encryption claim while authorised review exists.
- Messages never substitute for formal approval, payment, stock, order, ticket, or state transition.

## 4. Security and correctness rules

1. Every tenant-owned table requires `org_id`; apply RLS to every tenant/business/communication table.
2. Use server-side domain services or controlled RPCs for critical writes.
3. UI hiding is not access control.
4. Every sensitive action needs immutable audit data.
5. Payment callbacks are signature-verified, exact-amount/reference-checked, locked, and idempotent.
6. Browser redirect never proves payment.
7. Money uses integer smallest units, never floating point.
8. Inventory uses append-only ledger truth; never directly edit stock balance from UI.
9. Public routes use narrow safe projections and opaque tokens, never raw internal identifiers.
10. Realtime is a refresh hint after database commit; database state is truth.
11. AI is a constrained explainer/draft provider, never a direct business-state authority.
12. Never expose service keys, payment secrets, raw provider errors, or raw tenant data to the browser/logs.

## 5. Implementation process

### Before application code

The first permitted implementation task is **planning only**:

- Create/update `docs/IMPLEMENTATION_PLAN.md`.
- Include migration order, RLS model, permission matrix, Flow Connect rooms/messages/review model, attachment strategy, F&B order/payment/inventory architecture, realtime plan, test plan, seed/reset plan, P0/P1 scope, and risks.
- Stop for product-owner approval before scaffolding the app.

### After plan approval

Work in small, reviewable milestones. For each milestone:

1. Restate scope, non-goals, changed files, data migration effect, test plan, and rollback risk.
2. Make only the approved change.
3. Run relevant lint/typecheck/tests/build.
4. Report exact results and unresolved risks.
5. Do not broaden scope without explicit owner approval.

## 6. Testing requirements

At minimum, cover:

- Cross-tenant isolation.
- Role/permission enforcement.
- Active/deactivated membership behaviour.
- Room membership and Direct Work Conversation review policy.
- Mandatory review reason and audit event.
- No default Platform Super Admin tenant-content access.
- Work-item thread access.
- Payment callback idempotency and forged redirect rejection.
- Concurrent inventory reservation.
- Kitchen/payment/report role restrictions.
- Public QR/public route isolation.
- Golden table, counter, QR, kitchen, inventory, dashboard, and Flow Connect E2E paths.

## 7. Code quality

- TypeScript strict mode.
- Zod at every command boundary.
- No `any` without explicit documented reason.
- Prefer small domain services and typed repositories.
- Write migrations forward-only; do not rewrite applied production-style migrations.
- Build accessible, touch-first screens for public/waiter/kitchen/Connect and desktop-first screens for dashboard/settings/reports/audit.
- Add loading, empty, error, retry, and denied states to network-dependent screens.
- Do not use hard-coded test accounts/keys in source.
- Do not invent business statistics, integration success, compliance claims, or user research.

## 8. Stop conditions

Stop and ask for product-owner direction when:

- A requirement conflicts with Decision Lock v2.
- A change would add a new industry pack, public community, external messaging channel, or autonomous AI action.
- A direct-message review, retention, or support-elevation policy is unclear.
- A payment/inventory/security constraint cannot be implemented safely in the current milestone.
- A proposed shortcut weakens RLS, audit, idempotency, transparency, or tenant isolation.
