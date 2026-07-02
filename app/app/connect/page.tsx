import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel } from "@/components/flow-ui";
import { getConnectData } from "@/lib/services/communication";
import { MessageForm } from "./message-form";

export const dynamic = "force-dynamic";

type ConnectPageProps = {
  searchParams: Promise<{ orderId?: string }>;
};

export default async function ConnectPage({ searchParams }: ConnectPageProps) {
  const params = await searchParams;
  const result = await getConnectData(params.orderId);

  if (!result.ok) {
    return (
      <AppShell
        subtitle="Flow Connect is internal operational communication only."
        title="Flow Connect"
      >
        <StatePanel title="Unavailable" tone="error">
          {result.message}
        </StatePanel>
      </AppShell>
    );
  }

  const rooms = result.data.rooms;

  return (
    <AppShell
      subtitle="Organisation Hub, one Team Room, and order-linked threads. Messages cannot mutate business state."
      title="Flow Connect"
    >
      <AutoRefresh intervalMs={6000} />
      {rooms.length === 0 ? (
        <StatePanel title="No rooms">
          Seeded Organisation Hub and Team Room are not visible for this user.
        </StatePanel>
      ) : (
        <section className="grid gap-5 lg:grid-cols-2">
          {rooms.map((room) => (
            <article className="border border-[#d7d2c4] bg-white p-5" key={room.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{room.title}</h2>
                  {room.threadEntityId ? (
                    <Link
                      className="mt-1 block text-sm font-semibold underline"
                      href={`/app/orders/${room.threadEntityId}`}
                    >
                      Linked {room.threadEntityType?.toLowerCase()} thread
                    </Link>
                  ) : (
                    <p className="mt-1 text-sm text-[#667064]">
                      Internal BrewBite room
                    </p>
                  )}
                </div>
                <Badge>{room.roomType}</Badge>
              </div>
              <div className="mt-5 max-h-[360px] space-y-3 overflow-y-auto border-y border-[#ebe7dc] py-4">
                {room.messages.length === 0 ? (
                  <p className="text-sm text-[#667064]">
                    No messages yet. Send a plain-text operational update.
                  </p>
                ) : (
                  room.messages.map((message) => (
                    <div className="bg-[#faf9f4] p-3" key={message.id}>
                      <div className="flex justify-between gap-3 text-xs text-[#667064]">
                        <span className="font-semibold">{message.authorName}</span>
                        <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                        {message.body}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <MessageForm roomId={room.id} />
            </article>
          ))}
        </section>
      )}
    </AppShell>
  );
}
