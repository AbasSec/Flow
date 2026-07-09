# V3.4 People Foundation — Implementation Report

**Branch:** feat/v3-4-people-foundation  
**Date:** 2026-07-09  
**Author:** AbasSec  
**Status:** Complete

---

## Scope

V3.4 adds a protected `/app/team` workspace for controlled staff/member management.  
No new database tables were created. All sensitive writes go through SECURITY DEFINER RPCs.

---

## Files Changed

| File | Type | Description |
|---|---|---|
| `supabase/migrations/20260709000100_v3_4_people_foundation.sql` | New | 9 SECURITY DEFINER RPCs for staff management |
| `lib/services/people.ts` | New | TypeScript service layer with Zod schemas and ServiceResult wrappers |
| `app/app/team/page.tsx` | New | Protected `/app/team` server component with role-gated roster |
| `app/app/team/actions.ts` | New | Server actions for all 8 mutations, each revalidates `/app/team` |
| `app/app/team/loading.tsx` | New | Loading skeleton with nav slot reservation |
| `components/flow-ui.tsx` | Modified (additive) | Added TEAM_VISIBLE_ROLES, reserveTeamSlot, TeamNavPlaceholder, Team nav link |
| `tests/unit/v3-4-people-foundation-static.test.ts` | New | 60+ static assertions across migration, service, actions, page, and nav |
| `docs/superpowers/specs/2026-07-09-v3-4-people-foundation-design.md` | New | Approved design spec |

---

## Pre-Implementation Corrections Applied

The owner reviewed the draft spec on 2026-07-09 and required 5 corrections before implementation began. All 5 are confirmed applied:

### Correction 1 — actor_role assignment bug in add_member

**Problem:** Draft spec used `perform public.flow_m3_require_role(...)` in RPC 2, discarding the return value. The `actor_role` variable would be uninitialised, making the admin-ceiling check silently unreachable.

**Fix applied:** Changed to `actor_role := public.flow_m3_require_role(...)`. The returned `org_role` enum value is now bound to `actor_role` and the ceiling check (`actor_role = 'organisation_admin' AND new_role = 'organisation_owner' → raise exception`) executes correctly.

**Verified by:** Static test `correction 1: add_member assigns flow_m3_require_role return to actor_role` asserts the `actor_role :=` form is present and `perform public.flow_m3_require_role(` is absent inside the function body.

---

### Correction 2 — Station assignment target rule (no owner/admin exception)

**Problem:** Draft spec included an exception where owner/admin targets could bypass the kitchen-role check for station assignments.

**Fix applied:** The target's kitchen-role check is unconditional. Any target whose `org_role <> 'kitchen'` raises `42501 — Station assignments are only available for kitchen role staff.` regardless of their role level. Additionally, the target must have an active site_membership for the outlet in question.

**Verified by:** Static test `correction 2: assign_kitchen_station requires target to have kitchen role unconditionally`.

---

### Correction 3 — Manager removed from station write RPCs

**Problem:** Draft spec allowed manager to call `flow_v3_4_assign_kitchen_station` and `flow_v3_4_revoke_kitchen_station`, contradicting the UI spec where manager has no mutation controls in V3.4.

**Fix applied:** Both station RPCs restrict allowed callers to `['organisation_owner','organisation_admin']` only. Manager station-write capability is deferred to V3.4.1/V3.5.

**Verified by:** Static test `correction 3: assign_kitchen_station and revoke_kitchen_station do not allow manager` asserts `'manager'` is absent from the `flow_m3_require_role` call inside both functions.

---

### Correction 4 — Audit table column names verified

**Problem:** Draft spec used assumed column names for `audit_events`. Required verification of exact schema from the migration.

**Fix applied:** Exact column names confirmed from `20260702000300_audit_outbox.sql`:
- `actor_user_id` (not `actor_id`)
- `object_type`, `object_id`
- `before_data`, `after_data` (not `old_data`/`new_data`)
- `org_id`, `outlet_id`, `action`

All 8 audit inserts in the migration use this exact schema.

**Verified by:** Static tests `correction 4: uses actor_user_id`, `uses object_type and object_id`, `uses before_data and after_data`.

---

### Correction 5 — org_memberships unique constraint wording

**Problem:** Draft spec assumed an exact named constraint on `org_memberships`. Required verification that the actual constraint is a partial unique index.

**Fix applied:** Confirmed from `20260702000200_identity_tenancy_rls.sql`: the constraint is a partial unique index `(org_id, user_id) WHERE deactivated_at IS NULL`, allowing multiple inactive rows per user/org with at most one active row. All RPC logic uses `ORDER BY created_at DESC LIMIT 1` when searching for existing deactivated rows, correctly respecting this invariant.

**Verified by:** Static test `add_member looks up most recent deactivated row (partial unique index awareness)` asserts `order by created_at desc` and `limit 1` in the function body.

---

## Schema Used (No New Tables)

| Table | Purpose in V3.4 |
|---|---|
| `public.profiles` | Email lookup for add_member; name display |
| `public.org_memberships` | Org-level role management; partial unique index respected |
| `public.site_memberships` | Outlet-level access assignment; cascade on deactivate |
| `public.kitchen_station_memberships` | Station assignment; full unique constraint; revoked_at toggle |
| `public.kitchen_stations` | Station validation in assign/revoke RPCs |
| `public.outlets` | Outlet validation and site_id resolution |
| `public.audit_events` | Immutable audit log for every write |

---

## RPCs Implemented (9 total)

All RPCs: `SECURITY DEFINER`, `language plpgsql`, `set search_path = pg_catalog, pg_temp`, `auth.uid()` null check, schema-qualified table references.

| RPC | Caller roles | Purpose |
|---|---|---|
| `flow_v3_4_list_org_staff` | owner, admin, manager | Read-only roster; manager path fail-closed |
| `flow_v3_4_add_member` | owner, admin | Link existing profile to org by email |
| `flow_v3_4_update_member_role` | owner, admin | Change org role with lockout guard |
| `flow_v3_4_assign_member_outlet` | owner, admin | Assign outlet via site_memberships |
| `flow_v3_4_remove_member_outlet` | owner, admin | Remove outlet assignment |
| `flow_v3_4_assign_kitchen_station` | owner, admin | Assign kitchen staff to station |
| `flow_v3_4_revoke_kitchen_station` | owner, admin | Revoke station assignment |
| `flow_v3_4_deactivate_member` | owner, admin | Soft-deactivate with cascade |
| `flow_v3_4_reactivate_member` | owner, admin | Restore deactivated membership |

---

## Permission Matrix

| Action | Owner | Admin | Manager | Others |
|---|:---:|:---:|:---:|:---:|
| View `/app/team` | ✓ | ✓ | ✓ (scoped) | Forbidden |
| See member emails | ✓ | ✓ | — | — |
| Add member | ✓ | ✓† | — | — |
| Change role | ✓ | ✓† | — | — |
| Assign outlet | ✓ | ✓ | — | — |
| Remove outlet | ✓ | ✓ | — | — |
| Assign station | ✓ | ✓ | — | — |
| Revoke station | ✓ | ✓ | — | — |
| Deactivate member | ✓ | ✓† | — | — |
| Reactivate member | ✓ | ✓†† | — | — |

† Admin cannot assign/modify/deactivate organisation_owner accounts.  
†† Admin cannot reactivate an organisation_owner.

---

## Security Properties

- **No self-privilege escalation**: `update_member_role` and `deactivate_member` reject `actor_id = target_user_id`.
- **Admin ceiling**: Admin cannot assign the Owner role, modify Owner accounts, or deactivate/reactivate Owners.
- **Lockout guard**: `update_member_role` and `deactivate_member` reject if the action would leave zero active admins/owners.
- **Tenant isolation**: All RPCs filter by `org_id`; outlets and stations verified to belong to the org before use.
- **No cross-tenant leakage**: `flow_m3_require_role` enforces org membership before any data access.
- **No anon grants**: All grants are `to authenticated` only; anon is explicitly revoked.
- **Deny-first**: All 9 RPCs follow the revoke-public → revoke-anon → grant-authenticated pattern.

---

## Truthfulness Guarantees

- **No invitation emails**: `add_member` links an existing Flow profile by email. No SMTP call, no invitation token, no external service. The UI page states: *"no invitation email is sent."*
- **No payroll, HR, attendance, biometrics, or surveillance**: V3.4 manages org/outlet/station role assignments only.
- **No fake AI, predictions, or notifications**: Feature is deterministic staff access control with no ML or push components.
- **Manager scope fail-closed**: If a manager has no active site_memberships, the roster returns `{members: [], scoped: true, reason: 'no_outlet_assignment'}` — never falls back to full org view.

---

## Non-Regression Guarantees

- `flow_v3_1_*`, `flow_v3_3_*`, `flow_m3_*`, `flow_m4_*` functions: not modified.
- No existing table schemas altered.
- No `DELETE` statements — all deactivations use soft-delete (`deactivated_at = now()`).
- `flow-ui.tsx` changes are purely additive (new const, new prop, new component, new nav link).
- QR token values not modified; order lifecycle not touched; payment/settlement not touched.
- Vercel config, Supabase secrets, and environment files not touched.
- Untracked files (`APPLY_FLOW_DOCS_V2.sh`, `DOCUMENT_UPDATE_SUMMARY.md`, `SHA256SUMS.txt`, `docs/superpowers/`) not modified.

---

## Audit Events Written

| Action string | Written by |
|---|---|
| `STAFF_MEMBER_ADDED` | `flow_v3_4_add_member` (new row) |
| `STAFF_MEMBER_REACTIVATED` | `flow_v3_4_add_member` (reactivation path) and `flow_v3_4_reactivate_member` |
| `STAFF_ROLE_UPDATED` | `flow_v3_4_update_member_role` |
| `STAFF_OUTLET_ASSIGNED` | `flow_v3_4_assign_member_outlet` |
| `STAFF_OUTLET_REMOVED` | `flow_v3_4_remove_member_outlet` |
| `STAFF_STATION_ASSIGNED` | `flow_v3_4_assign_kitchen_station` |
| `STAFF_STATION_REVOKED` | `flow_v3_4_revoke_kitchen_station` |
| `STAFF_MEMBER_DEACTIVATED` | `flow_v3_4_deactivate_member` |

Owner/admin-target no-ops (`org_wide_access`) in outlet assignment RPCs write **no** audit event.

---

## Design Decisions

**Why manager fail-closed rather than fallback?**  
A manager with no outlet assignment should see nothing rather than accidentally seeing the full org roster. The fail-closed rule prevents inadvertent data exposure from misconfigured state.

**Why site_memberships not restored on reactivate?**  
Restoring stale site_memberships could give a reactivated member outlet access they should no longer have. Admin must explicitly re-assign outlets after reactivation.

**Why no new tables?**  
The existing schema (`org_memberships`, `site_memberships`, `kitchen_station_memberships`) fully supports staff management scope without schema expansion. Adding tables would require additional RLS policies, migrations, and non-regression surface area.
