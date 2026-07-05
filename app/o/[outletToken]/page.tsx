import type { ReactNode } from "react";
import { getPublicOutletMenu } from "@/lib/services/public-ordering";
import { PublicOutletMenuClient } from "./public-outlet-menu-client";

export const dynamic = "force-dynamic";

type OutletPageProps = {
  params: Promise<{ outletToken: string }>;
};

export default async function PublicOutletPage({ params }: OutletPageProps) {
  const { outletToken } = await params;
  const result = await getPublicOutletMenu(outletToken);

  if (!result.ok) {
    return (
      <PublicShell>
        <SafePanel title="Outlet link unavailable">
          This outlet ordering link is invalid, expired, or not currently accepting orders.
        </SafePanel>
      </PublicShell>
    );
  }

  const menu = result.data;

  return (
    <PublicShell>
      <header className="border border-[#d8d1c1] bg-white shadow-sm">
        <div className="border-b border-[#ebe7dc] bg-[#17211b] px-5 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#dfe7da]">
            {menu.outletName}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Order</h1>
        </div>
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <p className="text-sm leading-6 text-[#60685f]">
            Select your table, choose your items, and send your order to staff.
            Pay at the counter before kitchen preparation starts.
          </p>
          <div className="border border-[#d8d1c1] bg-[#faf9f4] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#66785f]">
            Pay at counter
          </div>
        </div>
      </header>
      <PublicOutletMenuClient menu={menu} outletToken={outletToken} />
    </PublicShell>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f5f2e9] text-[#17211b]">
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:py-8">{children}</div>
    </main>
  );
}

function SafePanel({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-24 border border-[#d8d1c1] bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#66785f]">
        BrewBite Kitchen
      </p>
      <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#60685f]">{children}</p>
    </section>
  );
}
