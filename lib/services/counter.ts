import "server-only";

import {
  SETTLEMENT_ROLES,
  type ServiceResult,
  type WorkspaceContext,
  getPrimaryAuthorisedOutletId,
  minutesSince,
  requireAdminClient,
  requireWorkspaceContext,
  roleIn
} from "@/lib/services/context";

export type CounterOrderCard = {
  id: string;
  tableLabel: string | null;
  orderChannel: string;
  totalSen: number;
  createdAt: string;
  ageMinutes: number;
};

export type CounterData = {
  context: WorkspaceContext;
  outletId: string;
  awaitingPayment: CounterOrderCard[];
  paidAwaitingRelease: CounterOrderCard[];
};

type CounterOrderRow = {
  id: string;
  order_channel: string;
  total_sen: number;
  created_at: string;
  table_sessions: { table_label: string } | { table_label: string }[] | null;
};

function firstTableLabel(
  sessions: { table_label: string } | { table_label: string }[] | null
): string | null {
  if (Array.isArray(sessions)) return sessions[0]?.table_label ?? null;
  return sessions?.table_label ?? null;
}

function mapCard(row: CounterOrderRow): CounterOrderCard {
  return {
    id: row.id,
    tableLabel: firstTableLabel(row.table_sessions),
    orderChannel: row.order_channel,
    totalSen: Number(row.total_sen),
    createdAt: row.created_at,
    ageMinutes: minutesSince(row.created_at)
  };
}

const BASE_SELECT =
  "id, order_channel, total_sen, created_at, table_sessions(table_label)";

export async function getCounterData(): Promise<ServiceResult<CounterData>> {
  try {
    const context = await requireWorkspaceContext();

    if (!roleIn(context.role, SETTLEMENT_ROLES)) {
      return {
        ok: false,
        reason: "forbidden",
        message:
          "Counter workspace is limited to cashier, manager, admin, and owner roles."
      };
    }

    const outletId = await getPrimaryAuthorisedOutletId(context);

    if (!outletId) {
      return { ok: false, reason: "not_found", message: "No active outlet found." };
    }

    const admin = requireAdminClient();

    const [awaitingResult, paidResult] = await Promise.all([
      admin
        .from("orders")
        .select(BASE_SELECT)
        .eq("org_id", context.orgId)
        .eq("outlet_id", outletId)
        .eq("release_policy", "RELEASE_BY_AUTHORISED_STAFF")
        .eq("payment_status", "UNPAID")
        .eq("release_state", "NOT_RELEASED")
        .order("created_at", { ascending: true })
        .limit(50),
      admin
        .from("orders")
        .select(BASE_SELECT)
        .eq("org_id", context.orgId)
        .eq("outlet_id", outletId)
        .eq("release_policy", "RELEASE_BY_AUTHORISED_STAFF")
        .eq("payment_status", "PAID")
        .eq("release_state", "NOT_RELEASED")
        .order("created_at", { ascending: true })
        .limit(50)
    ]);

    if (awaitingResult.error) throw awaitingResult.error;
    if (paidResult.error) throw paidResult.error;

    return {
      ok: true,
      data: {
        context,
        outletId,
        awaitingPayment: ((awaitingResult.data ?? []) as CounterOrderRow[]).map(mapCard),
        paidAwaitingRelease: ((paidResult.data ?? []) as CounterOrderRow[]).map(mapCard)
      }
    };
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "Unable to load Counter orders right now."
    };
  }
}
