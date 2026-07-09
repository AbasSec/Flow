---
name: v3-4-people-foundation-design
description: Approved design spec for V3.4 People Foundation — controlled staff/member management using existing schema, 9 SECURITY DEFINER RPCs, /app/team UI, and role-scoped access
metadata:
  type: project
---

# V3.4 People Foundation — Design Spec

**Branch:** feat/v3-4-people-foundation
**Approved:** 2026-07-09
**Corrections applied:** 5 (actor_role bug fix, station target rules, manager write removal, audit schema verified, constraint verified)

## Schema used (no new tables)

| Table | Purpose |
|---|---|
| `public.profiles` | Identity: email, full_name, is_active |
| `public.org_memberships` | Org-level role + deactivated_at (partial unique index) |
| `public.site_memberships` | Outlet-level assignment + deactivated_at |
| `public.kitchen_station_memberships` | Station assignment + revoked_at (full unique constraint) |
| `public.audit_events` | Immutable audit log |
| `public.kitchen_stations` | Station definitions with org_id + outlet_id |

## RPCs (9 total, all SECURITY DEFINER, search_path = pg_catalog pg_temp)

1. `flow_v3_4_list_org_staff(target_org_id)` — read, owner/admin/manager; manager fail-closed
2. `flow_v3_4_add_member(target_org_id, target_email, new_role)` — owner/admin; email normalised; no invitation
3. `flow_v3_4_update_member_role(target_org_id, target_user_id, new_role)` — owner/admin; lockout guard
4. `flow_v3_4_assign_member_outlet(target_org_id, target_user_id, target_outlet_id)` — owner/admin; no-op for owner/admin targets
5. `flow_v3_4_remove_member_outlet(target_org_id, target_user_id, target_outlet_id)` — owner/admin; no-op for owner/admin targets
6. `flow_v3_4_assign_kitchen_station(target_org_id, target_outlet_id, target_station_id, target_user_id)` — owner/admin only (correction 3); target must have kitchen role
7. `flow_v3_4_revoke_kitchen_station(target_org_id, target_outlet_id, target_station_id, target_user_id)` — owner/admin only (correction 3)
8. `flow_v3_4_deactivate_member(target_org_id, target_user_id)` — owner/admin; lockout guard; cascade site_memberships
9. `flow_v3_4_reactivate_member(target_org_id, target_user_id)` — owner/admin; admin cannot restore owner

## Permission matrix

| Action | Owner | Admin | Manager | Others |
|---|:---:|:---:|:---:|:---:|
| View Team page | ✓ | ✓ | ✓ (scoped, no email) | ✗ |
| Add member | ✓ | ✓ | ✗ | ✗ |
| Change role | ✓ | ✓† | ✗ | ✗ |
| Assign outlet | ✓ | ✓ | ✗ | ✗ |
| Remove outlet | ✓ | ✓ | ✗ | ✗ |
| Assign station | ✓ | ✓ | ✗ | ✗ |
| Revoke station | ✓ | ✓ | ✗ | ✗ |
| Deactivate | ✓ | ✓† | ✗ | ✗ |
| Reactivate | ✓ | ✓†† | ✗ | ✗ |

† Admin cannot touch organisation_owner members or leave zero active admins.
†† Admin cannot reactivate organisation_owner.

## Audit events

STAFF_MEMBER_ADDED, STAFF_MEMBER_REACTIVATED, STAFF_ROLE_UPDATED,
STAFF_OUTLET_ASSIGNED, STAFF_OUTLET_REMOVED,
STAFF_STATION_ASSIGNED, STAFF_STATION_REVOKED,
STAFF_MEMBER_DEACTIVATED

## Files

- `supabase/migrations/20260709000100_v3_4_people_foundation.sql`
- `lib/services/people.ts`
- `app/app/team/page.tsx`
- `app/app/team/actions.ts`
- `app/app/team/loading.tsx`
- `components/flow-ui.tsx` (additive only)
- `tests/unit/v3-4-people-foundation-static.test.ts`
- `docs/V3_4_PEOPLE_FOUNDATION_REPORT.md`
