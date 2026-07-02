# Flow

Flow is a secure operational-control platform. Food & Beverage is the first competition-facing industry pack, but this repository is currently at **Milestone 1: Bootstrap and Guardrails** only.

## Current Status

The project contains a baseline Next.js App Router application shell, strict TypeScript, Tailwind CSS, ESLint, Vitest, safe environment validation utilities, and Supabase client factory placeholders.

No Supabase project or business modules are configured yet. There is no database schema, RLS policy, authentication flow, platform admin implementation, Flow Connect implementation, order flow, payment integration, kitchen workflow, QR flow, inventory module, reporting surface, seed data, deployment, Docker setup, or CI/CD pipeline.

## Prerequisites

- Node.js 24 or newer.
- Corepack enabled for pnpm.
- pnpm 10.x.

If pnpm is unavailable, enable it through Corepack:

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
```

## Installation

```bash
pnpm install
```

## Environment Setup

Create a local environment file from the placeholder template:

```bash
cp .env.example .env.local
```

Keep placeholder values empty until a later approved milestone configures the relevant service. Server-only secrets such as `SUPABASE_SECRET_KEY` must never be exposed to browser code.

## Development Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Documentation Order

Read the project documents in this order before implementation work:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/FLOW_DECISION_LOCK_V2.md`
4. `docs/FLOW_PRD_IMPLEMENTATION.md`
5. `docs/FLOW_MASTER_CONVERSATION_SOURCE_OF_TRUTH.md`
6. `docs/IMPLEMENTATION_PLAN.md`

## Milestone Boundary

Milestone 1 only establishes bootstrap guardrails. Milestone 2 must be approved before any schema, RLS, authentication, tenant, role, or business-domain implementation begins.
