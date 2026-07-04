import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasExplicitActiveSiteMembership,
  hasOrganisationWideOutletAccess
} from "@/lib/services/outlet-access-policy";

const counterService = readFileSync(
  join(process.cwd(), "lib", "services", "counter.ts"),
  "utf8"
);
const counterPage = readFileSync(
  join(process.cwd(), "app", "app", "counter", "page.tsx"),
  "utf8"
);
const counterActions = readFileSync(
  join(process.cwd(), "app", "app", "counter", "actions.ts"),
  "utf8"
);
const counterActionForm = readFileSync(
  join(process.cwd(), "app", "app", "counter", "counter-action-form.tsx"),
  "utf8"
);
const floorPage = readFileSync(
  join(process.cwd(), "app", "app", "waiter", "page.tsx"),
  "utf8"
);
const floorActions = readFileSync(
  join(process.cwd(), "app", "app", "waiter", "actions.ts"),
  "utf8"
);
const floorServeForm = readFileSync(
  join(process.cwd(), "app", "app", "waiter", "floor-serve-form.tsx"),
  "utf8"
);
const ordersSvc = readFileSync(
  join(process.cwd(), "lib", "services", "orders.ts"),
  "utf8"
);
const navSrc = readFileSync(
  join(process.cwd(), "components", "flow-ui.tsx"),
  "utf8"
);
const dashboardPage = readFileSync(
  join(process.cwd(), "app", "app", "page.tsx"),
  "utf8"
);
const orderDetailPage = readFileSync(
  join(process.cwd(), "app", "app", "orders", "[id]", "page.tsx"),
  "utf8"
);
const connectPage = readFileSync(
  join(process.cwd(), "app", "app", "connect", "page.tsx"),
  "utf8"
);
const appErrorPage = readFileSync(
  join(process.cwd(), "app", "app", "error.tsx"),
  "utf8"
);
const contextService = readFileSync(
  join(process.cwd(), "lib", "services", "context.ts"),
  "utf8"
);
const outletAccessPolicy = readFileSync(
  join(process.cwd(), "lib", "services", "outlet-access-policy.ts"),
  "utf8"
);
const proxySrc = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
const kitchenPage = readFileSync(
  join(process.cwd(), "app", "app", "kitchen", "page.tsx"),
  "utf8"
);

describe("Counter workspace access control", () => {
  it("guards counter service behind SETTLEMENT_ROLES", () => {
    expect(counterService).toContain("SETTLEMENT_ROLES");
    expect(counterService).toContain("roleIn(context.role, SETTLEMENT_ROLES)");
    expect(counterService).toContain("forbidden");
    expect(counterService).toContain("cashier, manager, admin, and owner");
  });

  it("calls requireWorkspaceContext — unauthenticated access redirects to /login", () => {
    expect(counterService).toContain("requireWorkspaceContext");
    expect(proxySrc).toContain('"/app/:path*"');
  });

  it("scopes counter queries to org_id and outlet_id — cross-outlet data cannot leak", () => {
    expect(counterService).toContain('eq("org_id", context.orgId)');
    expect(counterService).toContain('eq("outlet_id", outletId)');
    expect(counterService).toContain("getPrimaryAuthorisedOutletId");
  });

  it("uses a shared exact-outlet authority helper for admin-client reads", () => {
    expect(contextService).toContain("canAccessOutlet");
    expect(contextService).toContain("getPrimaryAuthorisedOutletId");
    expect(contextService).toContain("site_memberships");
    expect(contextService).toContain("hasOrganisationWideOutletAccess");
    expect(contextService).toContain("hasExplicitActiveSiteMembership");
    expect(ordersSvc).toContain("canAccessOutlet(context, order.outlet_id)");
  });
});

describe("Outlet access policy", () => {
  it("grants organisation-wide outlet access only to Owner and Organisation Admin", () => {
    expect(hasOrganisationWideOutletAccess("organisation_owner")).toBe(true);
    expect(hasOrganisationWideOutletAccess("organisation_admin")).toBe(true);

    for (const role of ["manager", "cashier", "waiter", "kitchen", "storekeeper"]) {
      expect(hasOrganisationWideOutletAccess(role)).toBe(false);
    }

    expect(outletAccessPolicy).toContain('role === "organisation_owner"');
    expect(outletAccessPolicy).toContain('role === "organisation_admin"');
    expect(outletAccessPolicy).not.toContain('role === "manager"');
    expect(outletAccessPolicy).not.toContain('role === "cashier"');
    expect(outletAccessPolicy).not.toContain('role === "waiter"');
    expect(outletAccessPolicy).not.toContain('role === "kitchen"');
    expect(outletAccessPolicy).not.toContain('role === "storekeeper"');
  });

  it("requires explicit active site membership for non-owner/admin outlet access", () => {
    expect(hasExplicitActiveSiteMembership("user-a", [])).toBe(false);
    expect(hasExplicitActiveSiteMembership("user-a", [{ user_id: "user-b" }])).toBe(false);
    expect(
      hasExplicitActiveSiteMembership("user-a", [
        { user_id: "user-b" },
        { user_id: "user-a" }
      ])
    ).toBe(true);
  });

  it("does not preserve an empty-site-membership legacy compatibility bypass", () => {
    expect(contextService).not.toContain("activeMemberships.length === 0");
    expect(contextService).not.toContain("activeMemberships.length === 0) {\n    return true;");
    expect(contextService).toContain(
      "return hasExplicitActiveSiteMembership(context.userId, activeMemberships);"
    );
  });

  it("keeps Counter, Floor & Service, and Order Detail behind the exact outlet guard", () => {
    expect(counterService).toContain("getPrimaryAuthorisedOutletId(context)");
    expect(ordersSvc).toContain("getPrimaryAuthorisedOutletId(context)");
    expect(ordersSvc).toContain("canAccessOutlet(context, outletId)");
    expect(ordersSvc).toContain("canAccessOutlet(context, order.outlet_id)");
  });
});

describe("Counter queue discriminators", () => {
  it("awaiting-payment queue uses RELEASE_BY_AUTHORISED_STAFF + UNPAID + NOT_RELEASED", () => {
    expect(counterService).toContain('"RELEASE_BY_AUTHORISED_STAFF"');
    expect(counterService).toContain('"UNPAID"');
    expect(counterService).toContain('"NOT_RELEASED"');
    expect(counterService).toContain("awaitingPayment");
  });

  it("paid-awaiting-release queue uses PAID + NOT_RELEASED + RELEASE_BY_AUTHORISED_STAFF", () => {
    expect(counterService).toContain('"PAID"');
    expect(counterService).toContain("paidAwaitingRelease");
    expect(counterService).toContain('"RELEASE_BY_AUTHORISED_STAFF"');
    expect(counterService).toContain('"NOT_RELEASED"');
    const queryBlock = counterService.split("getCounterData")[1];

    expect(queryBlock).toContain('"PAID"');
    expect(queryBlock).toContain('"NOT_RELEASED"');
  });

  it("does not include collection, pickup, or handoff queues in Counter", () => {
    expect(counterService).not.toContain('"counter", "online_pickup"');
    expect(counterService).not.toContain('"READY_FOR_HANDOFF"');
    expect(counterService).not.toContain("readyForCollection");
    expect(counterPage).not.toContain("Handoff — ready for collection");
    expect(counterPage).not.toContain("CounterCollectionRow");
  });

  it("both counter queues are ordered oldest-first", () => {
    const ascCount = (counterService.match(/ascending: true/g) ?? []).length;

    expect(ascCount).toBeGreaterThanOrEqual(2);
  });
});

describe("Counter actions use controlled service paths", () => {
  it("settle action delegates to settleOrderManually — no raw SQL", () => {
    expect(counterActions).toContain("settleOrderManually");
    expect(counterActions).not.toContain("supabase.from");
    expect(counterActions).not.toContain("supabase.rpc");
  });

  it("release action delegates to releaseOrderToKitchen — no raw SQL", () => {
    expect(counterActions).toContain("releaseOrderToKitchen");
    expect(counterActions).not.toContain("supabase.from");
    expect(counterActions).not.toContain("supabase.rpc");
  });

  it("counter settle action revalidates /app/counter on success", () => {
    expect(counterActions).toContain('revalidatePath("/app/counter")');
  });

  it("counter release action revalidates /app/counter and /app/kitchen on success", () => {
    expect(counterActions).toContain('revalidatePath("/app/kitchen")');
  });
});

describe("Counter page rendering", () => {
  it("counter page calls getCounterData for data access", () => {
    expect(counterPage).toContain("getCounterData");
  });

  it("counter page shows Awaiting payment section", () => {
    expect(counterPage).toContain("Awaiting payment");
    expect(counterPage).toContain("awaitingPayment");
  });

  it("counter page shows Paid — awaiting release section", () => {
    expect(counterPage).toContain("Paid — awaiting release");
    expect(counterPage).toContain("paidAwaitingRelease");
  });

  it("counter page states pickup collection is deferred without rendering a fake queue", () => {
    expect(counterPage).toContain("Pickup collection operations are not enabled");
    expect(counterPage).not.toContain("readyForCollection");
  });

  it("counter page uses CounterActionForm for inline settle and release buttons", () => {
    expect(counterPage).toContain("CounterActionForm");
    expect(counterPage).toContain('kind="settle"');
    expect(counterPage).toContain('kind="release"');
  });

  it("counter action form uses useActionState — no raw fetch or XHR", () => {
    expect(counterActionForm).toContain("useActionState");
    expect(counterActionForm).not.toContain("fetch(");
    expect(counterActionForm).not.toContain("XMLHttpRequest");
  });

  it("counter page does not expose raw database error messages", () => {
    expect(counterPage).not.toContain("error.message");
    expect(counterPage).not.toContain("throw error");
    expect(counterService).not.toContain("message: error.message");
    expect(counterService).toContain("Unable to load Counter orders right now.");
  });

  it("counter page passes role to AppShell for nav awareness", () => {
    expect(counterPage).toContain("role={context.role}");
  });
});

describe("Floor & Service page", () => {
  it("page title is Floor & Service — not Waiter", () => {
    expect(floorPage).toContain("Floor & Service");
    expect(floorPage).not.toContain("Waiter Order Entry");
  });

  it("preserves WaiterOrderClient — existing order composer is unchanged", () => {
    expect(floorPage).toContain("WaiterOrderClient");
    expect(floorPage).toContain("menuItems={menuItems}");
    expect(floorPage).toContain("tables={tables}");
  });

  it("adds ready-to-serve queue using getReadyToServeOrders", () => {
    expect(floorPage).toContain("getReadyToServeOrders");
    expect(floorPage).toContain("Ready to serve");
    expect(floorPage).toContain("readyOrders");
  });

  it("ready-to-serve queue includes FloorServeForm for mark-served action", () => {
    expect(floorPage).toContain("FloorServeForm");
  });

  it("floor page does not expose raw database error messages", () => {
    expect(floorPage).not.toContain("error.message");
    expect(floorServeForm).not.toContain("fetch(");
    expect(ordersSvc).toContain("Unable to load service orders right now.");
  });
});

describe("getReadyToServeOrders service function", () => {
  it("filters READY_FOR_HANDOFF fulfilment state", () => {
    expect(ordersSvc).toContain('"READY_FOR_HANDOFF"');
    expect(ordersSvc).toContain("getReadyToServeOrders");
  });

  it("restricts to dine-in channels only — table and qr", () => {
    const readyFn = ordersSvc.split("getReadyToServeOrders")[1].split("export")[0];

    expect(readyFn).toContain('"table", "qr"');
  });

  it("scopes query to org_id and outlet_id", () => {
    const readyFn = ordersSvc.split("getReadyToServeOrders")[1].split("export")[0];

    expect(readyFn).toContain('eq("org_id"');
    expect(readyFn).toContain('eq("outlet_id"');
    expect(readyFn).toContain("canAccessOutlet(context, outletId)");
  });

  it("order detail denies cross-outlet reads before loading related records", () => {
    const detailFn = ordersSvc.split("getOrderDetail")[1];
    const guardIndex = detailFn.indexOf("canAccessOutlet(context, order.outlet_id)");
    const linesIndex = detailFn.indexOf("order_lines");

    expect(guardIndex).toBeGreaterThan(-1);
    expect(linesIndex).toBeGreaterThan(guardIndex);
    expect(detailFn).toContain('message: "Order was not found."');
  });
});

describe("Mark served from Floor & Service", () => {
  it("markServedFromFloorAction delegates to markOrderServed — no raw RPC call", () => {
    expect(floorActions).toContain("markOrderServed");
    expect(floorActions).not.toContain("supabase.rpc");
    expect(floorActions).not.toContain("supabase.from");
  });

  it("mark served action revalidates /app/waiter", () => {
    expect(floorActions).toContain('revalidatePath("/app/waiter")');
  });

  it("markOrderServed service checks owner/admin/manager/waiter — cashier cannot mark served", () => {
    const servedFn = ordersSvc.split("markOrderServed")[1].split("export")[0];

    expect(servedFn).toContain('"waiter"');
    expect(servedFn).toContain('"organisation_owner"');
    expect(servedFn).not.toContain('"cashier"');
  });
});

describe("Navigation and role awareness", () => {
  it("nav includes Counter, Floor & Service, Kitchen, Connect", () => {
    expect(navSrc).toContain("/app/counter");
    expect(navSrc).toContain("Floor & Service");
    expect(navSrc).toContain("/app/kitchen");
    expect(navSrc).toContain("/app/connect");
  });

  it("Counter nav link is hidden when role is kitchen — kitchen users cannot see Counter", () => {
    expect(navSrc).toContain("COUNTER_VISIBLE_ROLES");
    expect(navSrc).toContain("showCounter");
    expect(navSrc).toContain("Boolean(role && COUNTER_VISIBLE_ROLES.has(role))");
    expect(navSrc).not.toContain('"kitchen"');
  });

  it("Counter nav link is hidden when role is absent or unknown", () => {
    expect(navSrc).not.toContain("!role || COUNTER_VISIBLE_ROLES.has(role)");
    expect(navSrc).toContain("Boolean(role && COUNTER_VISIBLE_ROLES.has(role))");
  });

  it("Counter nav link is visible for owner, admin, manager, cashier", () => {
    expect(navSrc).toContain('"organisation_owner"');
    expect(navSrc).toContain('"organisation_admin"');
    expect(navSrc).toContain('"manager"');
    expect(navSrc).toContain('"cashier"');
  });

  it("kitchen page passes role to AppShell — hides Counter from kitchen users in nav", () => {
    expect(kitchenPage).toContain("role={board.context.role}");
  });

  it("order detail and Connect pass role to AppShell", () => {
    expect(orderDetailPage).toContain("role={order.context.role}");
    expect(connectPage).toContain("role={result.data.context.role}");
  });

  it("waiter route is preserved at /app/waiter — existing links are not broken", () => {
    expect(navSrc).toContain('href="/app/waiter"');
  });
});

describe("Dashboard workspace routing", () => {
  it("dashboard shows Counter workspace hint for RELEASE_BY_AUTHORISED_STAFF unpaid/unreleased orders", () => {
    expect(dashboardPage).toContain("RELEASE_BY_AUTHORISED_STAFF");
    expect(dashboardPage).toContain("/app/counter");
    expect(dashboardPage).toContain("getWorkspaceHint");
  });

  it("dashboard shows Floor & Service hint for READY_FOR_HANDOFF orders", () => {
    expect(dashboardPage).toContain("READY_FOR_HANDOFF");
    expect(dashboardPage).toContain("/app/waiter");
  });

  it("dashboard shows Kitchen hint for released active kitchen work", () => {
    expect(dashboardPage).toContain('order.releaseState === "RELEASED"');
    expect(dashboardPage).toContain("/app/kitchen");
  });

  it("dashboard no-orders copy references Floor & Service", () => {
    expect(dashboardPage).toContain("Floor & Service");
    expect(dashboardPage).not.toContain("Waiter view");
  });
});

describe("Public QR and tracking pages unchanged", () => {
  it("proxy.ts matcher still covers /app/counter automatically", () => {
    expect(proxySrc).toContain('"/app/:path*"');
    expect(proxySrc).toContain("PRIVATE_PREFIX");
    expect(proxySrc).toContain("/login");
  });
});

describe("Safe error presentation", () => {
  it("protected app error boundary does not render raw error.message", () => {
    expect(appErrorPage).not.toContain("error.message");
    expect(appErrorPage).toContain("The workspace could not be loaded safely.");
  });
});
