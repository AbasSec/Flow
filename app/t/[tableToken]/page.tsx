import type { ReactNode } from "react";
import { PublicMenuClient } from "./public-menu-client";
import { getPublicTableMenu } from "@/lib/services/public-ordering";

export const dynamic = "force-dynamic";

type TablePageProps = {
  params: Promise<{ tableToken: string }>;
};

export default async function PublicTablePage({ params }: TablePageProps) {
  const { tableToken } = await params;
  const result = await getPublicTableMenu(tableToken);

  if (!result.ok) {
    return (
      <PublicShell>
        <SafePanel title="Table link unavailable">
          This table ordering link is invalid, expired, or not accepting orders.
        </SafePanel>
      </PublicShell>
    );
  }

  const menu = result.data;

  return (
    <PublicShell>
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#66785f]">
          {menu.outletName}
        </p>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-[#17211b]">
              {menu.tableLabel}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#60685f]">
              Browse the BrewBite menu, send your order to the kitchen, then pay
              at the counter.
            </p>
          </div>
          <div className="border border-[#d8d1c1] bg-white px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.08em] text-[#66785f]">
            Pay at counter
          </div>
        </div>
      </header>
      <PublicMenuClient menu={menu} tableToken={tableToken} />
    </PublicShell>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f4ed] text-[#17211b]">
      <div className="mx-auto w-full max-w-xl px-4 py-5">{children}</div>
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
    <section className="mt-24 border border-[#d8d1c1] bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#66785f]">
        BrewBite Kitchen
      </p>
      <h1 className="mt-3 text-2xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#60685f]">{children}</p>
    </section>
  );
}
