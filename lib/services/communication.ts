import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  type ServiceResult,
  type WorkspaceContext,
  requireAdminClient,
  requireWorkspaceContext,
  serviceError
} from "@/lib/services/context";

const sendMessageSchema = z.object({
  roomId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  clientNonce: z.string().min(8).max(120)
});

export type ConnectRoom = {
  id: string;
  title: string;
  roomType: string;
  threadEntityType: string | null;
  threadEntityId: string | null;
  messages: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string;
  }>;
};

export type ConnectData = {
  context: WorkspaceContext;
  rooms: ConnectRoom[];
};

type RoomRow = {
  id: string;
  title: string;
  room_type: string;
  created_at: string;
};

type ThreadRow = {
  room_id: string;
  entity_type: string;
  entity_id: string;
};

type MessageRow = {
  id: string;
  room_id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string; email: string | null } | {
    full_name: string;
    email: string | null;
  }[] | null;
};

type RoomMembershipRow = {
  room_id: string;
};

function relationOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export async function getConnectData(
  orderId?: string
): Promise<ServiceResult<ConnectData>> {
  try {
    const context = await requireWorkspaceContext();
    const admin = requireAdminClient();

    const roomTypes = ["ORG_HUB", "TEAM_ROOM"];
    const roomIds = new Set<string>();
    const rooms: RoomRow[] = [];
    const threadsByRoom = new Map<string, ThreadRow>();

    const { data: membershipRows, error: membershipError } = await admin
      .from("room_memberships")
      .select("room_id")
      .eq("org_id", context.orgId)
      .eq("user_id", context.userId)
      .is("left_at", null);

    if (membershipError) {
      throw membershipError;
    }

    const authorisedRoomIds = new Set(
      ((membershipRows ?? []) as RoomMembershipRow[]).map((row) => row.room_id)
    );

    const { data: baseRooms, error: baseRoomsError } = await admin
      .from("communication_rooms")
      .select("id, title, room_type, created_at")
      .eq("org_id", context.orgId)
      .in("room_type", roomTypes)
      .is("archived_at", null)
      .order("room_type")
      .order("title");

    if (baseRoomsError) {
      throw baseRoomsError;
    }

    for (const room of (baseRooms ?? []) as RoomRow[]) {
      if (authorisedRoomIds.has(room.id)) {
        rooms.push(room);
        roomIds.add(room.id);
      }
    }

    if (orderId) {
      const { data: thread, error: threadError } = await admin
        .from("work_item_threads")
        .select("room_id, entity_type, entity_id")
        .eq("org_id", context.orgId)
        .eq("entity_type", "ORDER")
        .eq("entity_id", orderId)
        .maybeSingle();

      if (threadError) {
        throw threadError;
      }

      const threadRow = (thread as ThreadRow | null) ?? null;

      if (threadRow) {
        const { data: room, error: roomError } = await admin
          .from("communication_rooms")
          .select("id, title, room_type, created_at")
          .eq("org_id", context.orgId)
          .eq("id", threadRow.room_id)
          .maybeSingle();

        if (roomError) {
          throw roomError;
        }

        if (
          room &&
          authorisedRoomIds.has(threadRow.room_id) &&
          !roomIds.has(threadRow.room_id)
        ) {
          rooms.push(room as RoomRow);
          roomIds.add(threadRow.room_id);
        }

        if (authorisedRoomIds.has(threadRow.room_id)) {
          threadsByRoom.set(threadRow.room_id, threadRow);
        }
      }
    }

    if (rooms.length === 0) {
      return { ok: true, data: { context, rooms: [] } };
    }

    const { data: threadRows, error: threadRowsError } = await admin
      .from("work_item_threads")
      .select("room_id, entity_type, entity_id")
      .eq("org_id", context.orgId)
      .in("room_id", [...roomIds]);

    if (threadRowsError) {
      throw threadRowsError;
    }

    for (const thread of (threadRows ?? []) as ThreadRow[]) {
      threadsByRoom.set(thread.room_id, thread);
    }

    const { data: messages, error: messagesError } = await admin
      .from("messages")
      .select("id, room_id, body, created_at, profiles(full_name, email)")
      .eq("org_id", context.orgId)
      .in("room_id", [...roomIds])
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (messagesError) {
      throw messagesError;
    }

    const messageRows = (messages ?? []) as MessageRow[];

    return {
      ok: true,
      data: {
        context,
        rooms: rooms.map((room) => {
          const thread = threadsByRoom.get(room.id);

          return {
            id: room.id,
            title: room.title,
            roomType: room.room_type,
            threadEntityType: thread?.entity_type ?? null,
            threadEntityId: thread?.entity_id ?? null,
            messages: messageRows
              .filter((message) => message.room_id === room.id)
              .slice(-25)
              .map((message) => {
                const author = relationOne(message.profiles);

                return {
                  id: message.id,
                  body: message.body,
                  createdAt: message.created_at,
                  authorName:
                    author?.full_name || author?.email || "Flow member"
                };
              })
          };
        })
      }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function sendConnectMessage(
  input: unknown
): Promise<ServiceResult<{ messageId: string }>> {
  try {
    const parsed = sendMessageSchema.parse(input);
    await requireWorkspaceContext();
    const supabase = await createSupabaseServerClient();

    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_m3_send_message", {
      target_room_id: parsed.roomId,
      message_body: parsed.body,
      message_client_nonce: parsed.clientNonce
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as { message_id?: string } | null;

    revalidatePath("/app/connect");

    return {
      ok: true,
      data: { messageId: result?.message_id ?? "" }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}
