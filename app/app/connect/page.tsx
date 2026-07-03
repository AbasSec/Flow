import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel, Surface } from "@/components/flow-ui";
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
      subtitle="Internal operational rooms and order-linked threads. Messages provide context and never change business state."
      title="Flow Connect"
    >
      <AutoRefresh intervalMs={6000} />
      {rooms.length === 0 ? (
        <StatePanel title="No rooms">
          Organisation Hub and Team Room are not visible for this user.
        </StatePanel>
      ) : (
        <section className="grid gap-5 lg:grid-cols-2">
          {rooms.map((room) => (
            <Surface className="flex min-h-[520px] flex-col p-5" key={room.id}>
              <div className="flex items-start justify-between gap-3 border-b border-[#ebe7dc] pb-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
                    Internal workspace
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">{room.title}</h2>
                  {room.threadEntityId ? (
                    <Link
                      className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold underline decoration-[#9ca593] underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[#17211b]"
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
              <div className="mt-5 max-h-[360px] flex-1 space-y-3 overflow-y-auto border-b border-[#ebe7dc] pb-4">
                {room.messages.length === 0 ? (
                  <p className="border border-dashed border-[#c8c1b1] bg-[#faf9f4] p-4 text-sm leading-6 text-[#667064]">
                    No messages yet. Send a plain-text operational update.
                  </p>
                ) : (
                  room.messages.map((message) => (
                    <div className="border border-[#ebe7dc] bg-[#faf9f4] p-3" key={message.id}>
                      <div className="flex flex-wrap justify-between gap-3 text-xs text-[#667064]">
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
            </Surface>
          ))}
        </section>
      )}
    </AppShell>
  );
}
