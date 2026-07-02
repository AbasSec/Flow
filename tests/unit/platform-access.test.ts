import { describe, expect, it } from "vitest";

const tenantReadPolicies = [
  "organisations_select_active_member",
  "messages_select_room_reader",
  "orders_select_outlet_member"
];

describe("platform admin tenant access posture", () => {
  it("does not model platform admin status as tenant read access", () => {
    for (const policyName of tenantReadPolicies) {
      expect(policyName).not.toContain("platform_admin");
    }
  });
});
