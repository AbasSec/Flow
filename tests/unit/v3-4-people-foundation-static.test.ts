import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260709000100_v3_4_people_foundation.sql"),
  "utf8"
);

const service = readFileSync(
  join(process.cwd(), "lib", "services", "people.ts"),
  "utf8"
);

const actions = readFileSync(
  join(process.cwd(), "app", "app", "team", "actions.ts"),
  "utf8"
);

const page = readFileSync(
  join(process.cwd(), "app", "app", "team", "page.tsx"),
  "utf8"
);

const flowUi = readFileSync(
  join(process.cwd(), "components", "flow-ui.tsx"),
  "utf8"
);

const teamLoading = readFileSync(
  join(process.cwd(), "app", "app", "team", "loading.tsx"),
  "utf8"
);

// ── Migration: RPCs exist ─────────────────────────────────────────────────────

describe("V3.4 migration: RPCs present", () => {
  it("creates flow_v3_4_list_org_staff", () => {
    expect(migration).toContain(
      "create or replace function public.flow_v3_4_list_org_staff("
    );
  });

  it("creates flow_v3_4_add_member", () => {
    expect(migration).toContain(
      "create or replace function public.flow_v3_4_add_member("
    );
  });

  it("creates flow_v3_4_update_member_role", () => {
    expect(migration).toContain(
      "create or replace function public.flow_v3_4_update_member_role("
    );
  });

  it("creates flow_v3_4_assign_member_outlet", () => {
    expect(migration).toContain(
      "create or replace function public.flow_v3_4_assign_member_outlet("
    );
  });

  it("creates flow_v3_4_remove_member_outlet", () => {
    expect(migration).toContain(
      "create or replace function public.flow_v3_4_remove_member_outlet("
    );
  });

  it("creates flow_v3_4_assign_kitchen_station", () => {
    expect(migration).toContain(
      "create or replace function public.flow_v3_4_assign_kitchen_station("
    );
  });

  it("creates flow_v3_4_revoke_kitchen_station", () => {
    expect(migration).toContain(
      "create or replace function public.flow_v3_4_revoke_kitchen_station("
    );
  });

  it("creates flow_v3_4_deactivate_member", () => {
    expect(migration).toContain(
      "create or replace function public.flow_v3_4_deactivate_member("
    );
  });

  it("creates flow_v3_4_reactivate_member", () => {
    expect(migration).toContain(
      "create or replace function public.flow_v3_4_reactivate_member("
    );
  });
});

// ── Migration: security model ─────────────────────────────────────────────────

describe("V3.4 migration: security model", () => {
  const allRpcs = [
    "flow_v3_4_list_org_staff",
    "flow_v3_4_add_member",
    "flow_v3_4_update_member_role",
    "flow_v3_4_assign_member_outlet",
    "flow_v3_4_remove_member_outlet",
    "flow_v3_4_assign_kitchen_station",
    "flow_v3_4_revoke_kitchen_station",
    "flow_v3_4_deactivate_member",
    "flow_v3_4_reactivate_member"
  ];

  it("all RPCs use SECURITY DEFINER with safe search_path", () => {
    for (const rpc of allRpcs) {
      const idx = migration.indexOf(`create or replace function public.${rpc}`);
      expect(idx, `${rpc} not found`).toBeGreaterThan(-1);
      const body = migration.slice(idx, idx + 600);
      expect(body, `${rpc} missing security definer`).toContain("security definer");
      expect(body, `${rpc} missing safe search_path`).toContain(
        "set search_path = pg_catalog, pg_temp"
      );
    }
  });

  it("all RPCs use plpgsql", () => {
    for (const rpc of allRpcs) {
      const idx = migration.indexOf(`create or replace function public.${rpc}`);
      const body = migration.slice(idx, idx + 500);
      expect(body, `${rpc} missing language plpgsql`).toContain("language plpgsql");
    }
  });

  it("all mutation RPCs reject unauthenticated callers via auth.uid()", () => {
    expect(migration).toContain("actor_id uuid := auth.uid()");
    expect(migration).toContain("Authentication required");
  });

  it("deny-first grants: all RPCs revoke from public and anon, grant only to authenticated", () => {
    for (const rpc of allRpcs) {
      expect(migration, `${rpc} missing revoke from public`).toContain(
        `revoke all on function public.${rpc}`
      );
      expect(migration, `${rpc} missing grant to authenticated`).toContain(
        `grant execute on function public.${rpc}`
      );
    }
    // No anon grants anywhere in the migration
    expect(migration).not.toContain("to anon");
  });
});

// ── Migration: role authority model ──────────────────────────────────────────

describe("V3.4 migration: role authority model", () => {
  it("list_org_staff allows manager via flow_m3_require_role", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_list_org_staff"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_add_member",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("'manager'");
    expect(body).toContain("flow_m3_require_role");
  });

  it("mutation RPCs restrict to owner/admin only — manager NOT in their allowed roles", () => {
    const mutationRpcs = [
      "flow_v3_4_add_member",
      "flow_v3_4_update_member_role",
      "flow_v3_4_assign_member_outlet",
      "flow_v3_4_remove_member_outlet",
      "flow_v3_4_assign_kitchen_station",
      "flow_v3_4_revoke_kitchen_station",
      "flow_v3_4_deactivate_member",
      "flow_v3_4_reactivate_member"
    ];

    for (const rpc of mutationRpcs) {
      const idx = migration.indexOf(`create or replace function public.${rpc}`);
      const nextFn = migration.indexOf("create or replace function public.", idx + 10);
      const body = migration.slice(idx, nextFn > 0 ? nextFn : idx + 2000);
      // Find the require_role call
      const requireIdx = body.indexOf("flow_m3_require_role");
      expect(requireIdx, `${rpc} missing flow_m3_require_role`).toBeGreaterThan(-1);
      const roleCallEnd = body.indexOf("]::public.org_role[]", requireIdx);
      const roleCall = body.slice(requireIdx, roleCallEnd);
      expect(roleCall, `${rpc} must not allow manager`).not.toContain("'manager'");
    }
  });

  // Correction 3: station RPCs use owner/admin only (manager removed)
  it("correction 3: assign_kitchen_station and revoke_kitchen_station do not allow manager", () => {
    for (const rpc of ["flow_v3_4_assign_kitchen_station", "flow_v3_4_revoke_kitchen_station"]) {
      const idx = migration.indexOf(`create or replace function public.${rpc}`);
      const nextFn = migration.indexOf("create or replace function public.", idx + 10);
      const body = migration.slice(idx, nextFn > 0 ? nextFn : idx + 3000);
      const requireIdx = body.indexOf("flow_m3_require_role");
      const roleCallEnd = body.indexOf("]::public.org_role[]", requireIdx);
      const roleCall = body.slice(requireIdx, roleCallEnd);
      expect(roleCall, `${rpc} must use owner/admin only (correction 3)`).toContain(
        "'organisation_owner'"
      );
      expect(roleCall, `${rpc} must use owner/admin only (correction 3)`).toContain(
        "'organisation_admin'"
      );
      expect(roleCall, `${rpc} must not include manager (correction 3)`).not.toContain(
        "'manager'"
      );
    }
  });

  // Correction 1: add_member assigns return value to actor_role variable
  it("correction 1: add_member assigns flow_m3_require_role return to actor_role", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_add_member"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_update_member_role",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("actor_role := public.flow_m3_require_role(");
    expect(body).not.toContain("perform public.flow_m3_require_role(");
  });

  it("admin ceiling: add_member rejects organisation_owner assignment by admin", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_add_member"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_update_member_role",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("actor_role = 'organisation_admin'");
    expect(body).toContain("'organisation_owner'");
    expect(body).toContain("42501");
  });

  it("lockout guard in update_member_role prevents last admin removal", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_update_member_role"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_assign_member_outlet",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("remaining_admins");
    expect(body).toContain("last active administrator");
  });

  it("lockout guard in deactivate_member prevents last admin removal", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_deactivate_member"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_reactivate_member",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("remaining_admins");
    expect(body).toContain("last active administrator");
  });

  it("no self-modification: update_member_role rejects when actor_id = target_user_id", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_update_member_role"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_assign_member_outlet",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("actor_id = target_user_id");
  });

  it("no self-deactivation: deactivate_member rejects when actor_id = target_user_id", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_deactivate_member"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_reactivate_member",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("actor_id = target_user_id");
  });
});

// ── Migration: station assignment rules ───────────────────────────────────────

describe("V3.4 migration: station assignment rules", () => {
  // Correction 2: target must have kitchen role, no owner/admin exception
  it("correction 2: assign_kitchen_station requires target to have kitchen role unconditionally", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_assign_kitchen_station"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_revoke_kitchen_station",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("'kitchen'");
    expect(body).toContain("Station assignments are only available for kitchen role staff");
  });

  it("assign_kitchen_station checks target has active outlet assignment", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_assign_kitchen_station"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_revoke_kitchen_station",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("Target staff member is not assigned to this outlet");
    expect(body).toContain("site_memberships");
  });

  it("assign_kitchen_station validates station belongs to the outlet and org", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_assign_kitchen_station"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_revoke_kitchen_station",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("Station does not belong to this outlet");
    expect(body).toContain("kitchen_stations");
  });

  it("assign_kitchen_station handles full unique constraint: clears revoked_at on re-assign", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_assign_kitchen_station"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_revoke_kitchen_station",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("revoked_at is null");
    expect(body).toContain("revoked_at = null");
  });
});

// ── Migration: org_memberships invariants ────────────────────────────────────

describe("V3.4 migration: org_memberships handling", () => {
  it("add_member looks up most recent deactivated row (partial unique index awareness)", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_add_member"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_update_member_role",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    // Must order by created_at desc to find most recent row when multiple deactivated rows exist
    expect(body).toContain("order by created_at desc");
    expect(body).toContain("limit 1");
  });

  it("add_member emits STAFF_MEMBER_REACTIVATED audit event when reactivating", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_add_member"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_update_member_role",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("STAFF_MEMBER_REACTIVATED");
  });

  it("deactivate_member cascades to site_memberships", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_deactivate_member"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_reactivate_member",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("site_memberships");
    expect(body).toContain("deactivated_at = now()");
  });

  it("reactivate_member does NOT restore site_memberships (stale assignment prevention)", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_reactivate_member"
    );
    // Get the body of just reactivate_member (until the grant block)
    const grantIdx = migration.indexOf(
      "revoke all on function public.flow_v3_4_list_org_staff",
      idx + 10
    );
    const body = migration.slice(idx, grantIdx > 0 ? grantIdx : idx + 3000);
    // Must NOT have a site_memberships UPDATE restoring rows
    expect(body).not.toContain("update public.site_memberships");
  });
});

// ── Migration: owner/admin outlet assignment no-op ────────────────────────────

describe("V3.4 migration: owner/admin outlet assignment no-op", () => {
  it("assign_member_outlet returns org_wide_access status for owner/admin targets without DB write", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_assign_member_outlet"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_remove_member_outlet",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("org_wide_access");
    expect(body).toContain("organisation_owner");
    expect(body).toContain("organisation_admin");
  });

  it("remove_member_outlet returns org_wide_access status for owner/admin targets", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_4_remove_member_outlet"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_assign_kitchen_station",
      idx + 10
    );
    const body = migration.slice(idx, nextFn);
    expect(body).toContain("org_wide_access");
  });
});

// ── Migration: audit events ───────────────────────────────────────────────────

describe("V3.4 migration: audit events", () => {
  // Correction 4: exact audit_events column names verified from migration 003
  it("correction 4: uses actor_user_id as the audit column name", () => {
    expect(migration).toContain("actor_user_id");
    // actor_user_id must appear in INSERT column lists (not just VALUES)
    expect(migration).toContain("actor_user_id, action");
  });

  it("uses object_type and object_id in audit inserts", () => {
    expect(migration).toContain("object_type");
    expect(migration).toContain("object_id");
  });

  it("uses before_data and after_data (not old_data/new_data)", () => {
    expect(migration).toContain("before_data");
    expect(migration).toContain("after_data");
    expect(migration).not.toContain("old_data");
    expect(migration).not.toContain("new_data");
  });

  it("emits all required audit action strings", () => {
    const auditActions = [
      "STAFF_MEMBER_ADDED",
      "STAFF_MEMBER_REACTIVATED",
      "STAFF_ROLE_UPDATED",
      "STAFF_OUTLET_ASSIGNED",
      "STAFF_OUTLET_REMOVED",
      "STAFF_STATION_ASSIGNED",
      "STAFF_STATION_REVOKED",
      "STAFF_MEMBER_DEACTIVATED"
    ];

    for (const action of auditActions) {
      expect(migration, `Missing audit action ${action}`).toContain(action);
    }
  });

  it("org_wide_access no-op paths do not write audit events", () => {
    // When owner/admin target detected in assign_member_outlet, the RPC returns early
    // before any audit insert. Verify the org_wide_access return happens BEFORE audit insert.
    const assignIdx = migration.indexOf(
      "create or replace function public.flow_v3_4_assign_member_outlet"
    );
    const nextFn = migration.indexOf(
      "create or replace function public.flow_v3_4_remove_member_outlet",
      assignIdx + 10
    );
    const body = migration.slice(assignIdx, nextFn);
    const noOpReturn = body.indexOf("org_wide_access");
    const auditInsert = body.indexOf("insert into public.audit_events");
    expect(noOpReturn, "org_wide_access return not found").toBeGreaterThan(-1);
    expect(auditInsert, "audit insert not found").toBeGreaterThan(-1);
    expect(noOpReturn, "org_wide_access return must come before audit insert").toBeLessThan(auditInsert);
  });
});

// ── Migration: non-regression ─────────────────────────────────────────────────

describe("V3.4 migration: non-regression", () => {
  it("does not modify flow_v3_1_* functions", () => {
    expect(migration).not.toContain("create or replace function public.flow_v3_1_");
  });

  it("does not modify flow_v3_3_* functions", () => {
    expect(migration).not.toContain("create or replace function public.flow_v3_3_");
  });

  it("does not modify flow_m3_* or flow_m4_* functions", () => {
    expect(migration).not.toContain("create or replace function public.flow_m3_");
    expect(migration).not.toContain("create or replace function public.flow_m4_");
  });

  it("does not create new tables (no new schema)", () => {
    expect(migration).not.toContain("create table");
  });

  it("does not alter existing table schemas", () => {
    expect(migration).not.toContain("alter table public.profiles");
    expect(migration).not.toContain("alter table public.org_memberships");
    expect(migration).not.toContain("alter table public.site_memberships");
    expect(migration).not.toContain("alter table public.kitchen_station_memberships");
    expect(migration).not.toContain("alter table public.audit_events");
  });

  it("does not use hard deletes (no DELETE statements)", () => {
    expect(migration.toLowerCase()).not.toContain("delete from public.");
  });

  it("does not claim email invitation functionality", () => {
    expect(migration.toLowerCase()).not.toContain("send_email");
    expect(migration.toLowerCase()).not.toContain("invite");
    expect(migration.toLowerCase()).not.toContain("smtp");
  });
});

// ── Service layer ─────────────────────────────────────────────────────────────

describe("V3.4 service: people.ts", () => {
  it("imports server-only guard", () => {
    expect(service).toContain('import "server-only"');
  });

  it("exports TEAM_VISIBLE_ROLES with owner, admin, manager", () => {
    expect(service).toContain("TEAM_VISIBLE_ROLES");
    expect(service).toContain('"organisation_owner"');
    expect(service).toContain('"organisation_admin"');
    expect(service).toContain('"manager"');
  });

  it("exports TEAM_ADMIN_ROLES with owner and admin only", () => {
    expect(service).toContain("TEAM_ADMIN_ROLES");
    const idx = service.indexOf("TEAM_ADMIN_ROLES");
    const body = service.slice(idx, idx + 200);
    expect(body).not.toContain('"manager"');
  });

  it("uses createSupabaseServerClient for RPC calls", () => {
    expect(service).toContain("createSupabaseServerClient");
  });

  it("wraps all operations in ServiceResult", () => {
    expect(service).toContain("ok: true");
    expect(service).toContain("ok: false");
  });

  it("exports getOrgStaff for read access", () => {
    expect(service).toContain("export async function getOrgStaff");
  });

  it("enforces TEAM_VISIBLE_ROLES guard in getOrgStaff", () => {
    const idx = service.indexOf("export async function getOrgStaff");
    const nextFn = service.indexOf("export async function", idx + 10);
    const body = service.slice(idx, nextFn > 0 ? nextFn : idx + 1000);
    expect(body).toContain("TEAM_VISIBLE_ROLES");
    expect(body).toContain("roleIn");
    expect(body).toContain("forbidden");
  });

  it("exports all mutation service functions", () => {
    expect(service).toContain("export async function addOrgMember");
    expect(service).toContain("export async function updateOrgMemberRole");
    expect(service).toContain("export async function assignMemberOutlet");
    expect(service).toContain("export async function removeMemberOutlet");
    expect(service).toContain("export async function assignKitchenStation");
    expect(service).toContain("export async function revokeKitchenStation");
    expect(service).toContain("export async function deactivateOrgMember");
    expect(service).toContain("export async function reactivateOrgMember");
  });

  it("calls correct V3.4 RPC names", () => {
    expect(service).toContain('"flow_v3_4_list_org_staff"');
    expect(service).toContain('"flow_v3_4_add_member"');
    expect(service).toContain('"flow_v3_4_update_member_role"');
    expect(service).toContain('"flow_v3_4_assign_member_outlet"');
    expect(service).toContain('"flow_v3_4_remove_member_outlet"');
    expect(service).toContain('"flow_v3_4_assign_kitchen_station"');
    expect(service).toContain('"flow_v3_4_revoke_kitchen_station"');
    expect(service).toContain('"flow_v3_4_deactivate_member"');
    expect(service).toContain('"flow_v3_4_reactivate_member"');
  });

  it("exports Zod schemas for all mutations", () => {
    expect(service).toContain("export const addMemberSchema");
    expect(service).toContain("export const updateMemberRoleSchema");
    expect(service).toContain("export const assignOutletSchema");
    expect(service).toContain("export const removeOutletSchema");
    expect(service).toContain("export const assignStationSchema");
    expect(service).toContain("export const revokeStationSchema");
    expect(service).toContain("export const deactivateMemberSchema");
    expect(service).toContain("export const reactivateMemberSchema");
  });

  it("addMemberSchema validates email field", () => {
    expect(service).toContain("z.string().email(");
  });
});

// ── Server actions ────────────────────────────────────────────────────────────

describe("V3.4 actions: app/app/team/actions.ts", () => {
  it("is a server module", () => {
    expect(actions).toContain('"use server"');
  });

  it("revalidates /app/team after every mutation", () => {
    const count = (actions.match(/revalidatePath\("\/app\/team"\)/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(8);
  });

  it("exports all required action functions", () => {
    expect(actions).toContain("export async function addMemberAction");
    expect(actions).toContain("export async function updateMemberRoleAction");
    expect(actions).toContain("export async function assignOutletAction");
    expect(actions).toContain("export async function removeOutletAction");
    expect(actions).toContain("export async function assignStationAction");
    expect(actions).toContain("export async function revokeStationAction");
    expect(actions).toContain("export async function deactivateMemberAction");
    expect(actions).toContain("export async function reactivateMemberAction");
  });
});

// ── Page ──────────────────────────────────────────────────────────────────────

describe("V3.4 page: app/app/team/page.tsx", () => {
  it("is force-dynamic", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });

  it("calls requireWorkspaceContext", () => {
    expect(page).toContain("requireWorkspaceContext");
  });

  it("enforces TEAM_VISIBLE_ROLES guard before rendering roster", () => {
    expect(page).toContain("TEAM_VISIBLE_ROLES");
    expect(page).toContain("roleIn(context.role, TEAM_VISIBLE_ROLES)");
  });

  it("gates mutation forms on canEdit (owner/admin only)", () => {
    expect(page).toContain("TEAM_ADMIN_ROLES");
    expect(page).toContain("canEdit");
  });

  it("shows forbidden panel for operational roles", () => {
    expect(page).toContain("Forbidden");
    expect(page).toContain("forbidden");
  });

  it("displays add member form with email input and role select", () => {
    expect(page).toContain("addMemberAction");
    expect(page).toContain('type="email"');
  });

  it("renders deactivate and reactivate controls", () => {
    expect(page).toContain("deactivateMemberAction");
    expect(page).toContain("reactivateMemberAction");
    expect(page).toContain("Deactivate");
    expect(page).toContain("Reactivate");
  });

  it("renders outlet assign and remove controls", () => {
    expect(page).toContain("assignOutletAction");
    expect(page).toContain("removeOutletAction");
  });

  it("renders station assign and revoke controls", () => {
    expect(page).toContain("assignStationAction");
    expect(page).toContain("revokeStationAction");
  });

  it("scoped view notice shown when roster is scoped", () => {
    expect(page).toContain("scoped");
    expect(page).toContain("no_outlet_assignment");
  });

  it("does not falsely claim email invitation functionality", () => {
    // These would be false claims; a truthful disclaimer ("no invitation email is sent") is permitted
    expect(page.toLowerCase()).not.toContain("invitation sent");
    expect(page.toLowerCase()).not.toContain("send invitation");
    expect(page.toLowerCase()).not.toContain("invite email");
  });

  it("truthfulness: states no invitation email is sent", () => {
    expect(page).toContain("no invitation email is sent");
  });
});

// ── Navigation ────────────────────────────────────────────────────────────────

describe("V3.4 navigation: flow-ui.tsx", () => {
  it("adds TEAM_VISIBLE_ROLES constant with owner, admin, manager", () => {
    expect(flowUi).toContain("TEAM_VISIBLE_ROLES");
    const idx = flowUi.indexOf("TEAM_VISIBLE_ROLES");
    const body = flowUi.slice(idx, idx + 200);
    expect(body).toContain('"organisation_owner"');
    expect(body).toContain('"organisation_admin"');
    expect(body).toContain('"manager"');
  });

  it("adds Team nav link conditionally for management roles", () => {
    expect(flowUi).toContain("showTeam");
    expect(flowUi).toContain('href="/app/team"');
    expect(flowUi).toContain("Team");
  });

  it("adds reserveTeamSlot prop to AppShell", () => {
    expect(flowUi).toContain("reserveTeamSlot");
    expect(flowUi).toContain("TeamNavPlaceholder");
    expect(flowUi).toContain("showTeamPlaceholder");
  });

  it("Team nav is role-gated: only shown when showTeam is true", () => {
    expect(flowUi).toContain("TEAM_VISIBLE_ROLES.has(role)");
    const teamLinkIdx = flowUi.indexOf('href="/app/team"');
    expect(teamLinkIdx, "/app/team href not found").toBeGreaterThan(-1);
    const surroundingCode = flowUi.slice(teamLinkIdx - 200, teamLinkIdx + 50);
    expect(surroundingCode).toContain("showTeam");
  });

  it("Team placeholder is non-clickable (span element, not Link)", () => {
    const fnStart = flowUi.indexOf("function TeamNavPlaceholder");
    expect(fnStart, "TeamNavPlaceholder not found").toBeGreaterThan(-1);
    const fnBody = flowUi.slice(fnStart, fnStart + 400);
    expect(fnBody).not.toContain("href");
    expect(fnBody).not.toContain("<Link");
    expect(fnBody).not.toContain("<a ");
  });

  it("does not expose Team link to cashier, waiter, kitchen, storekeeper", () => {
    const teamRolesIdx = flowUi.indexOf("TEAM_VISIBLE_ROLES");
    const body = flowUi.slice(teamRolesIdx, teamRolesIdx + 200);
    expect(body).not.toContain('"cashier"');
    expect(body).not.toContain('"waiter"');
    expect(body).not.toContain('"kitchen"');
    expect(body).not.toContain('"storekeeper"');
  });

  it("does not modify COUNTER_VISIBLE_ROLES or MENU_VISIBLE_ROLES", () => {
    expect(flowUi).toContain("COUNTER_VISIBLE_ROLES");
    expect(flowUi).toContain("MENU_VISIBLE_ROLES");
    expect(flowUi).toContain('"cashier"');
  });
});

// ── Loading ───────────────────────────────────────────────────────────────────

describe("V3.4 loading: app/app/team/loading.tsx", () => {
  it("renders AppShell with reserveTeamSlot", () => {
    expect(teamLoading).toContain("reserveTeamSlot");
  });

  it("renders AppShell with reserveCounterSlot and reserveMenuSlot for nav consistency", () => {
    expect(teamLoading).toContain("reserveCounterSlot");
    expect(teamLoading).toContain("reserveMenuSlot");
  });
});
