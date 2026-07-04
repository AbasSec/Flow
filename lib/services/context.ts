import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/db/server";
import {
  getActiveMembershipForCurrentUser,
  getAuthenticatedUser
} from "@/lib/auth/session";
import {
  hasExplicitActiveSiteMembership,
  hasOrganisationWideOutletAccess
} from "@/lib/services/outlet-access-policy";

export { hasOrganisationWideOutletAccess } from "@/lib/services/outlet-access-policy";

export const MANAGEMENT_ROLES = [
  "organisation_owner",
  "organisation_admin",
  "manager"
] as const;

export const SETTLEMENT_ROLES = [
  "organisation_owner",
  "organisation_admin",
  "manager",
  "cashier"
] as const;

export const ORDER_ENTRY_ROLES = [
  "organisation_owner",
  "organisation_admin",
  "manager",
  "cashier",
  "waiter"
] as const;

export const KITCHEN_ROLES = [
  "organisation_owner",
  "organisation_admin",
  "manager",
  "kitchen"
] as const;

export type RoleName =
  | "organisation_owner"
  | "organisation_admin"
  | "manager"
  | "cashier"
  | "waiter"
  | "kitchen"
  | "storekeeper";

export type WorkspaceContext = {
  userId: string;
  orgId: string;
  orgName: string;
  role: RoleName;
};

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unauthenticated" | "forbidden" | "unconfigured" | "not_found" | "error"; message: string };

export function roleIn(role: string, allowed: readonly string[]): boolean {
  return allowed.includes(role);
}

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const { supabase, user } = await getAuthenticatedUser();

  if (!supabase || !user) {
    redirect("/login");
  }

  const { membership } = await getActiveMembershipForCurrentUser();

  if (!membership) {
    redirect("/login?error=Active%20organisation%20membership%20required");
  }

  return {
    userId: user.id,
    orgId: membership.orgId,
    orgName: membership.orgName,
    role: membership.role as RoleName
  };
}

export function requireAdminClient() {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    throw new Error("Supabase server admin client is not configured.");
  }

  return admin;
}

export function minutesSince(isoDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000));
}

export function serviceError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "The operation could not be completed.";
}

type OutletScopeRow = {
  id: string;
  site_id: string;
};

type SiteScopeRow = {
  id: string;
};

type SiteMembershipRow = {
  user_id: string;
};

export async function canAccessOutlet(
  context: WorkspaceContext,
  outletId: string
): Promise<boolean> {
  const admin = requireAdminClient();
  const { data: outlet, error: outletError } = await admin
    .from("outlets")
    .select("id, site_id")
    .eq("id", outletId)
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .maybeSingle();

  if (outletError || !outlet) {
    return false;
  }

  if (hasOrganisationWideOutletAccess(context.role)) {
    return true;
  }

  const outletRow = outlet as OutletScopeRow;
  const { data: site, error: siteError } = await admin
    .from("sites")
    .select("id")
    .eq("id", outletRow.site_id)
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .maybeSingle();

  if (siteError || !(site as SiteScopeRow | null)) {
    return false;
  }

  const { data: memberships, error: membershipsError } = await admin
    .from("site_memberships")
    .select("user_id")
    .eq("org_id", context.orgId)
    .eq("site_id", outletRow.site_id)
    .is("deactivated_at", null);

  if (membershipsError) {
    return false;
  }

  const activeMemberships = (memberships ?? []) as SiteMembershipRow[];

  return hasExplicitActiveSiteMembership(context.userId, activeMemberships);
}

export async function getPrimaryAuthorisedOutletId(
  context: WorkspaceContext
): Promise<string | null> {
  const admin = requireAdminClient();
  const { data, error } = await admin
    .from("outlets")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("created_at");

  if (error) {
    throw error;
  }

  for (const outlet of (data ?? []) as Array<{ id: string }>) {
    if (await canAccessOutlet(context, outlet.id)) {
      return outlet.id;
    }
  }

  return null;
}
