import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { getPublicOrderStatus } from "@/lib/services/public-ordering";

export const dynamic = "force-dynamic";

type OrderStatusPageProps = {
  params: Promise<{ publicOrderId: string }>;
};

const statusCopy = {
  ACCEPTED: "Your order was accepted and sent to the kitchen.",
  PREPARING: "The kitchen is preparing your order.",
  READY: "Your order is ready. Please check with the counter.",
  SERVED: "Your order has been served.",
  COLLECTED: "Your order has been collected.",
  UNAVAILABLE: "This order cannot be completed. Please ask the counter."
} as const;
const visibleSteps = ["ACCEPTED", "PREPARING", "READY", "SERVED", "COLLECTED"] as const;

export default async function PublicOrderStatusPage({
  params
}: OrderStatusPageProps) {
  const { publicOrderId } = await params;
  const result = await getPublicOrderStatus(publicOrderId);

  if (!result.ok) {
    return (
      <PublicStatusShell>
        <StatusCard title="Order link unavailable">
          This order link is invalid, expired, or no longer available.
        </StatusCard>
      </PublicStatusShell>
    );
  }

  const status = result.data;

  return (
    <PublicStatusShell>
      <AutoRefresh intervalMs={5000} />
      <section className="border border-[#d8d1c1] bg-white shadow-sm">
        <div className="border-b border-[#ebe7dc] bg-[#17211b] px-5 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#dfe7da]">
            BrewBite Kitchen
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            {formatPublicStatus(status.status)}
          </h1>
          <p className="mt-3 text-base leading-7 text-[#dfe7da]">
            {statusCopy[status.status]}
          </p>
        </div>
        <div className="p-5">
          <StatusSteps currentStatus={status.status} />
          <div className="mt-5 grid gap-3 text-sm">
            <SafeFact label="Table" value={status.tableLabel ?? "Table"} />
            <SafeFact
              label="Submitted"
              value={new Date(status.submittedAt).toLocaleTimeString()}
            />
            <SafeFact label="Payment" value={status.paymentLabel} />
          </div>
          <p className="mt-5 border-t border-[#ebe7dc] pt-4 text-sm leading-6 text-[#60685f]">
            Payment is due at the counter. This page does not show payment
            details, staff details, internal ticket IDs, inventory, or messages.
          </p>
        </div>
      </section>
    </PublicStatusShell>
  );
}

function PublicStatusShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f5f2e9] px-4 py-5 text-[#17211b]">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] w-full max-w-xl flex-col justify-center">
        {children}
      </div>
    </main>
  );
}

function StatusCard({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-[#d8d1c1] bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#66785f]">
        BrewBite Kitchen
      </p>
      <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#60685f]">{children}</p>
    </section>
  );
}

function SafeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between border border-[#ebe7dc] bg-[#faf9f4] px-3 py-2">
      <span className="text-[#60685f]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function StatusSteps({ currentStatus }: { currentStatus: keyof typeof statusCopy }) {
  const activeIndex = visibleSteps.findIndex((step) => step === currentStatus);

  if (activeIndex === -1) {
    return (
      <div className="border border-[#d8d1c1] bg-[#fff7ed] p-3 text-sm text-[#7c2d12]">
        Please ask the counter for help with this order.
      </div>
    );
  }

  return (
    <ol className="grid gap-2">
      {visibleSteps.map((step, index) => {
        const isActive = index === activeIndex;
        const isDone = index < activeIndex;

        return (
          <li
            className={`flex items-center gap-3 border px-3 py-2 text-sm ${
              isActive || isDone
                ? "border-[#73936a] bg-[#f0f7ec] text-[#2f542c]"
                : "border-[#ebe7dc] bg-[#faf9f4] text-[#667064]"
            }`}
            key={step}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-semibold ${
                isActive || isDone ? "border-[#73936a]" : "border-[#d8d1c1]"
              }`}
            >
              {index + 1}
            </span>
            <span className="font-semibold">{formatPublicStatus(step)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function formatPublicStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
