import { describe, expect, it } from "vitest";
import {
  isKitchenTicketStatus,
  isOrderServiceStatus,
  isPaymentStatus,
  isTableSessionStatus
} from "@/lib/domain/states";

describe("core enum and state guards", () => {
  it("accepts locked state values", () => {
    expect(isOrderServiceStatus("SUBMITTED")).toBe(true);
    expect(isPaymentStatus("PAID")).toBe(true);
    expect(isTableSessionStatus("BILL_REQUESTED")).toBe(true);
    expect(isKitchenTicketStatus("HELD_UNAVAILABLE")).toBe(true);
  });

  it("rejects non-canonical state values", () => {
    expect(isOrderServiceStatus("paid")).toBe(false);
    expect(isPaymentStatus("SETTLED")).toBe(false);
    expect(isTableSessionStatus("READY")).toBe(false);
    expect(isKitchenTicketStatus("DONE")).toBe(false);
  });
});
