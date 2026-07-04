export type SiteMembershipAuthority = {
  user_id: string;
};

export function hasOrganisationWideOutletAccess(role: string): boolean {
  return role === "organisation_owner" || role === "organisation_admin";
}

export function hasExplicitActiveSiteMembership(
  userId: string,
  activeMemberships: readonly SiteMembershipAuthority[]
): boolean {
  return activeMemberships.some((membership) => membership.user_id === userId);
}
