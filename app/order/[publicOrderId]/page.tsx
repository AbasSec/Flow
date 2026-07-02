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
      <section className="border border-[#d8d1c1] bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#66785f]">
          BrewBite Kitchen
        </p>
        <h1 className="mt-3 text-3xl font-semibold">{status.status}</h1>
        <p className="mt-3 text-base leading-7 text-[#4f5b50]">
          {statusCopy[status.status]}
        </p>
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
      </section>
    </PublicStatusShell>
  );
}

function PublicStatusShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f4ed] px-4 py-5 text-[#17211b]">
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
    <section className="border border-[#d8d1c1] bg-white p-5">
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
    <div className="flex items-center justify-between border border-[#ebe7dc] px-3 py-2">
      <span className="text-[#60685f]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
