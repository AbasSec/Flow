import { createHash } from "node:crypto";

export const DIRECT_WORK_MIN_PARTICIPANTS = 2;
export const DIRECT_WORK_MAX_PARTICIPANTS = 5;

export function canonicalizeDirectWorkParticipants(
  participantUserIds: readonly string[]
): string[] {
  return Array.from(
    new Set(
      participantUserIds.map((participantUserId) =>
        participantUserId.trim().toLowerCase()
      )
    )
  )
    .filter(Boolean)
    .sort();
}

export function isValidDirectWorkParticipantCount(
  participantUserIds: readonly string[]
): boolean {
  const canonicalParticipants =
    canonicalizeDirectWorkParticipants(participantUserIds);

  return (
    canonicalParticipants.length >= DIRECT_WORK_MIN_PARTICIPANTS &&
    canonicalParticipants.length <= DIRECT_WORK_MAX_PARTICIPANTS
  );
}

export function createParticipantSetHash(
  participantUserIds: readonly string[]
): string {
  const canonicalParticipants =
    canonicalizeDirectWorkParticipants(participantUserIds);

  return createHash("sha256")
    .update(canonicalParticipants.join(":"))
    .digest("hex");
}
