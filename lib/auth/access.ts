export type MembershipRecord = {
  orgId: string;
  userId: string;
  deactivatedAt: string | null;
};

export function hasActiveMembership(
  memberships: readonly MembershipRecord[],
  orgId: string,
  userId: string
): boolean {
  return memberships.some(
    (membership) =>
      membership.orgId === orgId &&
      membership.userId === userId &&
      membership.deactivatedAt === null
  );
}

export type ActiveMembershipSummary = {
  orgId: string;
  orgName: string;
  role: string;
};
