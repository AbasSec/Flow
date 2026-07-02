import { describe, expect, it } from "vitest";
import {
  calculateReviewGrantExpiry,
  isReviewGrantActive
} from "@/lib/communication/review";
import {
  canonicalizeDirectWorkParticipants,
  createParticipantSetHash,
  isValidDirectWorkParticipantCount
} from "@/lib/communication/direct-work";
import { hasCurrentCommunicationPolicyAcknowledgement } from "@/lib/communication/policy";

describe("Direct Work participant set canonicalization", () => {
  it("sorts, trims, lowercases, and deduplicates participants", () => {
    expect(
      canonicalizeDirectWorkParticipants([" User-B ", "user-a", "USER-B"])
    ).toEqual(["user-a", "user-b"]);
  });

  it("creates the same hash for the same exact participant set", () => {
    expect(createParticipantSetHash(["b", "a"])).toBe(
      createParticipantSetHash(["A", "B"])
    );
  });

  it("enforces the P0 two-to-five participant limit", () => {
    expect(isValidDirectWorkParticipantCount(["a"])).toBe(false);
    expect(isValidDirectWorkParticipantCount(["a", "b"])).toBe(true);
    expect(isValidDirectWorkParticipantCount(["a", "b", "c", "d", "e"])).toBe(
      true
    );
    expect(
      isValidDirectWorkParticipantCount(["a", "b", "c", "d", "e", "f"])
    ).toBe(false);
  });
});

describe("communication policy acknowledgement guard", () => {
  it("requires acknowledgement of the current policy version", () => {
    expect(hasCurrentCommunicationPolicyAcknowledgement(2, [1])).toBe(false);
    expect(hasCurrentCommunicationPolicyAcknowledgement(2, [1, 2])).toBe(true);
  });
});

describe("temporary review grants", () => {
  it("defaults to a 30-minute expiry", () => {
    const grantedAt = new Date("2026-07-02T12:00:00.000Z");

    expect(calculateReviewGrantExpiry(grantedAt).toISOString()).toBe(
      "2026-07-02T12:30:00.000Z"
    );
  });

  it("treats revoked and expired grants as inactive", () => {
    const grantedAt = new Date("2026-07-02T12:00:00.000Z");
    const expiresAt = calculateReviewGrantExpiry(grantedAt);

    expect(
      isReviewGrantActive(new Date("2026-07-02T12:15:00.000Z"), {
        grantedAt,
        expiresAt,
        revokedAt: null
      })
    ).toBe(true);
    expect(
      isReviewGrantActive(new Date("2026-07-02T12:31:00.000Z"), {
        grantedAt,
        expiresAt,
        revokedAt: null
      })
    ).toBe(false);
    expect(
      isReviewGrantActive(new Date("2026-07-02T12:15:00.000Z"), {
        grantedAt,
        expiresAt,
        revokedAt: new Date("2026-07-02T12:10:00.000Z")
      })
    ).toBe(false);
  });
});
