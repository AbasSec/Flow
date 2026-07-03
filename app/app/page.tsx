import Link from "next/link";
import { headers } from "next/headers";
import Image from "next/image";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel, Surface } from "@/components/flow-ui";
import { formatSen } from "@/lib/format";
import { getDashboardData } from "@/lib/services/dashboard";
import { getFirstTableQrSource } from "@/lib/services/public-ordering";

export const dynamic = "force-dynamic";
const PRODUCTION_PUBLIC_ORIGIN = "https://flow-ops-rho.vercel.app";

function formatAge(minutes: number | null): string {
  if (minutes === null) {
    return "None";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const roleLabels: Record<string, string> = {
  CASHIER: "Cashier",
  EMPLOYEE: "Employee",
  KITCHEN: "Kitchen",
  MANAGER: "Manager",
  ORGANISATION_ADMIN: "Admin",
  ORGANISATION_OWNER: "Owner",
  STOREKEEPER: "Storekeeper",
  WAITER: "Waiter"
};

const statusLabels: Record<string, string> = {
  ACCEPTED: "Accepted",
  CANCELLED: "Cancelled",
  COMPLETED: "Order complete",
  NEW: "New",
  PAID: "Paid",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED_OR_COLLECTED: "Order complete",
  SUBMITTED: "Submitted",
  UNPAID: "Unpaid"
};

const activityLabels: Record<string, string> = {
  DEMO_MANUAL_SETTLEMENT_RECORDED: "Manual settlement recorded",
  KITCHEN_TICKET_STATUS_CHANGED: "Kitchen ticket updated",
  MESSAGE_SENT: "Message sent",
  ORDER_CREATED: "Order created",
  QR_TABLE_ORDER_CREATED: "QR table order created"
};

const objectLabels: Record<string, string> = {
  audit_events: "Audit trail",
  communication_rooms: "Flow Connect",
  inventory_ledger: "Inventory movement",
  kitchen_tickets: "Kitchen operations",
  messages: "Flow Connect",
  orders: "Orders",
  outbox_events: "Notification event",
  table_sessions: "Tables"
};

function humanizeLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatRole(role: string): string {
  const normalizedRole = role.toUpperCase();

  return roleLabels[normalizedRole] ?? humanizeLabel(role);
}

function formatStatus(status: string): string {
  return statusLabels[status] ?? humanizeLabel(status);
}

function formatActivity(action: string): string {
  return activityLabels[action] ?? humanizeLabel(action);
}

function formatObjectType(objectType: string): string {
  return objectLabels[objectType] ?? humanizeLabel(objectType);
}

function getTrustedPublicOrigin(requestHeaders: { get(name: string): string | null }): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredOrigin && URL.canParse(configuredOrigin)) {
    return new URL(configuredOrigin).origin;
  }

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")) {
    return `http://${host}`;
  }

  return PRODUCTION_PUBLIC_ORIGIN;
}

function isValidPublicTableToken(token: string | null | undefined): token is string {
  return Boolean(token && /^[A-Za-z0-9_-]{32,128}$/.test(token));
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
  const origin = getTrustedPublicOrigin(requestHeaders);
  const tableQrUrl = isValidPublicTableToken(tableQrSource?.tableToken)
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
      subtitle={`${data.context.orgName} live operations. Revenue reflects paid orders recorded through manual counter settlement.`}
      title="Command Center"
    >
      <AutoRefresh />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          detail="Orders committed today"
          label="Today's orders"
          value={data.todayOrderCount}
        />
        <MetricCard
          detail="Pay-at-counter settlements"
          label="Paid revenue"
          value={formatSen(data.todayRevenueSen)}
        />
        <MetricCard
          detail="Kitchen work in progress"
          label="Open tickets"
          tone={data.openKitchenTickets > 0 ? "warning" : "neutral"}
          value={data.openKitchenTickets}
        />
        <MetricCard
          detail="Longest active kitchen wait"
          label="Oldest open ticket"
          tone={data.oldestOpenTicketAgeMinutes ? "warning" : "neutral"}
          value={formatAge(data.oldestOpenTicketAgeMinutes)}
        />
        <MetricCard
          detail="Ingredients needing attention"
          label="Stock risks"
          tone={data.lowStockCount > 0 ? "danger" : "success"}
          value={data.lowStockCount}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Surface className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
                Order flow
              </p>
              <h2 className="mt-1 text-lg font-semibold">Recent orders</h2>
            </div>
            <RoleBadge>{formatRole(data.context.role)}</RoleBadge>
          </div>
          {data.recentOrders.length === 0 ? (
            <p className="mt-4 text-sm text-[#667064]">
              No orders yet. Create one from the Waiter view.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[#ebe7dc]">
              {data.recentOrders.map((order) => (
                <Link
                  className="grid gap-2 px-2 py-3 text-sm outline-none transition hover:bg-[#faf9f4] focus-visible:ring-2 focus-visible:ring-[#17211b] sm:grid-cols-[1fr_auto_auto]"
                  href={`/app/orders/${order.id}`}
                  key={order.id}
                >
                  <span className="font-semibold">
                    {order.tableLabel ?? "Table service"}
                  </span>
                  <span className="text-[#667064]">
                    {formatStatus(order.serviceStatus)}
                  </span>
                  <span className="font-semibold">{formatSen(order.totalSen)}</span>
                </Link>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
            Evidence trail
          </p>
          <h2 className="mt-1 text-lg font-semibold">Activity timeline</h2>
          {data.recentActivity.length === 0 ? (
            <p className="mt-4 text-sm text-[#667064]">
              Audit activity appears here after orders, kitchen transitions,
              settlement, or messages.
            </p>
          ) : (
            <ol className="mt-4 space-y-3">
              {data.recentActivity.map((event) => (
                <li className="border-l-2 border-[#6f7f66] pl-3" key={event.id}>
                  <p className="text-sm font-semibold">
                    {formatActivity(event.action)}
                  </p>
                  <p className="text-xs text-[#667064]">
                    {formatObjectType(event.objectType)} -{" "}
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Surface>
      </section>

      <Surface className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-[#17211b] p-5 text-white sm:p-6">
            <Badge tone="dark">Public table ordering</Badge>
            <h2 className="mt-4 text-2xl font-semibold">Table QR</h2>
            <p className="mt-3 text-sm leading-6 text-[#dfe7da]">
              Scan to open the customer menu for one BrewBite table. Orders are
              sent to the kitchen and paid at the counter.
            </p>
          </div>
          <div>
            {tableQrSource && tableQrDataUrl && tableQrUrl ? (
              <div className="grid gap-5 p-5 sm:grid-cols-[176px_1fr] sm:items-center sm:p-6">
                <Image
                  alt={`QR code for ${tableQrSource.tableLabel}`}
                  className="h-44 w-44 border border-[#d7d2c4] bg-white p-2 shadow-sm"
                  height={176}
                  src={tableQrDataUrl}
                  unoptimized
                  width={176}
                />
                <div className="min-w-0">
                  <Badge tone="success">{tableQrSource.tableLabel}</Badge>
                  <p className="mt-3 text-sm font-semibold text-[#344033]">
                    Open customer menu
                  </p>
                  <a
                    className="mt-2 inline-flex min-h-11 max-w-full items-center border border-[#ebe7dc] bg-[#faf9f4] px-3 py-2 text-sm font-semibold text-[#263128] outline-none transition hover:border-[#17211b] focus-visible:ring-2 focus-visible:ring-[#17211b]"
                    href={tableQrUrl}
                  >
                    <span className="truncate">Open table link</span>
                  </a>
                  <p className="mt-3 text-xs leading-5 text-[#667064]">
                    Use the QR code for the live demo, or open the link on this
                    device if scanning is unavailable. The public page shows
                    only safe table, menu, and pay-at-counter context.
                  </p>
                </div>
              </div>
            ) : (
              <p className="p-5 text-sm text-[#667064] sm:p-6">
                Table QR links will appear here after the public QR migration is
                approved and applied.
              </p>
            )}
          </div>
        </div>
      </Surface>
    </AppShell>
  );
}

function MetricCard({
  detail,
  label,
  value,
  tone = "neutral"
}: {
  detail: string;
  label: string;
  value: string | number;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const accent =
    tone === "success"
      ? "border-l-[#73936a]"
      : tone === "warning"
        ? "border-l-[#d6a751]"
        : tone === "danger"
          ? "border-l-[#d98a76]"
          : "border-l-[#66785f]";

  return (
    <div className={`border border-l-4 border-[#d7d2c4] bg-white p-4 shadow-sm ${accent}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-[#17211b]">{value}</p>
      <p className="mt-2 text-xs leading-5 text-[#667064]">{detail}</p>
    </div>
  );
}

function RoleBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center border border-[#c8c1b1] bg-[#faf9f4] px-2.5 py-1 text-xs font-semibold text-[#4a5549]">
      {children}
    </span>
  );
}
