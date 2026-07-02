# CLAUDE.md — Flow

Read and follow `AGENTS.md` first.

## Required source order

1. `docs/FLOW_DECISION_LOCK_V2.md`
2. `docs/FLOW_PRD_IMPLEMENTATION.md`
3. `docs/FLOW_MASTER_CONVERSATION_SOURCE_OF_TRUTH.md`
4. `AGENTS.md`

## Core reminder

Flow is a secure operational-control platform. Food & Beverage is the first complete competition pack. Flow Connect is internal, role-aware, company-managed operational communication — not public social media and not private end-to-end encrypted DM.

## Mandatory constraints

- No app scaffold or feature implementation before an approved planning-only `docs/IMPLEMENTATION_PLAN.md`.
- Do not let messages bypass order, payment, stock, approval, task, ticket, or audit workflows.
- Enforce tenant/role/permission access using both RLS and server-side services.
- Direct Work Conversation review requires the explicit `communication.audit.review` permission, a reason, and immutable audit evidence.
- Platform Super Admin has no default tenant-content access.
- Preserve F&B payment, inventory, state-machine, and audit rules exactly as locked.
