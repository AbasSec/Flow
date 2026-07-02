import { describe, expect, it } from "vitest";
import { hasActiveMembership } from "@/lib/auth/access";

describe("active membership resolution", () => {
  it("distinguishes active and deactivated memberships", () => {
    const memberships = [
      {
        orgId: "org_a",
        userId: "user_1",
        deactivatedAt: null
      },
      {
        orgId: "org_b",
        userId: "user_1",
        deactivatedAt: "2026-07-02T00:00:00.000Z"
      }
    ];

    expect(hasActiveMembership(memberships, "org_a", "user_1")).toBe(true);
    expect(hasActiveMembership(memberships, "org_b", "user_1")).toBe(false);
  });
});
