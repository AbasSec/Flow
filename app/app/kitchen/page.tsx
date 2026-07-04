import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel, Surface } from "@/components/flow-ui";
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
      role={board.context.role}
      subtitle={
        board.canViewAllStations
          ? "Viewing all BrewBite kitchen stations."
          : "Viewing only stations assigned to your kitchen user."
      }
      title="Kitchen Board"
    >
      <AutoRefresh intervalMs={5000} />
      {board.tickets.length === 0 ? (
        <StatePanel title="No open tickets">
          Staff table orders appear after server validation. QR pay-at-counter
          orders appear only after authorised settlement and kitchen release.
        </StatePanel>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {board.tickets.map((ticket) => {
            const nextStatus = getNextKitchenStatus(ticket.status);

            return (
              <Surface className="flex min-h-[360px] flex-col p-4" key={ticket.id}>
                <div className="flex items-start justify-between gap-3 border-b border-[#ebe7dc] pb-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
                      {ticket.stationName}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">
                      Ticket {ticket.id.slice(0, 6)}
                    </h2>
                  </div>
                  <Badge tone={kitchenStatusTone(ticket.status)}>{ticket.status}</Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="border border-[#ebe7dc] bg-[#faf9f4] px-3 py-2">
                    <p className="text-xs text-[#667064]">Age</p>
                    <p className="mt-1 font-semibold">{ticket.ageMinutes} min</p>
                  </div>
                  <Link
                    className="border border-[#ebe7dc] bg-[#faf9f4] px-3 py-2 outline-none transition hover:border-[#17211b] focus-visible:ring-2 focus-visible:ring-[#17211b]"
                    href={`/app/orders/${ticket.orderId}`}
                  >
                    <p className="text-xs text-[#667064]">Linked order</p>
                    <p className="mt-1 font-semibold">Open detail</p>
                  </Link>
                </div>

                <ul className="mt-4 flex-1 space-y-2">
                  {ticket.lines.map((line) => (
                    <li
                      className="flex items-center justify-between gap-3 border-b border-[#ebe7dc] pb-2 text-sm"
                      key={line.id}
                    >
                      <span className="font-semibold">{line.itemName}</span>
                      <span className="shrink-0 border border-[#d7d2c4] bg-white px-2 py-1 font-semibold">
                        x {line.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
                {nextStatus ? (
                  <form action={transitionTicketAction} className="mt-5">
                    <input name="ticketId" type="hidden" value={ticket.id} />
                    <input name="nextStatus" type="hidden" value={nextStatus} />
                    <button
                      className="min-h-12 w-full bg-[#17211b] px-4 py-3 text-sm font-semibold text-white outline-none transition hover:bg-[#263128] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2"
                      type="submit"
                    >
                      Move to {nextStatus}
                    </button>
                  </form>
                ) : null}
              </Surface>
            );
          })}
        </section>
      )}
    </AppShell>
  );
}

function kitchenStatusTone(
  status: string
): "neutral" | "success" | "warning" | "danger" | "dark" {
  if (status === "READY" || status === "COMPLETED") {
    return "success";
  }

  if (status === "PREPARING") {
    return "warning";
  }

  if (status === "NEW") {
    return "danger";
  }

  return "neutral";
}
