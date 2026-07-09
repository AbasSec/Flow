import "server-only";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  serviceError,
  type ServiceResult,
  type WorkspaceContext,
  roleIn
} from "@/lib/services/context";

// ── Role constants ─────────────────────────────────────────────────────────────

export const TEAM_VISIBLE_ROLES = [
  "organisation_owner",
  "organisation_admin",
  "manager"
] as const;

export const TEAM_ADMIN_ROLES = [
  "organisation_owner",
  "organisation_admin"
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

export type OrgRole =
  | "organisation_owner"
  | "organisation_admin"
  | "manager"
  | "cashier"
  | "waiter"
  | "kitchen"
  | "storekeeper";

export type OutletAssignment = {
  outletId: string;
  outletName: string;
  siteId: string;
  role: string;
};

export type StationAssignment = {
  stationId: string;
  stationName: string;
  outletId: string;
  isRevoked: boolean;
};

export type StaffMember = {
  userId: string;
  fullName: string | null;
  email: string | null;
  orgRole: OrgRole;
  isActive: boolean;
  outletAssignments: OutletAssignment[];
  stationAssignments: StationAssignment[];
};

export type StaffRoster = {
  members: StaffMember[];
  scoped: boolean;
  reason?: string;
};

// ── Zod schemas ────────────────────────────────────────────────────────────────

const orgRoleValues = [
  "organisation_owner",
  "organisation_admin",
  "manager",
  "cashier",
  "waiter",
  "kitchen",
  "storekeeper"
] as const;

export const addMemberSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().email("A valid email address is required."),
  role: z.enum(orgRoleValues)
});

export const updateMemberRoleSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(orgRoleValues)
});

export const assignOutletSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  outletId: z.string().uuid()
});

export const removeOutletSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  outletId: z.string().uuid()
});

export const assignStationSchema = z.object({
  orgId: z.string().uuid(),
  outletId: z.string().uuid(),
  stationId: z.string().uuid(),
  userId: z.string().uuid()
});

export const revokeStationSchema = z.object({
  orgId: z.string().uuid(),
  outletId: z.string().uuid(),
  stationId: z.string().uuid(),
  userId: z.string().uuid()
});

export const deactivateMemberSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid()
});

export const reactivateMemberSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid()
});

// ── RPC response shapes ────────────────────────────────────────────────────────

type ListOrgStaffRpc = {
  members?: Array<{
    user_id?: string;
    full_name?: string | null;
    email?: string | null;
    org_role?: string;
    is_active?: boolean;
    outlet_assignments?: Array<{
      outlet_id?: string;
      outlet_name?: string;
      site_id?: string;
      role?: string;
    }>;
    station_assignments?: Array<{
      station_id?: string;
      station_name?: string;
      outlet_id?: string;
      is_revoked?: boolean;
    }>;
  }>;
  scoped?: boolean;
  reason?: string;
};

type MutationRpc = {
  ok?: boolean;
  status?: string;
  user_id?: string;
  message?: string;
};

// ── Service functions ──────────────────────────────────────────────────────────

export async function getOrgStaff(
  context: WorkspaceContext
): Promise<ServiceResult<StaffRoster>> {
  try {
    if (!roleIn(context.role, TEAM_VISIBLE_ROLES)) {
      return { ok: false, reason: "forbidden", message: "Team access requires Manager, Admin, or Owner role." };
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_v3_4_list_org_staff", {
      target_org_id: context.orgId
    });

    if (error) {
      return { ok: false, reason: "error", message: "Staff roster is unavailable." };
    }

    const result = data as ListOrgStaffRpc | null;

    return {
      ok: true,
      data: {
        members: (result?.members ?? []).map((m) => ({
          userId: m.user_id ?? "",
          fullName: m.full_name ?? null,
          email: m.email ?? null,
          orgRole: (m.org_role ?? "cashier") as OrgRole,
          isActive: m.is_active !== false,
          outletAssignments: (m.outlet_assignments ?? []).map((a) => ({
            outletId: a.outlet_id ?? "",
            outletName: a.outlet_name ?? "",
            siteId: a.site_id ?? "",
            role: a.role ?? ""
          })),
          stationAssignments: (m.station_assignments ?? []).map((s) => ({
            stationId: s.station_id ?? "",
            stationName: s.station_name ?? "",
            outletId: s.outlet_id ?? "",
            isRevoked: Boolean(s.is_revoked)
          }))
        })),
        scoped: Boolean(result?.scoped),
        reason: result?.reason
      }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function addOrgMember(
  input: unknown
): Promise<ServiceResult<{ userId: string; status: string }>> {
  try {
    const parsed = addMemberSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_v3_4_add_member", {
      target_org_id: parsed.orgId,
      target_email: parsed.email,
      new_role: parsed.role
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as MutationRpc | null;
    return { ok: true, data: { userId: result?.user_id ?? "", status: result?.status ?? "added" } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function updateOrgMemberRole(
  input: unknown
): Promise<ServiceResult<{ userId: string; newRole: string }>> {
  try {
    const parsed = updateMemberRoleSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_v3_4_update_member_role", {
      target_org_id: parsed.orgId,
      target_user_id: parsed.userId,
      new_role: parsed.role
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as (MutationRpc & { new_role?: string }) | null;
    return { ok: true, data: { userId: parsed.userId, newRole: result?.new_role ?? parsed.role } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function assignMemberOutlet(
  input: unknown
): Promise<ServiceResult<{ status: string }>> {
  try {
    const parsed = assignOutletSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_v3_4_assign_member_outlet", {
      target_org_id: parsed.orgId,
      target_user_id: parsed.userId,
      target_outlet_id: parsed.outletId
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as MutationRpc | null;
    return { ok: true, data: { status: result?.status ?? "assigned" } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function removeMemberOutlet(
  input: unknown
): Promise<ServiceResult<{ status: string }>> {
  try {
    const parsed = removeOutletSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_v3_4_remove_member_outlet", {
      target_org_id: parsed.orgId,
      target_user_id: parsed.userId,
      target_outlet_id: parsed.outletId
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as MutationRpc | null;
    return { ok: true, data: { status: result?.status ?? "removed" } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function assignKitchenStation(
  input: unknown
): Promise<ServiceResult<{ status: string }>> {
  try {
    const parsed = assignStationSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_v3_4_assign_kitchen_station", {
      target_org_id: parsed.orgId,
      target_outlet_id: parsed.outletId,
      target_station_id: parsed.stationId,
      target_user_id: parsed.userId
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as MutationRpc | null;
    return { ok: true, data: { status: result?.status ?? "assigned" } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function revokeKitchenStation(
  input: unknown
): Promise<ServiceResult<{ status: string }>> {
  try {
    const parsed = revokeStationSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_v3_4_revoke_kitchen_station", {
      target_org_id: parsed.orgId,
      target_outlet_id: parsed.outletId,
      target_station_id: parsed.stationId,
      target_user_id: parsed.userId
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as MutationRpc | null;
    return { ok: true, data: { status: result?.status ?? "revoked" } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function deactivateOrgMember(
  input: unknown
): Promise<ServiceResult<{ userId: string; status: string }>> {
  try {
    const parsed = deactivateMemberSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_v3_4_deactivate_member", {
      target_org_id: parsed.orgId,
      target_user_id: parsed.userId
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as MutationRpc | null;
    return { ok: true, data: { userId: parsed.userId, status: result?.status ?? "deactivated" } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function reactivateOrgMember(
  input: unknown
): Promise<ServiceResult<{ userId: string; status: string }>> {
  try {
    const parsed = reactivateMemberSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_v3_4_reactivate_member", {
      target_org_id: parsed.orgId,
      target_user_id: parsed.userId
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as MutationRpc | null;
    return { ok: true, data: { userId: parsed.userId, status: result?.status ?? "reactivated" } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}
