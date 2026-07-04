export const ORDER_RELEASE_POLICIES = [
  "RELEASE_ON_SUBMIT",
  "RELEASE_ON_VERIFIED_PAYMENT",
  "RELEASE_BY_AUTHORISED_STAFF"
] as const;

export const ORDER_RELEASE_STATES = [
  "NOT_RELEASED",
  "RELEASED",
  "HELD",
  "CANCELLED"
] as const;

export const ORDER_FULFILMENT_STATES = [
  "NOT_RELEASED",
  "RELEASED",
  "READY_FOR_HANDOFF",
  "SERVED",
  "COLLECTED",
  "CANCELLED"
] as const;

export const ORDER_CLOSURE_STATES = [
  "OPEN",
  "COMPLETE",
  "CANCELLED",
  "ARCHIVED"
] as const;

export type OrderReleasePolicy = (typeof ORDER_RELEASE_POLICIES)[number];
export type OrderReleaseState = (typeof ORDER_RELEASE_STATES)[number];
export type OrderFulfilmentState = (typeof ORDER_FULFILMENT_STATES)[number];
export type OrderClosureState = (typeof ORDER_CLOSURE_STATES)[number];

export function isOrderReleasePolicy(value: string): value is OrderReleasePolicy {
  return ORDER_RELEASE_POLICIES.includes(value as OrderReleasePolicy);
}

export function isOrderReleaseState(value: string): value is OrderReleaseState {
  return ORDER_RELEASE_STATES.includes(value as OrderReleaseState);
}

export function isOrderFulfilmentState(
  value: string
): value is OrderFulfilmentState {
  return ORDER_FULFILMENT_STATES.includes(value as OrderFulfilmentState);
}

export function isOrderClosureState(value: string): value is OrderClosureState {
  return ORDER_CLOSURE_STATES.includes(value as OrderClosureState);
}

export const OUTLET_LIFECYCLE_MODES = ["LEGACY", "V3_1"] as const;

export type OutletLifecycleMode = (typeof OUTLET_LIFECYCLE_MODES)[number];

export function isOutletLifecycleMode(value: string): value is OutletLifecycleMode {
  return OUTLET_LIFECYCLE_MODES.includes(value as OutletLifecycleMode);
}
