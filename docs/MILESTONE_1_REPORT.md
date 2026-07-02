# Milestone 1 Report - Bootstrap and Guardrails

## Scope Completed

- Bootstrapped the existing repository root as a Next.js App Router project without a `src/` directory.
- Preserved existing documentation and updated only `README.md` for Milestone 1 usage instructions.
- Added strict TypeScript, Tailwind CSS, ESLint, Vitest, Testing Library setup, and baseline scripts.
- Added neutral bootstrap page only: `Flow - Bootstrap Complete`.
- Added safe environment validation utilities that tolerate empty local placeholders.
- Added Supabase browser/server client factory placeholders only.
- Added the approved baseline directory structure for later milestones.
- Added one non-domain smoke test proving the test harness works.

## Files Created or Changed

Changed:

- `README.md`

Created:

- `.env.example`
- `.gitignore`
- `app/globals.css`
- `app/layout.tsx`
- `app/page.tsx`
- `components/.gitkeep`
- `docs/MILESTONE_1_REPORT.md`
- `eslint.config.mjs`
- `lib/auth/.gitkeep`
- `lib/db/browser.ts`
- `lib/db/server.ts`
- `lib/integrations/.gitkeep`
- `lib/realtime/.gitkeep`
- `lib/services/.gitkeep`
- `lib/validation/env.ts`
- `next-env.d.ts`
- `package.json`
- `pnpm-lock.yaml`
- `postcss.config.mjs`
- `supabase/functions/.gitkeep`
- `supabase/migrations/.gitkeep`
- `tests/e2e/.gitkeep`
- `tests/integration/.gitkeep`
- `tests/unit/setup.ts`
- `tests/unit/smoke.test.ts`
- `tsconfig.json`
- `vitest.config.ts`

## Dependency Choices

Runtime:

- `next`, `react`, `react-dom` for the App Router baseline.
- `@supabase/supabase-js` and `@supabase/ssr` for later browser/server client wiring.
- `zod` for environment validation.
- `server-only` to keep server Supabase placeholder code out of client bundles.

Development:

- `typescript` with strict mode.
- `eslint` and `eslint-config-next` for linting.
- `tailwindcss`, `@tailwindcss/postcss`, and `postcss` for styling.
- `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, and `@testing-library/user-event` for the baseline test harness.

No payment, AI, realtime-domain, chart, QR, editor, attachment, or chat-specific packages were added.

## Server and Client Secret Boundaries

- `.env.example` contains empty placeholders only.
- Browser-safe values are limited to `NEXT_PUBLIC_*` variables.
- `SUPABASE_SECRET_KEY` is server-only.
- `lib/db/server.ts` imports `server-only` and returns `null` when required Supabase server config is absent.
- `lib/db/browser.ts` is marked `"use client"` and uses only browser-safe Supabase variables.
- Environment helpers validate shape without requiring real credentials, so production build passes before Supabase setup.

## Commands Run and Outcomes

Setup:

- `corepack enable && corepack prepare pnpm@10.14.0 --activate && pnpm --version` - passed, activated pnpm `10.14.0`.
- `pnpm add next react react-dom @supabase/supabase-js @supabase/ssr zod server-only` - passed.
- `pnpm add -D typescript eslint eslint-config-next @eslint/eslintrc tailwindcss @tailwindcss/postcss postcss vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/node @types/react @types/react-dom` - passed.
- `pnpm add -D eslint@^9` - passed, corrected ESLint peer compatibility.
- `pnpm remove @eslint/eslintrc` - passed after switching to Next flat config exports.
- `pnpm add -D typescript@^5.9` - passed, aligned TypeScript with the supported Next toolchain.

Validation:

- `pnpm lint` - passed.
- `pnpm typecheck` - passed.
- `pnpm test` - passed, 1 test file and 1 test.
- `pnpm build` - passed without real credentials.
- `git diff --check` - passed before and after this report was created.
- `git status --short` - showed the expected Milestone 1 file changes plus pre-existing untracked `*:Zone.Identifier` sidecar files.

Notes:

- pnpm reported ignored build scripts for `sharp` and `unrs-resolver`; no approval was granted because Milestone 1 does not require native build scripts.
- The first lint/typecheck attempts exposed scaffold configuration issues; they were corrected before the final passing validation run.

## Known Limitations

- Supabase clients are placeholders and return `null` when configuration is absent.
- No local or cloud Supabase project is configured.
- No runtime data access exists.
- No product routes beyond the neutral `/` bootstrap page exist.
- No deployment, Docker, CI/CD, seed/reset, or business workflow is configured.

## Explicit Non-Implementation Confirmation

Milestone 1 did not implement:

- Database schema.
- Database migrations.
- RLS policies.
- RPCs.
- Seed data.
- Authentication flows.
- Platform admin implementation.
- Flow Connect rooms, messages, policy acknowledgements, review grants, or realtime business events.
- Orders, kitchen, payments, QR, inventory, reports, dashboard, approvals, or business UI.
- Billplz integration.
- AI integration.
- Deployment.
- Docker.
- CI/CD.
- Fake mock business workflows.

The later Milestone 2 schema convention remains locked: `sites.id` and `outlets.id` must be separate UUID primary keys; `outlets.site_id` must be a unique foreign key to `sites.id`; all F&B records reference `outlets.id` through `outlet_id`. No schema or migration work was created in Milestone 1.
