export type KitchenBoardOrderState = {
  fulfilment_state: string | null;
  closure_state: string | null;
  service_status: string | null;
};

export function isActiveKitchenBoardOrder(
  order: KitchenBoardOrderState | null | undefined
): boolean {
  if (!order) return false;

  if (
    order.fulfilment_state === "SERVED" ||
    order.fulfilment_state === "COLLECTED" ||
    order.fulfilment_state === "CANCELLED"
  ) {
    return false;
  }

  if (
    order.closure_state === "COMPLETE" ||
    order.closure_state === "CANCELLED" ||
    order.closure_state === "ARCHIVED"
  ) {
    return false;
  }

  return !(
    order.service_status === "SERVED_OR_COLLECTED" ||
    order.service_status === "COMPLETED" ||
    order.service_status === "CANCELLED"
  );
}
