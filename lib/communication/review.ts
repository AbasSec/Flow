export const DEFAULT_REVIEW_GRANT_MINUTES = 30;

export function calculateReviewGrantExpiry(
  grantedAt: Date,
  minutes = DEFAULT_REVIEW_GRANT_MINUTES
): Date {
  return new Date(grantedAt.getTime() + minutes * 60 * 1000);
}

export function isReviewGrantActive(
  now: Date,
  grant: {
    grantedAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
  }
): boolean {
  return grant.revokedAt === null && grant.grantedAt <= now && grant.expiresAt > now;
}
