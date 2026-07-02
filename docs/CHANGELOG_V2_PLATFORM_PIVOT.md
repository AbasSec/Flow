# Flow v2 Documentation Change Log

## Why this update exists

The original Flow PRD was a Food & Beverage operational-control system. The product owner approved a controlled expansion that adds:

- A reusable **Flow Core**.
- **Flow Connect**, an internal operational communication layer.
- An explicit **Platform Super Admin** and **Organisation Admin** model.
- Transparent, audited access for authorised Organisation Admins to Direct Work Conversations.
- A future industry-pack architecture while preserving Food & Beverage as the first fully implemented proof.

## Required file changes

| File | Required change |
|---|---|
| `docs/FLOW_PRD_IMPLEMENTATION.md` | Replace with the v2 full PRD. |
| `docs/FLOW_DECISION_LOCK_V2.md` | Add as the authoritative Decision Lock. |
| `docs/FLOW_DECISION_LOCK_V1.md` | Preserve as historical context; v2 overrides it where conflicts occur. |
| `docs/FLOW_MASTER_CONVERSATION_SOURCE_OF_TRUTH.md` | Replace with updated v2 source. |
| `AGENTS.md` | Replace with v2 agent guardrails. |
| `CLAUDE.md` | Replace with v2 Claude instructions. |
| `README.md` | Replace with updated product identity/document order. |

## Important product changes

1. Flow is positioned as **Core + industry packs**, not Food-only.
2. F&B remains the only competition pack to build.
3. Internal “public group” is clarified as an **Organisation Hub** available only to active registered employees.
4. DMs are named **Direct Work Conversations**, with a clear company-managed notice.
5. Organisation Owner/Admin review access is permitted only with explicit permission, reason capture, and immutable audit.
6. Platform Super Admin has no default ability to read tenant chats.
7. Work-item threads are a first-class product feature.
8. Messages cannot bypass formal orders, stock changes, payments, approvals, or audit controls.
9. P0 includes minimal Flow Connect foundation but not chat polish; P1 contains mentions, search, attachments, structured handovers, and incident rooms.

## Migration note

No database/application code exists yet. This is the correct time to adopt the v2 schema model before initial migrations are created.
