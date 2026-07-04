import "server-only";

import { getInventoryRisks } from "@/lib/services/inventory";
import { getRecentOrders, type OrderSummary } from "@/lib/services/orders";
import {
  MANAGEMENT_ROLES,
  type ServiceResult,
  type WorkspaceContext,
  getPrimaryAuthorisedOutletId,
  minutesSince,
  requireAdminClient,
  requireWorkspaceContext,
  roleIn
} from "@/lib/services/context";

export type DashboardActivity = {
  id: string;
  action: string;
  objectType: string;
  objectId: string | null;
  createdAt: string;
};

export type DashboardData = {
  context: WorkspaceContext;
  outletId: string;
  todayOrderCount: number;
  todayRevenueSen: number;
  openKitchenTickets: number;
  oldestOpenTicketAgeMinutes: number | null;
  lowStockCount: number;
  recentActivity: DashboardActivity[];
  recentOrders: OrderSummary[];
};

type OrderKpiRow = { total_sen: number };
type TicketKpiRow = { created_at: string };
type AuditRow = {
  id: string;
  action: string;
  object_type: string;
  object_id: string | null;
  created_at: string;
};

export async function getDashboardData(): Promise<ServiceResult<DashboardData>> {
  try {
    const context = await requireWorkspaceContext();

    if (!roleIn(context.role, MANAGEMENT_ROLES)) {
      return {
        ok: false,
        reason: "forbidden",
        message: "Only owner, admin, or manager can view this dashboard."
      };
    }

    const outletId = await getPrimaryAuthorisedOutletId(context);

    if (!outletId) {
      return { ok: false, reason: "not_found", message: "No active outlet found." };
    }

    const admin = requireAdminClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      orderCountResult,
      revenueResult,
      ticketsResult,
      activityResult,
      recentOrders,
      inventoryRisks
    ] = await Promise.all([
      admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("org_id", context.orgId)
        .eq("outlet_id", outletId)
        .gte("created_at", todayStart.toISOString()),
      admin
        .from("orders")
        .select("total_sen")
        .eq("org_id", context.orgId)
        .eq("outlet_id", outletId)
        .eq("payment_status", "PAID")
        .gte("created_at", todayStart.toISOString()),
      admin
        .from("kitchen_tickets")
        .select("created_at")
        .eq("org_id", context.orgId)
        .eq("outlet_id", outletId)
        .in("status", ["NEW", "ACCEPTED", "PREPARING", "READY"]),
      admin
        .from("audit_events")
        .select("id, action, object_type, object_id, created_at")
        .eq("org_id", context.orgId)
        .eq("outlet_id", outletId)
        .order("created_at", { ascending: false })
        .limit(8),
      getRecentOrders(context.orgId, outletId),
      getInventoryRisks(context.orgId, outletId)
    ]);

    if (orderCountResult.error) {
      throw orderCountResult.error;
    }

    if (revenueResult.error) {
      throw revenueResult.error;
    }

    if (ticketsResult.error) {
      throw ticketsResult.error;
    }

    if (activityResult.error) {
      throw activityResult.error;
    }

    const openTickets = (ticketsResult.data ?? []) as TicketKpiRow[];
    const oldestTicket = openTickets[0]?.created_at
      ? openTickets.reduce((oldest, current) =>
          new Date(current.created_at) < new Date(oldest.created_at)
            ? current
            : oldest
        )
      : null;

    return {
      ok: true,
      data: {
        context,
        outletId,
        todayOrderCount: orderCountResult.count ?? 0,
        todayRevenueSen: ((revenueResult.data ?? []) as OrderKpiRow[]).reduce(
          (sum, row) => sum + Number(row.total_sen),
          0
        ),
        openKitchenTickets: openTickets.length,
        oldestOpenTicketAgeMinutes: oldestTicket
          ? minutesSince(oldestTicket.created_at)
          : null,
        lowStockCount: inventoryRisks.filter((risk) => risk.isLow).length,
        recentOrders,
        recentActivity: ((activityResult.data ?? []) as AuditRow[]).map(
          (row) => ({
            id: row.id,
            action: row.action,
            objectType: row.object_type,
            objectId: row.object_id,
            createdAt: row.created_at
          })
        )
      }
    };
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "Unable to load dashboard data right now."
    };
  }
}
