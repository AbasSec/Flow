import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/db/server";
import {
  getActiveMembershipForCurrentUser,
  getAuthenticatedUser
} from "@/lib/auth/session";

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
