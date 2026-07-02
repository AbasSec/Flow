export function hasCurrentCommunicationPolicyAcknowledgement(
  currentPolicyVersion: number,
  acknowledgedPolicyVersions: readonly number[]
): boolean {
  return acknowledgedPolicyVersions.includes(currentPolicyVersion);
}
