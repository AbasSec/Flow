# CLAUDE.md — Flow

Read and follow `AGENTS.md` first.

## Required source order

1. `docs/FLOW_DECISION_LOCK_V3.md`
2. `docs/FLOW_PRD_V3.md`
3. `docs/FLOW_V3_IMPLEMENTATION_ROADMAP.md`
4. `docs/FLOW_V3_TRANSITION_AND_GAP_REPORT.md`
5. `docs/FLOW_V3_REQUIREMENTS_TRACEABILITY.md`
6. `docs/FLOW_DECISION_LOCK_V2.md` and older planning documents as historical context only
7. `docs/FLOW_MASTER_CONVERSATION_SOURCE_OF_TRUTH.md`
8. `AGENTS.md`

## Core reminder

Flow is a secure operational-control platform. Food & Beverage is the first complete competition pack. Flow Connect is internal, role-aware, company-managed operational communication — not public social media and not private end-to-end encrypted DM.

## Mandatory constraints

- No app scaffold or feature implementation before an approved planning-only `docs/IMPLEMENTATION_PLAN.md`.
- Do not let messages bypass order, payment, stock, approval, task, ticket, or audit workflows.
- Enforce tenant/role/permission access using both RLS and server-side services.
- Direct Work Conversation review requires the explicit `communication.audit.review` permission, a reason, and immutable audit evidence.
- Platform Super Admin has no default tenant-content access.
- Preserve F&B payment, inventory, state-machine, and audit rules exactly as locked.
