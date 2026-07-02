import Link from "next/link";
import { headers } from "next/headers";
import Image from "next/image";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel } from "@/components/flow-ui";
import { formatSen } from "@/lib/format";
import { getDashboardData } from "@/lib/services/dashboard";
import { getFirstTableQrSource } from "@/lib/services/public-ordering";

export const dynamic = "force-dynamic";

function formatAge(minutes: number | null): string {
  if (minutes === null) {
    return "None";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default async function AppPage() {
  const result = await getDashboardData();

  if (!result.ok) {
    return (
      <AppShell
        subtitle="This route is limited to the owner, organisation admin, and manager demo roles."
        title="Operational Dashboard"
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

  const data = result.data;
  const tableQrSource = await getFirstTableQrSource(data.context.orgId);
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${protocol}://${host}` : "http://localhost:3000";
  const tableQrUrl = tableQrSource
    ? `${origin}/t/${tableQrSource.tableToken}`
    : null;
  const tableQrDataUrl = tableQrUrl
    ? await QRCode.toDataURL(tableQrUrl, {
        margin: 1,
        scale: 5,
        color: {
          dark: "#17211b",
          light: "#ffffff"
        }
      })
    : null;

  return (
    <AppShell
      subtitle={`${data.context.orgName} live operations. Revenue reflects PAID orders from demo manual settlement only.`}
      title="Operational Dashboard"
    >
      <AutoRefresh />
      <section className="grid gap-3 md:grid-cols-5">
        <MetricCard label="Today's orders" value={data.todayOrderCount} />
        <MetricCard label="Demo paid revenue" value={formatSen(data.todayRevenueSen)} />
        <MetricCard label="Open tickets" value={data.openKitchenTickets} />
        <MetricCard
          label="Oldest open ticket"
          value={formatAge(data.oldestOpenTicketAgeMinutes)}
        />
        <MetricCard label="Stock risks" value={data.lowStockCount} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="border border-[#d7d2c4] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent orders</h2>
            <Badge>{data.context.role}</Badge>
          </div>
          {data.recentOrders.length === 0 ? (
            <p className="mt-4 text-sm text-[#667064]">
              No orders yet. Create one from the Waiter view.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[#ebe7dc]">
              {data.recentOrders.map((order) => (
                <Link
                  className="grid gap-2 py-3 text-sm transition hover:bg-[#faf9f4] sm:grid-cols-[1fr_auto_auto]"
                  href={`/app/orders/${order.id}`}
                  key={order.id}
                >
                  <span className="font-semibold">
                    {order.tableLabel ?? "Table"} · {order.id.slice(0, 8)}
                  </span>
                  <span>{order.serviceStatus}</span>
                  <span className="font-semibold">{formatSen(order.totalSen)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="border border-[#d7d2c4] bg-white p-5">
          <h2 className="text-lg font-semibold">Activity timeline</h2>
          {data.recentActivity.length === 0 ? (
            <p className="mt-4 text-sm text-[#667064]">
              Audit activity appears here after orders, kitchen transitions,
              settlement, or messages.
            </p>
          ) : (
            <ol className="mt-4 space-y-3">
              {data.recentActivity.map((event) => (
                <li className="border-l-2 border-[#6f7f66] pl-3" key={event.id}>
                  <p className="text-sm font-semibold">{event.action}</p>
                  <p className="text-xs text-[#667064]">
                    {event.objectType} · {new Date(event.createdAt).toLocaleTimeString()}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="border border-[#d7d2c4] bg-white p-5">
        <div className="grid gap-5 md:grid-cols-[220px_1fr] md:items-center">
          <div>
            <h2 className="text-lg font-semibold">Table QR</h2>
            <p className="mt-2 text-sm leading-6 text-[#667064]">
              Demonstrate public table ordering with the seeded BrewBite table
              link. This is pay-at-counter table service, not online payment.
            </p>
          </div>
          {tableQrSource && tableQrDataUrl && tableQrUrl ? (
            <div className="grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
              <Image
                alt={`QR code for ${tableQrSource.tableLabel}`}
                className="h-40 w-40 border border-[#d7d2c4] bg-white p-2"
                height={160}
                src={tableQrDataUrl}
                unoptimized
                width={160}
              />
              <div>
                <Badge>{tableQrSource.tableLabel}</Badge>
                <p className="mt-3 break-all border border-[#ebe7dc] bg-[#faf9f4] px-3 py-2 text-sm">
                  {tableQrUrl}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#667064]">
                  Copy this link if scanning is unavailable.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#667064]">
              Apply the Milestone 4 public QR migration to generate table links.
            </p>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-[#d7d2c4] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-[#17211b]">{value}</p>
    </div>
  );
}
