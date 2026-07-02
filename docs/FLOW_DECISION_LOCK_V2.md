# FLOW — Decision Lock v2

> **Status:** Approved product-direction lock  
> **Date:** 1 July 2026  
> **Purpose:** Prevent scope drift after the Flow Core + Flow Connect + F&B direction was approved.  
> **Precedence:** This is the highest-precedence Flow product document. It supersedes conflicting wording in prior Decision Lock v1 and earlier PRD/source files.

---

## 1. Locked product identity

**Flow is a configurable operational-control platform with a reusable Flow Core and industry-specific packs.**

**Flow for Food & Beverage is the first complete, competition-facing industry pack.** It is the only pack that must be implemented and demonstrated for the current competition.

Locked pitch sentence:

> **Flow connects people, operational data, workflows, approvals, and contextual internal communication in one accountable workspace. Flow for Food & Beverage proves this through an end-to-end order, payment, kitchen, inventory, and staff-coordination system.**

### Therefore

- Do not describe Flow as only a food-ordering system.
- Do not describe Flow as a generic app that can already solve every industry.
- Do not claim that future industry packs are implemented.
- Do not dilute the F&B golden loop to build generic features prematurely.

---

## 2. Flow Core architecture is approved

The product must be designed as:

```text
FLOW CORE
- Organisation, site, team, employee, role, permission, and policy management
- Flow Connect internal communication
- Tasks, incidents, approvals, notifications, and audit
- Dashboards, reports, realtime, and constrained intelligence
- Tenant isolation, security, privacy, and administrative controls

FLOW FOR FOOD & BEVERAGE
- Tables, waiter orders, POS, QR ordering, online pickup
- Payments/settlements
- Kitchen tickets and station routing
- Recipes, lots, inventory ledger, availability
- Customer, expense, operations, and report capabilities
```

Future packs are architecture/roadmap only until expressly approved.

---

## 3. Flow Connect is approved, with strict boundaries

### 3.1 What it is

**Flow Connect** is Flow’s built-in internal, operational communication layer.

It must include:

- Internal Organisation Hub for active employees.
- Team Rooms.
- Direct Work Conversations.
- Work-item threads tied to orders, tickets, tasks, incidents, approvals, stock issues, and other approved objects.
- Shift handover and incident-room direction in later milestones.
- Private realtime notifications/read state.

### 3.2 What it is not

Do not build:

- A public community.
- Anonymous/unauthenticated groups.
- A social feed, followers, stories, reels, likes-first features, games, or engagement algorithms.
- Personal/private end-to-end encrypted chat.
- A generic standalone social-media application.

### 3.3 Contextual communication wins

Flow Connect must prioritise **conversation attached to real work**. Messages never replace formal workflow transitions, approval decisions, stock mutations, payment status, or audit requirements.

---

## 4. Direct-message administration policy is locked

The requested ability for administration to access DMs is approved only under this exact model:

1. DMs are named **Direct Work Conversations**, not “private DMs.”
2. Before first use, participants are shown a clear company-managed communication notice.
3. The notice must say that authorised Organisation Owners and Organisation Administrators may review messages for operational, security, compliance, safety, or incident-management purposes.
4. Organisation Owner and Organisation Admin receive `communication.audit.review` in the default P0 policy.
5. A manager does **not** receive organisation-wide direct-conversation access merely because they are a manager.
6. A reviewer must enter a non-empty reason before opening a non-member room or Direct Work Conversation.
7. Every review creates an immutable `communication_review_event`.
8. Platform Super Admin has **no default right** to read any tenant’s messages.
9. Any platform support access requires explicit approval, a defined scope, time limit, and audit record.
10. Do not claim end-to-end encryption while review access exists.
11. Standard encryption at rest/in transit and strict tenant isolation remain mandatory.
12. Message deletion must not erase required audit/moderation evidence.

No coding agent may silently weaken the notice, review logging, tenant separation, or platform-admin limitation.

---

## 5. Roles are locked

| Role | Locked meaning |
|---|---|
| Platform Super Admin | Flow platform operator; no default tenant-content access. |
| Organisation Owner | Full organisation owner and policy authority. |
| Organisation Admin | Delegated company administrator, including permitted communication oversight. |
| Manager | Assigned operations/approval authority, but not default global conversation review. |
| Operational staff | Cashier, waiter, kitchen, storekeeper, and equivalent future pack roles. |
| Customer/Guest | Public/external limited access only; never Flow Connect in P0. |

Permission-based enforcement is mandatory. Role labels alone are not enough.

---

## 6. P0 scope is locked

P0 must include these Flow Connect foundations:

- Active registered employees only.
- Organisation Hub.
- At least one Team Room.
- Direct Work Conversations.
- Basic text messages, basic unread/read state, and realtime refresh.
- One contextual work-item thread tied to a real F&B object.
- Owner/Admin review flow with reason and immutable audit.
- RLS/API tests proving no cross-tenant or unauthorised message access.

P0 must still include the complete F&B golden loop:

```text
table/counter/QR/online order
→ valid payment or settlement
→ kitchen ticket
→ recipe-led inventory truth
→ live dashboard/report state
→ controlled manager-approved action
```

If timing is constrained, remove P1 chat polish before weakening payment, inventory, RLS, public QR scope, audit, or F&B golden-path proof.

---

## 7. P1 and P2 boundaries are locked

### P1 only after P0 works

- @mentions, attachments, reactions, search.
- Structured handover templates.
- Incident rooms.
- Tasks created from messages.
- Notifications polish.
- Copilot, forecasts, Rescue Mode, i18n, CI/CD, Docker, PDF export, barcode receiving.

### P2 or explicit future approval

- Future industry packs.
- Customer/supplier messaging.
- Browser push/email/WhatsApp/SMS.
- Native mobile app.
- Full offline sync.
- Advanced content retention/compliance workflows after jurisdiction-specific review.
- Public SaaS billing and marketplace integrations.
- Direct terminal/acquirer integrations.

---

## 8. F&B technical controls remain locked

Nothing about Flow Core or Flow Connect changes the existing non-negotiables:

- Server-side domain services/database transactions control critical writes.
- Supabase RLS protects every tenant business and communication table.
- UI hiding is not security.
- Money uses integer sen.
- Payment redirect is never payment proof.
- Billplz callback verification is server-side, signature-checked, amount/reference-checked, and idempotent.
- Stock is append-only ledger truth.
- Inventory availability is server-validated.
- Kitchen/service/payment/table states remain separate.
- AI cannot change payments, stock, prices, permissions, or historical records.
- Every sensitive action creates immutable audit evidence.
- Realtime is a refresh hint; committed database state is truth.
- Public routes expose only narrow safe projections.

---

## 9. AI and communication boundary is locked

- Flow Copilot is not a general chatbot.
- It receives only authorised structured facts, not raw unrestricted messages or raw database access.
- P0 Copilot does not read room content.
- P1 room/thread summary requires the user’s current room access, explicit request, minimised source input, evidence/freshness, and no cross-room leakage.
- AI cannot score staff, recommend discipline, or mine Direct Work Conversations for unrelated analytics.
- AI output is explanation/draft only; normal Flow command and approval services perform real actions.

---

## 10. Required documentation changes are locked

The following repository files must be updated before implementation planning:

```text
docs/FLOW_PRD_IMPLEMENTATION.md
docs/FLOW_DECISION_LOCK_V2.md
docs/FLOW_MASTER_CONVERSATION_SOURCE_OF_TRUTH.md
AGENTS.md
CLAUDE.md
README.md
```

`FLOW_DECISION_LOCK_V1.md` should be retained only as historical context or replaced by a short pointer to v2. All agents must treat v2 as authoritative.

---

## 11. Required planning order

Before code:

1. Update/commit the documents above.
2. Create `docs/IMPLEMENTATION_PLAN.md` only.
3. The plan must cover:
   - Core/F&B schema and migration order.
   - RLS strategy for rooms, messages, review events, and attachments.
   - Permission and support-elevation matrix.
   - Flow Connect API/realtime/attachment approach.
   - F&B order/payment/inventory state/service plan.
   - Test strategy and seed/reset plan.
   - P0/P1 scope and risk controls.
4. Stop for product-owner approval.
5. Bootstrap the application only after approval.

---

## 12. Final decision statement

> **Flow will be built as a secure, accountable operational platform. It will prove its value first through a complete Food & Beverage pack, enhanced by Flow Connect: internal, role-aware, work-context communication that is transparent about authorised administrative oversight and never bypasses operational controls.**
