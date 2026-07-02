export const ORDER_SERVICE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PREPARING",
  "READY",
  "SERVED_OR_COLLECTED",
  "COMPLETED",
  "CANCELLED"
] as const;

export const PAYMENT_STATUSES = [
  "UNPAID",
  "PENDING",
  "PAID",
  "FAILED",
  "EXPIRED",
  "REFUND_REQUESTED",
  "REFUNDED"
] as const;

export const TABLE_SESSION_STATUSES = [
  "AVAILABLE",
  "OPEN",
  "BILL_REQUESTED",
  "SETTLED",
  "CLOSED",
  "CANCELLED"
] as const;

export const KITCHEN_TICKET_STATUSES = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "HELD",
  "HELD_UNAVAILABLE"
] as const;

export type OrderServiceStatus = (typeof ORDER_SERVICE_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type TableSessionStatus = (typeof TABLE_SESSION_STATUSES)[number];
export type KitchenTicketStatus = (typeof KITCHEN_TICKET_STATUSES)[number];

export function isOrderServiceStatus(
  value: string
): value is OrderServiceStatus {
  return ORDER_SERVICE_STATUSES.includes(value as OrderServiceStatus);
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return PAYMENT_STATUSES.includes(value as PaymentStatus);
}

export function isTableSessionStatus(
  value: string
): value is TableSessionStatus {
  return TABLE_SESSION_STATUSES.includes(value as TableSessionStatus);
}

export function isKitchenTicketStatus(
  value: string
): value is KitchenTicketStatus {
  return KITCHEN_TICKET_STATUSES.includes(value as KitchenTicketStatus);
}

export function getNextKitchenTicketStatus(
  status: KitchenTicketStatus
): KitchenTicketStatus | null {
  if (status === "NEW") {
    return "ACCEPTED";
  }
  if (status === "ACCEPTED") {
    return "PREPARING";
  }
  if (status === "PREPARING") {
    return "READY";
  }
  if (status === "READY") {
    return "COMPLETED";
  }

  return null;
}
