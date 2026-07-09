"use server";

import { revalidatePath } from "next/cache";
import {
  addOrgMember,
  updateOrgMemberRole,
  assignMemberOutlet,
  removeMemberOutlet,
  assignKitchenStation,
  revokeKitchenStation,
  deactivateOrgMember,
  reactivateOrgMember
} from "@/lib/services/people";

export async function addMemberAction(formData: FormData): Promise<void> {
  const result = await addOrgMember({
    orgId: formData.get("orgId"),
    email: formData.get("email"),
    role: formData.get("role")
  });

  if (result.ok) {
    revalidatePath("/app/team");
  }
}

export async function updateMemberRoleAction(formData: FormData): Promise<void> {
  const result = await updateOrgMemberRole({
    orgId: formData.get("orgId"),
    userId: formData.get("userId"),
    role: formData.get("role")
  });

  if (result.ok) {
    revalidatePath("/app/team");
  }
}

export async function assignOutletAction(formData: FormData): Promise<void> {
  const result = await assignMemberOutlet({
    orgId: formData.get("orgId"),
    userId: formData.get("userId"),
    outletId: formData.get("outletId")
  });

  if (result.ok) {
    revalidatePath("/app/team");
  }
}

export async function removeOutletAction(formData: FormData): Promise<void> {
  const result = await removeMemberOutlet({
    orgId: formData.get("orgId"),
    userId: formData.get("userId"),
    outletId: formData.get("outletId")
  });

  if (result.ok) {
    revalidatePath("/app/team");
  }
}

export async function assignStationAction(formData: FormData): Promise<void> {
  const result = await assignKitchenStation({
    orgId: formData.get("orgId"),
    outletId: formData.get("outletId"),
    stationId: formData.get("stationId"),
    userId: formData.get("userId")
  });

  if (result.ok) {
    revalidatePath("/app/team");
  }
}

export async function revokeStationAction(formData: FormData): Promise<void> {
  const result = await revokeKitchenStation({
    orgId: formData.get("orgId"),
    outletId: formData.get("outletId"),
    stationId: formData.get("stationId"),
    userId: formData.get("userId")
  });

  if (result.ok) {
    revalidatePath("/app/team");
  }
}

export async function deactivateMemberAction(formData: FormData): Promise<void> {
  const result = await deactivateOrgMember({
    orgId: formData.get("orgId"),
    userId: formData.get("userId")
  });

  if (result.ok) {
    revalidatePath("/app/team");
  }
}

export async function reactivateMemberAction(formData: FormData): Promise<void> {
  const result = await reactivateOrgMember({
    orgId: formData.get("orgId"),
    userId: formData.get("userId")
  });

  if (result.ok) {
    revalidatePath("/app/team");
  }
}
