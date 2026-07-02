import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel } from "@/components/flow-ui";
import { getKitchenBoard, getNextKitchenStatus } from "@/lib/services/kitchen";
import { transitionTicketAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const result = await getKitchenBoard();

  if (!result.ok) {
    return (
      <AppShell
        subtitle="Kitchen staff see assigned stations; managers can view all stations."
        title="Kitchen Board"
      >
        <StatePanel
          title={result.reason === "forbidden" ? "Forbidden" : "Unavailable"}
          tone={result.reason === "forbidden" ? "forbidden" : "error"}
        >
          {result.message}
        </StatePanel>
      </AppShell>
    );
  }

  const board = result.data;

  return (
    <AppShell
      subtitle={
        board.canViewAllStations
          ? "Viewing all seeded BrewBite stations."
          : "Viewing only stations assigned to your kitchen user."
      }
      title="Kitchen Board"
    >
      <AutoRefresh intervalMs={5000} />
      {board.tickets.length === 0 ? (
        <StatePanel title="No open tickets">
          New table orders will appear here after waiter submission.
        </StatePanel>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {board.tickets.map((ticket) => {
            const nextStatus = getNextKitchenStatus(ticket.status);

            return (
              <article className="border border-[#d7d2c4] bg-white p-4" key={ticket.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
                      {ticket.stationName}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold">
                      Ticket {ticket.id.slice(0, 8)}
                    </h2>
                  </div>
                  <Badge>{ticket.status}</Badge>
                </div>
                <p className="mt-3 text-sm text-[#667064]">
                  Age: {ticket.ageMinutes} min ·{" "}
                  <Link className="font-semibold underline" href={`/app/orders/${ticket.orderId}`}>
                    order
                  </Link>
                </p>
                <ul className="mt-4 space-y-2">
                  {ticket.lines.map((line) => (
                    <li
                      className="flex justify-between gap-3 border-b border-[#ebe7dc] pb-2 text-sm"
                      key={line.id}
                    >
                      <span>{line.itemName}</span>
                      <span className="font-semibold">× {line.quantity}</span>
                    </li>
                  ))}
                </ul>
                {nextStatus ? (
                  <form action={transitionTicketAction} className="mt-5">
                    <input name="ticketId" type="hidden" value={ticket.id} />
                    <input name="nextStatus" type="hidden" value={nextStatus} />
                    <button
                      className="w-full bg-[#17211b] px-4 py-3 text-sm font-semibold text-white"
                      type="submit"
                    >
                      Move to {nextStatus}
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </AppShell>
  );
}
