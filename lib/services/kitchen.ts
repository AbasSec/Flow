import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  KITCHEN_ROLES,
  MANAGEMENT_ROLES,
  type ServiceResult,
  type WorkspaceContext,
  minutesSince,
  requireAdminClient,
  requireWorkspaceContext,
  roleIn,
  serviceError
} from "@/lib/services/context";
import {
  getNextKitchenTicketStatus,
  type KitchenTicketStatus
} from "@/lib/domain/states";

const transitionSchema = z.object({
  ticketId: z.string().uuid(),
  nextStatus: z.enum(["ACCEPTED", "PREPARING", "READY"])
});

export type KitchenTicketCard = {
  id: string;
  orderId: string;
  stationId: string;
  stationName: string;
  status: KitchenTicketStatus;
  createdAt: string;
  ageMinutes: number;
  lines: Array<{
    id: string;
    itemName: string;
    quantity: number;
    status: string;
  }>;
};

export type KitchenBoard = {
  context: WorkspaceContext;
  canViewAllStations: boolean;
  tickets: KitchenTicketCard[];
};

type TicketRow = {
  id: string;
  order_id: string;
  station_id: string;
  status: KitchenTicketStatus;
  created_at: string;
  kitchen_stations: { name: string } | { name: string }[] | null;
};

type TicketLineRow = {
  id: string;
  kitchen_ticket_id: string;
  status: string;
  order_lines: { item_name_snapshot: string; quantity: number } | {
    item_name_snapshot: string;
    quantity: number;
  }[] | null;
};

type StationMembershipRow = { station_id: string };

function relationOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export function getNextKitchenStatus(status: KitchenTicketStatus): KitchenTicketStatus | null {
  return getNextKitchenTicketStatus(status);
}

export async function getKitchenBoard(): Promise<ServiceResult<KitchenBoard>> {
  try {
    const context = await requireWorkspaceContext();

    if (!roleIn(context.role, KITCHEN_ROLES)) {
      return {
        ok: false,
        reason: "forbidden",
        message: "Your role cannot access the kitchen board."
      };
    }

    const admin = requireAdminClient();
    const canViewAllStations = roleIn(context.role, MANAGEMENT_ROLES);
    let assignedStationIds: string[] | null = null;

    if (!canViewAllStations) {
      const { data, error } = await admin
        .from("kitchen_station_memberships")
        .select("station_id")
        .eq("org_id", context.orgId)
        .eq("user_id", context.userId)
        .is("revoked_at", null);

      if (error) {
        throw error;
      }

      assignedStationIds = ((data ?? []) as StationMembershipRow[]).map(
        (row) => row.station_id
      );

      if (assignedStationIds.length === 0) {
        return { ok: true, data: { context, canViewAllStations, tickets: [] } };
      }
    }

    let ticketQuery = admin
      .from("kitchen_tickets")
      .select("id, order_id, station_id, status, created_at, kitchen_stations(name)")
      .eq("org_id", context.orgId)
      .in("status", ["NEW", "ACCEPTED", "PREPARING", "READY"])
      .order("created_at", { ascending: true });

    if (assignedStationIds) {
      ticketQuery = ticketQuery.in("station_id", assignedStationIds);
    }

    const { data: ticketsData, error: ticketsError } = await ticketQuery;

    if (ticketsError) {
      throw ticketsError;
    }

    const tickets = (ticketsData ?? []) as TicketRow[];
    const ticketIds = tickets.map((ticket) => ticket.id);
    let ticketLines: TicketLineRow[] = [];

    if (ticketIds.length > 0) {
      const { data, error } = await admin
        .from("ticket_lines")
        .select("id, kitchen_ticket_id, status, order_lines(item_name_snapshot, quantity)")
        .eq("org_id", context.orgId)
        .in("kitchen_ticket_id", ticketIds);

      if (error) {
        throw error;
      }

      ticketLines = (data ?? []) as TicketLineRow[];
    }

    return {
      ok: true,
      data: {
        context,
        canViewAllStations,
        tickets: tickets.map((ticket) => ({
          id: ticket.id,
          orderId: ticket.order_id,
          stationId: ticket.station_id,
          stationName: relationOne(ticket.kitchen_stations)?.name ?? "Station",
          status: ticket.status,
          createdAt: ticket.created_at,
          ageMinutes: minutesSince(ticket.created_at),
          lines: ticketLines
            .filter((line) => line.kitchen_ticket_id === ticket.id)
            .map((line) => {
              const orderLine = relationOne(line.order_lines);

              return {
                id: line.id,
                itemName: orderLine?.item_name_snapshot ?? "Item",
                quantity: orderLine?.quantity ?? 0,
                status: line.status
              };
            })
        }))
      }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function transitionKitchenTicket(
  input: unknown
): Promise<ServiceResult<{ ticketId: string; orderId: string }>> {
  try {
    transitionSchema.parse(input);
    const parsed = transitionSchema.parse(input);
    await requireWorkspaceContext();
    const supabase = await createSupabaseServerClient();

    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_v3_1_transition_kitchen_ticket", {
      target_ticket_id: parsed.ticketId,
      next_status: parsed.nextStatus
    });

    if (error) {
      return {
        ok: false,
        reason: "error",
        message: "Kitchen ticket could not be moved to the requested state."
      };
    }

    const result = data as { ticket_id?: string; order_id?: string } | null;
    const orderId = result?.order_id ?? "";

    revalidatePath("/app");
    revalidatePath("/app/kitchen");

    if (orderId) {
      revalidatePath(`/app/orders/${orderId}`);
    }

    return {
      ok: true,
      data: { ticketId: result?.ticket_id ?? parsed.ticketId, orderId }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}
