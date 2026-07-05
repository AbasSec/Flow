import Link from "next/link";
import { headers } from "next/headers";
import Image from "next/image";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel, Surface } from "@/components/flow-ui";
import { formatSen } from "@/lib/format";
import { getDashboardData } from "@/lib/services/dashboard";
import {
  getOutletLifecycleModeForContext,
  type OrderSummary
} from "@/lib/services/orders";
import { getOutletQrSource } from "@/lib/services/public-ordering";
import { LifecycleActivationPanel } from "./lifecycle-panel";

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
  const outletLifecycle =
    data.context.role === "organisation_owner"
      ? await getOutletLifecycleModeForContext(data.context).then((r) =>
          r.ok ? r.data : null
        )
      : null;
  const outletQrSource = await getOutletQrSource(data.context.orgId);
  const requestHeaders = await headers();
  const origin = getTrustedPublicOrigin(requestHeaders);
  const outletQrUrl = outletQrSource
    ? `${origin}/o/${outletQrSource.outletToken}`
    : null;
  const outletQrDataUrl = outletQrUrl
    ? await QRCode.toDataURL(outletQrUrl, {
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
      role={data.context.role}
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
              No orders yet. Create one from Floor & Service.
            </p>
          ) : (
            <div className="mt-4 divide-y divide-[#ebe7dc]">
              {data.recentOrders.map((order) => {
                const hint = getWorkspaceHint(order);

                return (
                  <div className="flex items-center" key={order.id}>
                    <Link
                      className="grid flex-1 gap-2 px-2 py-3 text-sm outline-none transition hover:bg-[#faf9f4] focus-visible:ring-2 focus-visible:ring-[#17211b] sm:grid-cols-[1fr_auto_auto]"
                      href={`/app/orders/${order.id}`}
                    >
                      <span className="font-semibold">
                        {order.tableLabel ?? "Table service"}
                      </span>
                      <span className="text-[#667064]">
                        {formatStatus(order.serviceStatus)}
                      </span>
                      <span className="font-semibold">{formatSen(order.totalSen)}</span>
                    </Link>
                    {hint && (
                      <Link
                        className="shrink-0 px-2 text-xs font-semibold text-[#5f7056] underline-offset-2 hover:underline"
                        href={hint.href}
                      >
                        {hint.label}
                      </Link>
                    )}
                  </div>
                );
              })}
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
            <Badge tone="dark">Public outlet ordering</Badge>
            <h2 className="mt-4 text-2xl font-semibold">Outlet QR</h2>
            <p className="mt-3 text-sm leading-6 text-[#dfe7da]">
              One QR for this outlet. Customers scan once, select their table,
              and place a pay-at-counter order. The server validates that the
              selected table belongs to this outlet before accepting the order.
            </p>
          </div>
          <div>
            {outletQrSource && outletQrDataUrl && outletQrUrl ? (
              <div className="grid gap-5 p-5 sm:grid-cols-[176px_1fr] sm:items-center sm:p-6">
                <Image
                  alt="Outlet ordering QR code"
                  className="h-44 w-44 border border-[#d7d2c4] bg-white p-2 shadow-sm"
                  height={176}
                  src={outletQrDataUrl}
                  unoptimized
                  width={176}
                />
                <div className="min-w-0">
                  <Badge tone="success">One QR for your outlet</Badge>
                  <p className="mt-3 text-sm font-semibold text-[#344033]">
                    Open customer ordering
                  </p>
                  <a
                    className="mt-2 inline-flex min-h-11 max-w-full items-center border border-[#ebe7dc] bg-[#faf9f4] px-3 py-2 text-sm font-semibold text-[#263128] outline-none transition hover:border-[#17211b] focus-visible:ring-2 focus-visible:ring-[#17211b]"
                    href={outletQrUrl}
                  >
                    <span className="truncate">Open outlet ordering link</span>
                  </a>
                  <p className="mt-3 text-xs leading-5 text-[#667064]">
                    Customers scan once, select their table, and order. Pay at
                    the counter before kitchen preparation starts. The public
                    page shows only safe outlet, menu, and pay-at-counter context.
                  </p>
                </div>
              </div>
            ) : (
              <p className="p-5 text-sm text-[#667064] sm:p-6">
                Outlet QR links will appear here after the V3.2 migration is
                applied.
              </p>
            )}
          </div>
        </div>
      </Surface>

      {outletLifecycle && (
        <Surface className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
            Outlet controls
          </p>
          <h2 className="mt-1 text-lg font-semibold">Lifecycle activation</h2>
          <div className="mt-4">
            <LifecycleActivationPanel
              lifecycleMode={outletLifecycle.lifecycleMode}
              outletId={outletLifecycle.outletId}
            />
          </div>
        </Surface>
      )}
    </AppShell>
  );
}

function getWorkspaceHint(order: OrderSummary): { label: string; href: string } | null {
  if (
    order.releasePolicy === "RELEASE_BY_AUTHORISED_STAFF" &&
    order.releaseState === "NOT_RELEASED"
  ) {
    return { label: "→ Counter", href: "/app/counter" };
  }

  if (order.fulfilmentState === "READY_FOR_HANDOFF") {
    return { label: "→ Floor & Service", href: "/app/waiter" };
  }

  if (
    order.releaseState === "RELEASED" &&
    order.closureState !== "COMPLETE" &&
    order.serviceStatus !== "SERVED_OR_COLLECTED" &&
    order.serviceStatus !== "COMPLETED" &&
    order.serviceStatus !== "CANCELLED"
  ) {
    return { label: "→ Kitchen", href: "/app/kitchen" };
  }

  return null;
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
