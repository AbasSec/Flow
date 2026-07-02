# Flow

> **Flow is a secure operational-control platform where organisations coordinate people, operational data, workflows, approvals, and internal work communication in one accountable workspace.**

## Current focus

**Flow for Food & Beverage** is the first complete, competition-facing industry pack. It will demonstrate:

```text
table / counter / QR / online order
→ valid payment or settlement
→ kitchen execution
→ recipe-led inventory truth
→ live operational visibility
→ manager-approved action
→ contextual Flow Connect communication and audit
```

## Flow Connect

Flow Connect is Flow’s internal operational communication layer:

- Organisation Hub and Team Rooms for active registered employees.
- Direct Work Conversations that are transparently company-managed.
- Conversations attached to orders, kitchen tickets, tasks, approvals, incidents, and stock issues.
- Authorised Organisation Owner/Admin review with reason and immutable audit record.
- No public social feed, no anonymous groups, and no default platform-admin access to tenant messages.

## Documentation

Read documents in this order:

1. [`docs/FLOW_DECISION_LOCK_V2.md`](docs/FLOW_DECISION_LOCK_V2.md)
2. [`docs/FLOW_PRD_IMPLEMENTATION.md`](docs/FLOW_PRD_IMPLEMENTATION.md)
3. [`docs/FLOW_MASTER_CONVERSATION_SOURCE_OF_TRUTH.md`](docs/FLOW_MASTER_CONVERSATION_SOURCE_OF_TRUTH.md)
4. [`AGENTS.md`](AGENTS.md)
5. [`CLAUDE.md`](CLAUDE.md)

## Current status

This repository is in the **planning stage**. Application code should not be created until the product owner approves `docs/IMPLEMENTATION_PLAN.md`.

## Next approved task

Create a planning-only implementation document that covers:

- Core/F&B schema and migration order.
- RLS, roles, permissions, and support-elevation design.
- Flow Connect rooms/messages/review/attachment/realtime model.
- F&B order, payment, kitchen, and inventory services.
- Tests, seed/reset, P0/P1 scope, and risks.

Then stop for approval.
